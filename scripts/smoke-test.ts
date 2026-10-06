#!/usr/bin/env bun
/**
 * EVA current-product smoke test.
 *
 * Current formal path:
 *   auth -> theme round (6-8 decisions) -> result feedback -> history -> portrait -> consent -> logout
 *
 * Run with:
 *   bun run scripts/smoke-test.ts --ci
 *   EVA_LOCAL_MOCK_LLM=1 bun run scripts/smoke-test.ts
 */

import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertLocalDatabaseUrl, verifyThemeAssessmentPersistence } from './smoke-theme-db-verification.js';

const scriptDir = dirname(fileURLToPath(import.meta.url));

const BASE = process.env.VITE_API_BASE || process.env.API_BASE || `http://localhost:${process.env.API_PORT ?? '3101'}`;
const CI_MODE = process.argv.includes('--ci');

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

async function readJsonSafe(res: Response) {
  return res.json().catch(async () => ({ message: await res.text().catch(() => res.statusText) }));
}

function extractSessionTokenFromSetCookie(rawSetCookie: string | null): string | null {
  if (!rawSetCookie) return null;
  const match = rawSetCookie.match(/(?:^|;\s*|,\s*)eva_session=([^;,\s]+)/);
  return match?.[1] ?? null;
}

async function fetchJson(
  path: string,
  opts: RequestInit = {},
  token?: string,
): Promise<{ response: Response; data: any }> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(opts.headers as Record<string, string>),
  };
  if (token) headers.Cookie = `eva_session=${token}`;
  const response = await fetch(`${BASE}${path}`, {
    ...opts,
    headers,
  });
  const data = await readJsonSafe(response);
  return { response, data };
}

async function req(path: string, opts: RequestInit = {}, token?: string) {
  const { response, data } = await fetchJson(path, opts, token);
  if (!response.ok) {
    throw new Error(`${opts.method ?? 'GET'} ${path} -> HTTP ${response.status}: ${data?.message ?? response.statusText}`);
  }
  return data;
}

async function smokeHealth() {
  console.log('  [1] health');
  const data = await req('/health');
  assert(data.status === 'ok', 'health should return ok');
}

async function smokeAuth() {
  console.log('  [2] auth');

  // Prefer dev-login for local truth runs. Falls back to OTP flow only if unavailable.
  const dev = await fetchJson('/auth/dev-login', { method: 'POST' });
  if (dev.response.ok) {
    const token = extractSessionTokenFromSetCookie(dev.response.headers.get('set-cookie'));
    assert(Boolean(token), 'dev-login should set eva_session cookie');
    return {
      token: token!,
      userId: String(dev.data.user_id),
      email: String(dev.data.email),
    };
  }

  const email = `smoke-${Date.now()}@test.eva.live`;
  const send = await fetchJson('/auth/send-code', {
    method: 'POST',
    body: JSON.stringify({ email }),
  });
  if (!send.response.ok) {
    throw new Error(`POST /auth/send-code -> HTTP ${send.response.status}: ${send.data?.message ?? send.response.statusText}`);
  }

  const token = extractSessionTokenFromSetCookie(send.response.headers.get('set-cookie'));
  if (send.data?.dev_auto_login && token) {
    return {
      token,
      userId: String(send.data.user_id),
      email,
    };
  }

  throw new Error('Local smoke requires /auth/dev-login or local dev auto login from /auth/send-code');
}

