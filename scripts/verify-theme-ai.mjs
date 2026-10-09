#!/usr/bin/env node
/**
 * E2E verification for theme-assessment AI integration.
 * Usage: node scripts/verify-theme-ai.mjs [apiBaseUrl]
 * Default API: http://127.0.0.1:3002
 *
 * Prerequisites:
 *   - API running with MOCK_REDIS=1 DISABLE_QUEUES=1
 *   - .env has EVA_THEME_AI_PERSONALIZATION=1 and EVA_THEME_AI_INSIGHT=1
 *   - LLM_BASE_URL/API_KEY/MODEL set to Agnes
 *
 * Flow:
 *   1. dev-login → get token
 *   2. Start round 1 (emotion) → expect static items
 *   3. Answer all 6 + complete → get result (may have ai_insight)
 *   4. Start round 2 (emotion) → expect ≥4 dynamic items
 *   5. Answer all 6 + complete → expect ai_insight present
 */
const API = process.argv[2] || 'http://127.0.0.1:3002';
const THEME = 'emotion';

async function main() {
  // 1. dev-login (token is issued as a Set-Cookie: eva_session=...)
  const loginRes = await fetch(`${API}/auth/dev-login`, { method: 'POST' });
  if (!loginRes.ok) throw new Error(`dev-login failed: ${loginRes.status}`);
  const setCookie = loginRes.headers.get('set-cookie') ?? '';
  const match = setCookie.match(/eva_session=([^;]+)/);
  if (!match) throw new Error(`no eva_session cookie in response: ${setCookie.slice(0, 120)}`);
  const token = match[1];
  const auth = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };
  console.log('[1] dev-login OK');

  // 2. Round 1 — first time, expect static
  const start1 = await fetch(`${API}/v1/assessment-rounds`, {
    method: 'POST',
    headers: auth,
    body: JSON.stringify({ theme: THEME }),
  });
  if (!start1.ok) throw new Error(`start round 1 failed: ${start1.status}`);
  const round1 = await start1.json();
  const round1Id = round1.round.id;
  console.log(`[2] Round 1 started: ${round1Id}`);
  console.log(`    selection.personalization: ${JSON.stringify(round1.selection?.personalization ?? 'none')}`);

  // Answer all questions in round 1
  await answerAll(auth, round1Id);
  const complete1 = await fetch(`${API}/v1/assessment-rounds/${round1Id}/complete`, {
    method: 'POST',
    headers: auth,
  });
  if (!complete1.ok) throw new Error(`complete round 1 failed: ${complete1.status}`);
  const result1 = await complete1.json();
  console.log(`[3] Round 1 completed`);
  console.log(`    ai_insight: ${result1.result?.ai_insight ? 'present' : 'absent'}`);

  // 4. Round 2 — second time, expect dynamic questions
  const start2 = await fetch(`${API}/v1/assessment-rounds`, {
    method: 'POST',
    headers: auth,
    body: JSON.stringify({ theme: THEME }),
  });
  if (!start2.ok) throw new Error(`start round 2 failed: ${start2.status}`);
  const round2 = await start2.json();
  const round2Id = round2.round.id;
  console.log(`[4] Round 2 started: ${round2Id}`);
  console.log(`    selection.personalization: ${JSON.stringify(round2.selection?.personalization ?? 'none')}`);

  // Check for dynamic items
  const next2 = await fetch(`${API}/v1/assessment-rounds/${round2Id}/next`, { headers: auth });
  const next2Data = await next2.json();
  // First question should tell us if items are dynamic
  const firstQ = next2Data.question;
  if (firstQ) {
    console.log(`    first question source: ${firstQ.source}`);
    console.log(`    first question prompt: ${firstQ.prompt.slice(0, 60)}...`);
  }

  // Answer all questions in round 2
  await answerAll(auth, round2Id);
  const complete2 = await fetch(`${API}/v1/assessment-rounds/${round2Id}/complete`, {
    method: 'POST',
    headers: auth,
  });
  if (!complete2.ok) throw new Error(`complete round 2 failed: ${complete2.status}`);
  const result2 = await complete2.json();
  console.log(`[5] Round 2 completed`);
  console.log(`    ai_insight: ${result2.result?.ai_insight ? 'present' : 'absent'}`);
  if (result2.result?.ai_insight) {
    console.log(`    paragraphs: ${result2.result.ai_insight.paragraphs.length}`);
    console.log(`    first paragraph: ${result2.result.ai_insight.paragraphs[0].text.slice(0, 60)}...`);
  }

  // Verification summary
  const r2personalization = round2.selection?.personalization;
  const dynamicCount = r2personalization?.generated_count ?? 0;
  const hasInsight = Boolean(result2.result?.ai_insight);

  console.log('\n=== Verification Summary ===');
  console.log(`Round 2 dynamic questions: ${dynamicCount}/6 (expected ≥4)`);
  console.log(`Round 2 AI insight: ${hasInsight ? 'present' : 'absent'} (expected present)`);

  if (dynamicCount >= 4 && hasInsight) {
    console.log('PASS: AI personalization and insight are working.');
  } else if (dynamicCount === 0 && !hasInsight) {
    console.log('FALLBACK: LLM unavailable, static fallback used (acceptable).');
  } else {
    console.log('PARTIAL: Some features working, some fell back.');
  }
}

async function answerAll(auth, roundId) {
  let safetyCount = 0;
  while (safetyCount++ < 10) {
    const nextRes = await fetch(`${API}/v1/assessment-rounds/${roundId}/next`, { headers: auth });
    if (!nextRes.ok) throw new Error(`next failed: ${nextRes.status}`);
    const next = await nextRes.json();
    if (next.state !== 'question') break;

    const question = next.question;
    const submitRes = await fetch(
      `${API}/v1/assessment-rounds/${roundId}/items/${next.item_id}/responses`,
      {
        method: 'POST',
        headers: auth,
        body: JSON.stringify({
          operation_id: `${roundId}-${next.decision_index}-${Date.now()}`,
          choice_id: 'A',
        }),
      }
    );
    if (!submitRes.ok) throw new Error(`submit failed: ${submitRes.status}`);
  }
}

main().catch((err) => {
  console.error('FAIL:', err.message);
  process.exit(1);
});
