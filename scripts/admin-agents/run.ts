#!/usr/bin/env bun
/**
 * Master CLI Entry Point for EVA Admin Synthetic User Agents
 *
 * Usage:
 *   bun run admin:agents --count=10 --seed=admin-slice-v1
 *   bun run admin:agents --count=30 --seed=admin-full-v1
 */

import { existsSync, mkdirSync, appendFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type {
  SyntheticUserAgent,
  ExpectedOutcome,
  BatchManifest,
  AgentExecutionEvent,
} from './types';
import { getPersonas } from './personas';
import { AtherAgentApiClient } from './api-client';
import { verifyBatch } from './verify';

interface CliArgs {
  count: number;
  seed: string;
  batchId?: string;
  concurrency: number;
  skipVerify: boolean;
}

function parseArgs(): CliArgs {
  const args = process.argv.slice(2);
  let count = 10;
  let seed = `seed-${Date.now().toString(36)}`;
  let batchId: string | undefined;
  let concurrency = 3;
  let skipVerify = false;

  for (const arg of args) {
    if (arg.startsWith('--count=')) {
      count = Math.max(1, Math.min(50, parseInt(arg.split('=')[1], 10) || 10));
    } else if (arg.startsWith('--seed=')) {
      seed = arg.split('=')[1] || seed;
    } else if (arg.startsWith('--batch=')) {
      batchId = arg.split('=')[1];
    } else if (arg.startsWith('--concurrency=')) {
      concurrency = Math.max(1, Math.min(5, parseInt(arg.split('=')[1], 10) || 3));
    } else if (arg === '--skip-verify') {
      skipVerify = true;
    }
  }

  return { count, seed, batchId, concurrency, skipVerify };
}

async function runPreflightChecks(): Promise<boolean> {
  console.log('🔍 [Preflight 1/3] Checking environment & safety boundaries...');

  if (process.env.NODE_ENV === 'production') {
    console.error('❌ Safety Error: Synthetic agent simulation cannot run in NODE_ENV=production!');
    return false;
  }

  const apiBase = process.env.VITE_API_BASE || process.env.API_BASE || 'http://localhost:3001';
  console.log(`🔌 [Preflight 2/3] Checking EVA API reachability (${apiBase})...`);

  try {
    const res = await fetch(`${apiBase}/health`, { signal: AbortSignal.timeout(3000) });
    if (!res.ok && res.status !== 404) {
      console.warn(`⚠️ API responded with HTTP ${res.status}`);
    } else {
      console.log('✅ API service is reachable.');
    }
  } catch (err: any) {
    console.error(`❌ Preflight failed: EVA API is unreachable at ${apiBase}`);
    console.error('   Please ensure EVA API is running (e.g. bun run dev:api)');
    return false;
  }

  console.log('🛡️ [Preflight 3/3] Checking Admin snapshot endpoint...');
  try {
    const adminRes = await fetch('http://localhost:3102/api/snapshot', {
      signal: AbortSignal.timeout(3000),
    });
    if (adminRes.ok) {
      console.log('✅ Admin backend is reachable at http://localhost:3102');
    } else {
      console.log('ℹ️ Admin endpoint responded with status ' + adminRes.status);
    }
  } catch {
    console.warn('⚠️ Admin backend (:3102) is not active. Background data will be written to DB only.');
  }

  return true;
}

function computeExpectedOutcome(persona: any): ExpectedOutcome {
  switch (persona.goal) {
    case 'register-only':
      return {
        expectedRounds: 0,
        expectedAnswers: 0,
        expectedRoundStatus: 'none',
        expectedFeedbackAction: null,
        expectedAdminStage: '已注册',
      };
    case 'assessment-dropoff': {
      const dropQ = persona.dropoffQuestionOrdinal || 2;
      return {
        expectedRounds: 1,
        expectedAnswers: Math.max(0, dropQ - 1),
        expectedRoundStatus: 'in_progress',
        expectedFeedbackAction: null,
        expectedAdminStage: '测评中',
      };
    }
    case 'assessment-complete':
      return {
        expectedRounds: 1,
        expectedAnswers: 8,
        expectedRoundStatus: 'completed',
        expectedFeedbackAction: null,
        expectedAdminStage: '完成测评',
      };
    case 'confirm-result':
      return {
        expectedRounds: 1,
        expectedAnswers: 8,
        expectedRoundStatus: 'completed',
        expectedFeedbackAction: 'confirm',
        expectedAdminStage: '完成测评',
      };
    case 'partial-result':
      return {
        expectedRounds: 1,
        expectedAnswers: 8,
        expectedRoundStatus: 'completed',
        expectedFeedbackAction: 'partial',
        expectedAdminStage: '完成测评',
      };
    case 'refute-result':
      return {
        expectedRounds: 1,
        expectedAnswers: 8,
        expectedRoundStatus: 'completed',
        expectedFeedbackAction: 'refute',
        expectedAdminStage: '持续校准',
      };
    case 'clarify-result':
      return {
        expectedRounds: 1,
        expectedAnswers: 8,
        expectedRoundStatus: 'completed',
        expectedFeedbackAction: 'clarify',
        expectedAdminStage: '完成测评',
      };
    case 'returning-user':
      return {
        expectedRounds: 2,
        expectedAnswers: 16,
        expectedRoundStatus: 'completed',
        expectedFeedbackAction: null,
        expectedAdminStage: '完成测评',
      };
    default:
      return {
        expectedRounds: 1,
        expectedAnswers: 8,
        expectedRoundStatus: 'completed',
        expectedFeedbackAction: null,
        expectedAdminStage: '完成测评',
      };
  }
}

async function executeAgentJourney(
  agent: SyntheticUserAgent,
  eventsPath: string,
  failuresPath: string
): Promise<SyntheticUserAgent> {
  const client = new AtherAgentApiClient(undefined, agent.identity.clientIp);

  const logEvent = (eventType: string, payload: Record<string, unknown>) => {
    const event: AgentExecutionEvent = {
      timestamp: new Date().toISOString(),
      batchId: agent.identity.batchId,
      agentId: agent.identity.agentId,
      eventType,
      payload,
    };
    appendFileSync(eventsPath, JSON.stringify(event) + '\n', 'utf-8');
  };

  try {
    // 1. Authenticate (Unique email)
    const auth = await client.authenticate(agent.identity.email);
    agent.identity.userId = auth.userId;
    agent.identity.sessionToken = auth.token;
    agent.state = 'authenticated';
    logEvent('AUTH_SUCCESS', { userId: auth.userId, email: agent.identity.email });

    if (agent.persona.goal === 'register-only') {
      agent.state = 'completed';
      agent.actualOutcome = {
        roundIds: [],
        answeredCount: 0,
        completedRounds: 0,
        correctionCount: 0,
        adminStage: '已注册',
      };
      return agent;
    }

    // 2. Start Assessment Round
    const round1 = await client.startThemeRound(agent.persona.traits.preferredThemeLens, 'zh-CN');
    const roundId = round1.round.id;
    agent.state = 'round_started';
    logEvent('ROUND_STARTED', { roundId, theme: agent.persona.traits.preferredThemeLens });

    let next = round1.next;
    let answered = 0;
    const dropoffAt = agent.persona.dropoffQuestionOrdinal;

    while (next?.state === 'question' && next.item_id && next.question) {
      const ordinal = answered + 1;

      // Check dropoff condition
      if (dropoffAt && ordinal >= dropoffAt) {
        agent.state = 'dropped';
        logEvent('DROPOFF_TRIGGERED', { roundId, droppedAtOrdinal: ordinal });
        agent.actualOutcome = {
          roundIds: [roundId],
          answeredCount: answered,
          completedRounds: 0,
          correctionCount: 0,
          adminStage: '测评中',
        };
        return agent;
      }

      // Pick option based on persona traits
      const options = next.question.options || [];
      const choiceIndex = Math.min(options.length - 1, answered % options.length);
      const choiceId = options[choiceIndex]?.id || 'A';

      next = await client.answerThemeItem(roundId, next.item_id, choiceId);
      answered += 1;
      logEvent('ANSWER_SUBMITTED', { roundId, ordinal, choiceId });

      if (answered >= 8) break;
    }

    // 3. Complete Round
    const completeRes = await client.completeThemeRound(roundId);
    agent.state = 'completed';
    logEvent('ROUND_COMPLETED', { roundId, revisionId: completeRes.result_revision_id });

    // 4. Submit Feedback/Response if required
    const goal = agent.persona.goal;
    let feedbackAction: string | undefined;
    let correctionCount = 0;

    if (
      goal === 'confirm-result' ||
      goal === 'partial-result' ||
      goal === 'refute-result' ||
      goal === 'clarify-result'
    ) {
      const action = goal.replace('-result', '') as 'confirm' | 'partial' | 'refute' | 'clarify';
      const fb = await client.submitResultResponse(
        roundId,
        action,
        agent.persona.feedbackExplanationTemplate
      );
      feedbackAction = action;
      agent.state = 'feedback_submitted';
      logEvent('FEEDBACK_SUBMITTED', { roundId, action, responseId: fb.response_id });

      if (action === 'refute' && agent.persona.correctionText) {
        correctionCount = 1;
      }
    }

    // 5. If returning user, execute 2nd round
    let totalCompleted = 1;
    let totalAnswered = answered;
    const roundIds = [roundId];

    if (goal === 'returning-user') {
      const round2 = await client.startThemeRound('workplace', 'zh-CN');
      roundIds.push(round2.round.id);
      let next2 = round2.next;
      let ans2 = 0;
      while (next2?.state === 'question' && next2.item_id && next2.question) {
        const opts = next2.question.options || [];
        const cid = opts[ans2 % opts.length]?.id || 'B';
        next2 = await client.answerThemeItem(round2.round.id, next2.item_id, cid);
        ans2 += 1;
        if (ans2 >= 8) break;
      }
      await client.completeThemeRound(round2.round.id);
      totalCompleted = 2;
      totalAnswered += ans2;
      logEvent('ROUND_2_COMPLETED', { roundId: round2.round.id });
    }

    agent.actualOutcome = {
      roundIds,
      answeredCount: totalAnswered,
      completedRounds: totalCompleted,
      feedbackAction,
      correctionCount,
      adminStage: correctionCount > 0 ? '持续校准' : totalCompleted > 0 ? '完成测评' : '已注册',
    };

    return agent;
  } catch (err: any) {
    agent.state = 'failed';
    agent.error = err.message || String(err);
    appendFileSync(failuresPath, JSON.stringify({ agentId: agent.identity.agentId, error: agent.error }) + '\n', 'utf-8');
    return agent;
  }
}

async function main() {
  const { count, seed, batchId: inputBatchId, concurrency, skipVerify } = parseArgs();
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const batchId = inputBatchId || `admin-qa-${dateStr}-${seed.slice(-4)}`;

  console.log('===============================================================');
  console.log(`🤖 EVA Synthetic User Agents Runner (Batch: ${batchId})`);
  console.log(`   Target Count: ${count} | Seed: ${seed} | Concurrency: ${concurrency}`);
  console.log('===============================================================\n');

  const preflightOk = await runPreflightChecks();
  if (!preflightOk) {
    process.exit(1);
  }

  // Setup state directory
  const stateDir = join(process.cwd(), 'state', 'admin-agent-runs', batchId);
  mkdirSync(stateDir, { recursive: true });

  const eventsPath = join(stateDir, 'events.jsonl');
  const failuresPath = join(stateDir, 'failures.jsonl');
  const manifestPath = join(stateDir, 'manifest.json');

  // Select personas and build agents
  const personas = getPersonas(count, seed);
  const ipPool = ['192.0.2.10', '192.0.2.22', '198.51.100.15', '203.0.113.8'];

  const agents: SyntheticUserAgent[] = personas.map((persona, index) => {
    const seq = String(index + 1).padStart(3, '0');
    const agentId = `${persona.id}-${seq}`;
    const email = `qa+${batchId}+${persona.id}+${seq}@test.eva.local`;
    const clientIp = ipPool[index % ipPool.length] || '192.0.2.10';

    return {
      identity: {
        agentId,
        batchId,
        email,
        clientIp,
      },
      persona,
      state: 'pending',
      expectedOutcome: computeExpectedOutcome(persona),
    };
  });

  const manifest: BatchManifest = {
    batchId,
    seed,
    targetCount: count,
    createdAt: new Date().toISOString(),
    agentIds: agents.map((a) => a.identity.agentId),
    expectedSummary: {
      totalUsers: count,
      registeredOnly: agents.filter((a) => a.persona.goal === 'register-only').length,
      dropoff: agents.filter((a) => a.persona.goal === 'assessment-dropoff').length,
      completed: agents.filter((a) => a.persona.goal !== 'register-only' && a.persona.goal !== 'assessment-dropoff').length,
      confirmed: agents.filter((a) => a.persona.goal === 'confirm-result').length,
      partial: agents.filter((a) => a.persona.goal === 'partial-result').length,
      refuted: agents.filter((a) => a.persona.goal === 'refute-result').length,
      clarified: agents.filter((a) => a.persona.goal === 'clarify-result').length,
      returning: agents.filter((a) => a.persona.goal === 'returning-user').length,
    },
  };

  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf-8');

  console.log(`\n🚀 Launching ${agents.length} Synthetic User Agents (concurrency = ${concurrency})...\n`);

  // Execute agents with concurrency window
  const results: SyntheticUserAgent[] = [];
  for (let i = 0; i < agents.length; i += concurrency) {
    const chunk = agents.slice(i, i + concurrency);
    const chunkResults = await Promise.all(
      chunk.map((agent, chunkIndex) => {
        const idx = i + chunkIndex + 1;
        process.stdout.write(`  [${idx}/${agents.length}] Spawning Agent "${agent.persona.name}" (${agent.identity.agentId})...\n`);
        return executeAgentJourney(agent, eventsPath, failuresPath);
      })
    );
    results.push(...chunkResults);
  }

  const successCount = results.filter((r) => r.state !== 'failed').length;
  const failureCount = results.length - successCount;

  console.log('\n---------------------------------------------------------------');
  console.log(`✨ Agent Journeys Finished: ${successCount} Successful, ${failureCount} Failed`);
  console.log('---------------------------------------------------------------\n');

  if (!skipVerify) {
    console.log('🔍 Executing Triple-Consistency Verification (Manifest ≡ Database ≡ Admin Snapshot)...');
    const report = await verifyBatch(batchId, results, stateDir);

    console.log('\n===============================================================');
    console.log(`📊 FINAL REPORT: ${report.tripleConsistencyRate}% Consistency Rate`);
    console.log(`   Total: ${report.totalAgents} | Passed: ${report.passedCount} | Failed: ${report.failedCount}`);
    console.log(`   Saved to: ${join(stateDir, 'report.json')}`);
    console.log('===============================================================\n');

    if (report.tripleConsistencyRate < 100) {
      console.warn('⚠️ Some consistency mismatches were detected. Inspect report.json for details.');
    } else {
      console.log('🎉 100% Triple Consistency Achieved! All agents verified across DB and Admin.');
    }
  }
}

main().catch((err) => {
  console.error('Fatal execution error in master runner:', err);
  process.exit(1);
});