async function smokeThemeAssessment(token: string) {
  console.log('  [3] theme assessment round');
  const started = await req('/v1/assessment-rounds', {
    method: 'POST',
    body: JSON.stringify({ locale: 'zh-CN' }),
  }, token);

  const roundId = String(started?.round?.id ?? '');
  assert(Boolean(roundId), 'theme round should return round.id');
  let next = started.next;
  let answered = 0;
  while (next?.state === 'question') {
    assert(Boolean(next.item_id), 'theme question should return item_id');
    assert(Array.isArray(next.question?.options) && next.question.options.length > 0, 'theme question should expose options');
    const option = next.question.options[answered % next.question.options.length];
    next = await req(`/v1/assessment-rounds/${roundId}/items/${next.item_id}/responses`, {
      method: 'POST',
      body: JSON.stringify({
        operation_id: crypto.randomUUID(),
        choice_id: option.id,
      }),
    }, token);
    answered += 1;
    assert(answered <= 8, 'theme round should stop at eight decisions');
  }
  assert(next?.state === 'ready', 'theme round should become ready after its decisions');
  assert(answered >= 6 && answered <= 8, 'theme round should contain six to eight decisions');

  const result = await req(`/v1/assessment-rounds/${roundId}/complete`, {
    method: 'POST',
  }, token);
  assert(Boolean(result?.result_revision_id), 'theme round should publish a result revision');
  assert(result.feedback_state === 'not_responded', 'new result should have not_responded feedback state');
  assert(result.latest_feedback === null, 'new result should have no latest feedback');

  const feedbackPayload = {
    operation_id: crypto.randomUUID(),
    action: 'clarify',
    explanation: '我只在特定关系和压力水平下这样做。',
  };
  const feedback = await req(`/v1/assessment-rounds/${roundId}/result/responses`, {
    method: 'POST',
    body: JSON.stringify(feedbackPayload),
  }, token);
  assert(feedback.state === 'needs_follow_up', 'clarification should need follow-up');
  assert(feedback.replayed === false, 'first feedback write should not be replayed');

  const replay = await req(`/v1/assessment-rounds/${roundId}/result/responses`, {
    method: 'POST',
    body: JSON.stringify(feedbackPayload),
  }, token);
  assert(replay.replayed === true, 'same feedback operation should replay safely');
  assert(replay.response_id === feedback.response_id, 'replayed feedback should return the same response');

  const refreshed = await req(`/v1/assessment-rounds/${roundId}/result`, {}, token);
  assert(refreshed.feedback_state === 'needs_follow_up', 'result reread should restore feedback state');
  assert(refreshed.latest_feedback?.response_id === feedback.response_id, 'result reread should restore latest feedback');

  return {
    roundId,
    answerCount: answered,
    resultRevisionId: String(result.result_revision_id),
    feedbackResponseId: String(feedback.response_id),
    feedbackAction: String(feedback.action),
  };
}

async function smokeThemeDatabase(
  userId: string,
  theme: Awaited<ReturnType<typeof smokeThemeAssessment>>,
) {
  if (process.env.SMOKE_VERIFY_DB !== '1') return;

  const { config } = await import('dotenv');
  config({ path: `${scriptDir}/../apps/api/.env`, override: false });
  const databaseUrl = assertLocalDatabaseUrl(process.env.DATABASE_URL ?? '');
  const { default: pg } = await import('pg');
  const pool = new pg.Pool({ connectionString: databaseUrl, ssl: false });
  try {
    await verifyThemeAssessmentPersistence(pool, { userId, ...theme });
    console.log('     database persistence verified');
  } finally {
    await pool.end();
  }
}

async function smokeProfile(token: string) {
  console.log('  [4] profile history + portrait boundary');
  const me = await req('/auth/me', {}, token);
  assert(Boolean(me?.id), 'auth/me should return the authenticated user');

  const history = await req('/v1/assessment-rounds', {}, token);
  assert(Array.isArray(history), 'theme assessment history should return an array');
  assert(history.some((round: { feedback_state?: string }) => round.feedback_state === 'needs_follow_up'), 'history should expose feedback state');

  const portrait = await req('/v1/portrait/current', {}, token);
  assert(['unknown', 'available'].includes(portrait?.model_status), 'portrait should expose an explicit model status');
}

