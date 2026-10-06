import { neon } from '@neondatabase/serverless';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import type {
  BatchManifest,
  BatchValidationReport,
  SingleAgentValidationResult,
  SyntheticUserAgent,
} from './types';

function getAdminDatabaseUrl(): string | null {
  return process.env.ADMIN_DATABASE_URL || process.env.DATABASE_URL || null;
}

export async function verifyBatch(
  batchId: string,
  agents: SyntheticUserAgent[],
  stateDir?: string
): Promise<BatchValidationReport> {
  const dbUrl = getAdminDatabaseUrl();
  let sql: ReturnType<typeof neon> | null = null;
  if (dbUrl) {
    try {
      sql = neon(dbUrl);
    } catch {
      sql = null;
    }
  }

  // Fetch admin snapshot from admin server if running, else direct mock/db snapshot
  let adminSnapshotUsers: Array<any> = [];
  try {
    const adminRes = await fetch('http://localhost:3102/api/snapshot', {
      headers: process.env.ADMIN_SECRET ? { 'x-admin-key': process.env.ADMIN_SECRET } : {},
    });
    if (adminRes.ok) {
      const snap = await adminRes.json();
      adminSnapshotUsers = snap.users || [];
    }
  } catch {
    // Admin server not reachable, fallback to direct DB checking
  }

  const results: SingleAgentValidationResult[] = [];

  for (const agent of agents) {
    const mismatches: string[] = [];
    let dbActual: Record<string, unknown> | undefined;
    let adminActual: Record<string, unknown> | undefined;

    const userId = agent.identity.userId;

    if (sql && userId) {
      try {
        const [userRows, roundRows, responseRows, correctionRows] = await Promise.all([
          sql`SELECT id, email, created_at FROM users WHERE id = ${userId}::uuid LIMIT 1`,
          sql`SELECT id, status, theme_lens FROM theme_assessment_rounds WHERE user_id = ${userId}::uuid`,
          sql`SELECT id, action, explanation FROM theme_assessment_result_responses WHERE user_id = ${userId}::uuid`,
          sql`SELECT id, dimension, corrected_text FROM user_corrections WHERE user_id = ${userId}::uuid`,
        ]);

        const dbUser = Array.isArray(userRows) ? userRows[0] : null;
        const rounds = Array.isArray(roundRows) ? roundRows : [];
        const responses = Array.isArray(responseRows) ? responseRows : [];
        const corrections = Array.isArray(correctionRows) ? correctionRows : [];

        const completedRounds = rounds.filter((r: any) => r.status === 'completed').length;
        const latestFeedback = responses[0]?.action || null;

        dbActual = {
          userFound: Boolean(dbUser),
          totalRounds: rounds.length,
          completedRounds,
          feedbackAction: latestFeedback,
          correctionCount: corrections.length,
        };

        if (!dbUser) {
          mismatches.push('User record not found in database');
        }

        if (agent.expectedOutcome.expectedRounds !== rounds.length) {
          mismatches.push(
            `Expected ${agent.expectedOutcome.expectedRounds} rounds in DB, but found ${rounds.length}`
          );
        }

        if (
          agent.expectedOutcome.expectedFeedbackAction &&
          agent.expectedOutcome.expectedFeedbackAction !== latestFeedback
        ) {
          mismatches.push(
            `Expected feedback action "${agent.expectedOutcome.expectedFeedbackAction}", but DB has "${latestFeedback}"`
          );
        }
      } catch (err: any) {
        mismatches.push(`Database query error: ${err.message}`);
      }
    }

    // Check Admin Snapshot
    if (adminSnapshotUsers.length > 0) {
      const adminUser = adminSnapshotUsers.find(
        (u) => u.id === userId || (u.maskedEmail && agent.identity.email.startsWith(u.maskedEmail.slice(0, 2)))
      );

      if (adminUser) {
        adminActual = {
          visibleInAdmin: true,
          stage: adminUser.stage,
          assessmentRoundCount: adminUser.assessmentRoundCount,
        };

        if (
          agent.expectedOutcome.expectedAdminStage &&
          adminUser.stage !== agent.expectedOutcome.expectedAdminStage
        ) {
          mismatches.push(
            `Admin stage expected "${agent.expectedOutcome.expectedAdminStage}", got "${adminUser.stage}"`
          );
        }
      } else if (agent.state !== 'failed') {
        adminActual = { visibleInAdmin: false };
      }
    }

    const passed = agent.state !== 'failed' && mismatches.length === 0;

    results.push({
      agentId: agent.identity.agentId,
      email: agent.identity.email,
      userId: agent.identity.userId,
      passed,
      mismatches,
      expected: agent.expectedOutcome,
      databaseActual: dbActual,
      adminActual: adminActual,
    });
  }

  const passedCount = results.filter((r) => r.passed).length;
  const failedCount = results.length - passedCount;
  const tripleConsistencyRate =
    results.length > 0 ? Math.round((passedCount / results.length) * 1000) / 10 : 0;

  const report: BatchValidationReport = {
    batchId,
    timestamp: new Date().toISOString(),
    totalAgents: results.length,
    passedCount,
    failedCount,
    tripleConsistencyRate,
    results,
  };

  if (stateDir && existsSync(stateDir)) {
    const reportPath = join(stateDir, 'report.json');
    writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf-8');
  }

  return report;
}

// Standalone CLI runner for verify
async function main() {
  const batchArg = process.argv.find((a) => a.startsWith('--batch='));
  const batchId = batchArg ? batchArg.split('=')[1] : null;

  if (!batchId) {
    console.error('❌ Please specify --batch=<batch-id>');
    process.exit(1);
  }

  const stateDir = join(process.cwd(), 'state', 'admin-agent-runs', batchId);
  const manifestPath = join(stateDir, 'manifest.json');

  if (!existsSync(manifestPath)) {
    console.error(`❌ Manifest not found at: ${manifestPath}`);
    process.exit(1);
  }

  const manifest: BatchManifest = JSON.parse(readFileSync(manifestPath, 'utf-8'));
  console.log(`🔍 Verifying batch ${batchId} (${manifest.agentIds.length} agents)...`);

  // Reconstruct agent list from manifest for verification
  const agents: SyntheticUserAgent[] = manifest.agentIds.map((id) => ({
    identity: {
      agentId: id,
      batchId,
      email: `qa+${batchId}+${id}@test.eva.local`,
      clientIp: '192.0.2.10',
    },
    persona: {} as any,
    state: 'completed',
    expectedOutcome: {} as any,
  }));

  const report = await verifyBatch(batchId, agents, stateDir);
  console.log('\n======================================================');
  console.log(`📊 Batch Verification Report: ${report.tripleConsistencyRate}% Consistency`);
  console.log(`   Passed: ${report.passedCount} / ${report.totalAgents}`);
  console.log(`   Failed: ${report.failedCount} / ${report.totalAgents}`);
  console.log('======================================================\n');
}

if (import.meta.main) {
  main().catch((err) => {
    console.error('Fatal verification error:', err);
    process.exit(1);
  });
}
