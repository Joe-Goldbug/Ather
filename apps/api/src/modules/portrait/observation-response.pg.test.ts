import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { expect, test } from 'vitest';
import { ObservationResponseService } from './observation-response.service.js';
import { ObservationV1Service } from './observation-v1.service.js';
import { REPORT_CLAIMS_QUERY } from '../../queue/report-claims.js';
import { ReportService } from '../report/report.service.js';

test('observation response replay is target-bound and concurrent first submits are serialized', async ({ skip }) => {
  if (!process.env.EVA_TEST_DATABASE_URL || process.env.EVA_TEST_DATABASE_ISOLATED !== '1') skip();
  const pool = new Pool({ connectionString: process.env.EVA_TEST_DATABASE_URL! });
  const service = new ObservationResponseService({ pool } as never);
  const userId = randomUUID();
  const portraitId = randomUUID();
  const portraitRevisionId = randomUUID();
  const selectionRunId = randomUUID();
  const candidateId = randomUUID();
  const observationId = randomUUID();
  const revisionId = randomUUID();
  const otherObservationId = randomUUID();
  const operationId = randomUUID();
  const ruleId = randomUUID();
  const evidenceId = randomUUID();
  const claimId = randomUUID();
  let correctionId: string | null = null;
  try {
    await pool.query('INSERT INTO users (id, email) VALUES ($1, $2)', [userId, `${userId}@example.invalid`]);
    await pool.query('INSERT INTO continuous_portraits (id, user_id) VALUES ($1, $2)', [portraitId, userId]);
    await pool.query(
      `INSERT INTO portrait_revisions (id, portrait_id, revision_number, operation_id, manifest_hash)
       VALUES ($1, $2, 1, $3, $4)`, [portraitRevisionId, portraitId, randomUUID(), randomUUID()],
    );
    await pool.query(
      'INSERT INTO observation_selection_runs (id, portrait_revision_id, operation_id) VALUES ($1, $2, $3)',
      [selectionRunId, portraitRevisionId, randomUUID()],
    );
    await pool.query(
      `INSERT INTO observation_candidates (id, selection_run_id, candidate_key, observation_type, inclusion_status)
       VALUES ($1, $2, 'test', 'pattern', 'included')`, [candidateId, selectionRunId],
    );
    await pool.query('INSERT INTO published_observations (id, user_id) VALUES ($1, $2), ($3, $2)',
      [observationId, userId, otherObservationId]);
    await pool.query(
      `INSERT INTO published_observation_revisions
         (id, published_observation_id, revision_number, candidate_id, publication_status)
       VALUES ($1, $2, 1, $3, 'published')`, [revisionId, observationId, candidateId],
    );
    await pool.query('UPDATE published_observations SET current_revision_id = $2 WHERE id = $1', [observationId, revisionId]);
    await pool.query(
      `INSERT INTO governance_rule_versions (id, rule_key, version, status)
       VALUES ($1, $2, 1, 'approved')`, [ruleId, `observation-response-${ruleId}`],
    );
    await pool.query(
      `INSERT INTO evidence_events
         (id, user_id, source_type, dimension, explanation, portrait_status, status_rule_id,
          purpose_scope, epistemic_source, content_kind, source_independence_group, quality_metadata)
       VALUES ($1, $2, 'diary', 'work', 'test', 'formal', $3,
               'portrait_inference', 'user_self_report', 'recalled_event', $4, '{"attribution":"self"}')`,
      [evidenceId, userId, ruleId, `source-${evidenceId}`],
    );
    await pool.query(
      `INSERT INTO observation_claims (id, candidate_id, claim_key, ordinal, canonical_claim)
       VALUES ($1, $2, 'test', 1, '{"text":"原观察"}')`, [claimId, candidateId],
    );
    await pool.query(
      `INSERT INTO observation_claim_evidence (claim_id, evidence_event_id, role, ordinal)
       VALUES ($1, $2, 'support', 1)`, [claimId, evidenceId],
    );
    const observations = new ObservationV1Service({ pool } as never);
    const report = { id: randomUUID(), status: 'completed', summary: '历史原文', report_data: {
      reportVersion: 'evidence-v1', evidenceHighlights: [{
        claimId, revisionId, evidenceIds: [evidenceId], counterevidenceIds: [],
      }],
    } };
    const reports = new ReportService({} as never, { pool: {
      query: (sql: string, params?: unknown[]) => sql.includes('FROM conversation_reports WHERE id')
        ? Promise.resolve({ rows: [report] }) : pool.query(sql, params),
    } } as never);
    expect((await observations.list(userId))[0].feedback_state).toBe('uncontested');
    expect((await pool.query(REPORT_CLAIMS_QUERY, [userId])).rows).toHaveLength(1);
    expect((await reports.getReport(report.id, userId))?.current_evidence_status).toBe('not_revalidated');

    const command = { operation_id: operationId, action: 'confirm' as const };
    expect(await service.respond(userId, observationId, revisionId, command))
      .toMatchObject({ state: 'confirmed', replayed: false });
    expect(await service.respond(userId, observationId, revisionId, command))
      .toMatchObject({ state: 'confirmed', replayed: true });
    await expect(service.respond(userId, otherObservationId, revisionId, command))
      .rejects.toMatchObject({ response: { code: 'idempotency_key_reused' } });
    const count = await pool.query<{ count: string }>(
      'SELECT COUNT(*) AS count FROM observation_responses WHERE user_id = $1', [userId],
    );
    expect(count.rows[0].count).toBe('1');

    let releaseInsert!: () => void;
    let reachedInsert!: () => void;
    const insertHeld = new Promise<void>((resolve) => { releaseInsert = resolve; });
    const atInsert = new Promise<void>((resolve) => { reachedInsert = resolve; });
    const pausedService = new ObservationResponseService({ pool: {
      connect: async () => {
        const client = await pool.connect();
        return {
          query: async (sql: string, params?: unknown[]) => {
            if (sql.includes('INSERT INTO observation_responses')) {
              reachedInsert();
              await insertHeld;
            }
            return client.query(sql, params);
          },
          release: () => client.release(),
        };
      },
    } } as never);
    let secondPid: number | undefined;
    const secondService = new ObservationResponseService({ pool: {
      connect: async () => {
        const client = await pool.connect();
        secondPid = client.processID;
        return client;
      },
    } } as never);
    const concurrentCommand = { operation_id: randomUUID(), action: 'confirm' as const };
    try {
      const first = pausedService.respond(userId, observationId, revisionId, concurrentCommand);
      await atInsert;
      const second = secondService.respond(userId, observationId, revisionId, concurrentCommand);
      second.catch(() => {});
      let waitingForLock = false;
      for (let attempt = 0; attempt < 100; attempt++) {
        if (secondPid) {
          const activity = await pool.query<{ wait_event_type: string | null }>(
            'SELECT wait_event_type FROM pg_stat_activity WHERE pid = $1', [secondPid],
          );
          if (activity.rows[0]?.wait_event_type === 'Lock') { waitingForLock = true; break; }
        }
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
      expect(waitingForLock).toBe(true);
      releaseInsert();
      expect(await first).toMatchObject({ state: 'confirmed', replayed: false });
      expect(await second).toMatchObject({ state: 'confirmed', replayed: true });
      const afterConcurrent = await pool.query<{ count: string }>(
        'SELECT COUNT(*) AS count FROM observation_responses WHERE user_id = $1', [userId],
      );
      expect(afterConcurrent.rows[0].count).toBe('2');
      const outbox = await pool.query<{ count: string }>(
        "SELECT COUNT(*) AS count FROM portrait_outbox WHERE aggregate_id = $1 AND event_type = 'observation.confirmed'",
        [revisionId],
      );
      expect(outbox.rows[0].count).toBe('2');
    } finally {
      releaseInsert();
    }

    const refute = await service.respond(userId, observationId, revisionId, {
      operation_id: randomUUID(), action: 'refute', explanation: '此观察忽略了熟悉团队的情境。',
    });
    correctionId = refute.correction_id;
    expect((await observations.list(userId))[0].feedback_state).toBe('needs_follow_up');
    expect((await observations.getRationale(userId, observationId, revisionId))?.feedback_state).toBe('needs_follow_up');
    expect((await pool.query(REPORT_CLAIMS_QUERY, [userId])).rows).toHaveLength(0);
    expect((await reports.getReport(report.id, userId))?.current_evidence_status).toBe('sources_changed');

    await service.respond(userId, observationId, revisionId, { operation_id: randomUUID(), action: 'confirm' });
    expect((await observations.list(userId))[0].feedback_state).toBe('uncontested');
    expect((await observations.getRationale(userId, observationId, revisionId))?.feedback_state).toBe('uncontested');
    expect((await pool.query(REPORT_CLAIMS_QUERY, [userId])).rows).toHaveLength(1);
    expect((await reports.getReport(report.id, userId))?.current_evidence_status).toBe('not_revalidated');
    await pool.query("UPDATE evidence_events SET portrait_status = 'withdrawn' WHERE id = $1", [evidenceId]);
    expect((await reports.getReport(report.id, userId))?.current_evidence_status).toBe('sources_changed');
    await pool.query("UPDATE evidence_events SET portrait_status = 'formal' WHERE id = $1", [evidenceId]);
    expect((await reports.getReport(report.id, userId))?.current_evidence_status).toBe('not_revalidated');
  } finally {
    await pool.query("DELETE FROM portrait_outbox WHERE aggregate_id = $1 AND event_type = 'observation.confirmed'", [revisionId]);
    if (correctionId) await pool.query('DELETE FROM portrait_outbox WHERE aggregate_id = $1', [correctionId]);
    await pool.query('DELETE FROM observation_claim_evidence WHERE claim_id = $1', [claimId]);
    await pool.query('DELETE FROM observation_responses WHERE user_id = $1', [userId]);
    await pool.query('DELETE FROM users WHERE id = $1', [userId]);
    await pool.query('DELETE FROM governance_rule_versions WHERE id = $1', [ruleId]);
    await pool.end();
  }
});