async function smokeCapture(token: string) {
  console.log('  [5] captures');
  const created = await req('/captures', {
    method: 'POST',
    body: JSON.stringify({
      entry_type: 'emotion_log',
      process_mode: 'analyze',
      modality: 'text',
      raw_text: '今天别人突然加任务时，我先停了一下，没有立刻答应，感觉压力上来了。',
      mood_label: '压力',
      mood_intensity: 4,
      local_date: new Date().toISOString().slice(0, 10),
    }),
  }, token);

  assert(Boolean(created?.capture?.id), 'captures create should return capture.id');
  assert(Array.isArray(created?.interpretations), 'captures create should return interpretations array');
  assert(created.interpretations.length >= 1, 'analyze capture should produce at least one interpretation');

  const captureId = created.capture.id as string;
  const interpretationId = created.interpretations[0].id as string;

  const confirmed = await req(`/captures/${captureId}/interpretations/${interpretationId}/confirm`, {
    method: 'POST',
  }, token);
  assert(Boolean(confirmed?.evidenceId), 'confirm interpretation should return evidenceId');

  const listed = await req('/captures?limit=5', {}, token);
  assert(Array.isArray(listed?.captures), 'GET /captures should return captures array');
  assert(listed.captures.some((item: { id: string }) => item.id === captureId), 'capture list should include created capture');
}

async function smokeConsentAndLogout(token: string) {
  console.log('  [6] consent + logout');
  const consent = await req('/consent/status', {}, token);
  assert(typeof consent === 'object' && consent !== null, 'consent/status should return object');
  await req('/auth/logout', { method: 'POST' }, token);
}

async function main() {
  console.log(`\nAther Smoke Test — BASE=${BASE}${CI_MODE ? ' [CI MODE]' : ''}\n`);

  if (CI_MODE) {
    const { spawnSync } = await import('node:child_process');
    const checks = [
      { name: 'typecheck/core', cmd: ['bun', 'x', 'tsc', '-p', 'packages/core/tsconfig.json', '--noEmit'] },
      { name: 'typecheck/api', cmd: ['bun', 'x', 'tsc', '-p', 'apps/api/tsconfig.json', '--noEmit'] },
      { name: 'typecheck/web', cmd: ['bun', 'x', 'tsc', '-p', 'apps/web/tsconfig.json', '--noEmit'] },
      { name: 'evidence-loop/preflight', cmd: ['node', 'scripts/verify-evidence-aware-loop.mjs'] },
      { name: 'build/core', cmd: ['bun', 'run', 'build:core'] },
      { name: 'build:api', cmd: ['bun', 'run', 'build:api'] },
      { name: 'build:web', cmd: ['bun', 'run', 'build:web'] },
    ];
    let allPass = true;
    for (const check of checks) {
      const result = spawnSync(check.cmd[0], check.cmd.slice(1), {
        cwd: process.cwd(),
        encoding: 'utf-8',
        timeout: 120_000,
      });
      const ok = result.status === 0;
      console.log(`[CI] ${check.name}: ${ok ? '✓' : '✗'}`);
      if (!ok) {
        if (result.stderr) console.error(result.stderr.slice(-500));
        allPass = false;
      }
    }
    process.exit(allPass ? 0 : 1);
  }

  try {
    await smokeHealth();
    const { token, email, userId } = await smokeAuth();
    console.log(`     user=${email} (${userId})`);
    const theme = await smokeThemeAssessment(token);
    await smokeThemeDatabase(userId, theme);
    await smokeProfile(token);
    await smokeCapture(token);
    await smokeConsentAndLogout(token);

    console.log('\nPASS: current-product smoke completed');
    console.log('\nCoverage:');
    console.log('  [1] health');
    console.log('  [2] auth');
    console.log('  [3] theme assessment 6-8 decisions -> result -> feedback -> reread');
    if (process.env.SMOKE_VERIFY_DB === '1') console.log('      -> local database persistence proof');
    console.log('  [4] profile history feedback state + portrait boundary');
    console.log('  [5] captures -> interpretation confirm');
    console.log('  [6] consent + logout');
  } catch (err) {
    console.error('\nFAIL:', (err as Error).message);
    process.exit(1);
  }
}

void main();
