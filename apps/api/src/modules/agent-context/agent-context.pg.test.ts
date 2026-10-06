import { randomUUID } from 'node:crypto';
import { ForbiddenException } from '@nestjs/common';
import { Pool } from 'pg';
import { expect, test } from 'vitest';
import { AgentContextService } from './agent-context.service.js';

test('agent context reads evidence only under current consent and approved grant', async ({ skip }) => {
  if (!process.env.EVA_TEST_DATABASE_URL || process.env.EVA_TEST_DATABASE_ISOLATED !== '1') skip();
  const pool = new Pool({ connectionString: process.env.EVA_TEST_DATABASE_URL! });
  const service = new AgentContextService({ pool } as never);
  const userId = randomUUID();
  const ruleId = randomUUID();
  const agentId = `agent-${randomUUID()}`;
  try {
    await pool.query('INSERT INTO users (id, email) VALUES ($1, $2)', [userId, `${userId}@example.invalid`]);
    await pool.query(
      `INSERT INTO governance_rule_versions (id, rule_key, version, status)
       VALUES ($1, $2, 1, 'approved')`, [ruleId, `agent-context-${ruleId}`],
    );
    await pool.query(
      `INSERT INTO agent_scope_grants (user_id, agent_id, purpose_scope, scopes, rule_id)
       VALUES ($1, $2, 'weekly_review_analysis', ARRAY['evidence:read'], $3)`, [userId, agentId, ruleId],
    );
    await pool.query(
      `INSERT INTO consent_grants (user_id, consent_type, granted)
       VALUES ($1, 'third_party_sharing', true),
              ($1, 'weekly_review_analysis', true),
              ($1, 'evidence_collection', true)`, [userId],
    );
    await pool.query(
      `INSERT INTO evidence_events
         (user_id, source_type, dimension, explanation, portrait_status, status_rule_id,
          purpose_scope, epistemic_source, content_kind, source_independence_group, quality_metadata)
       VALUES ($1, 'diary', 'work', 'test', 'formal', $2,
               'portrait_inference', 'user_self_report', 'recalled_event', 'independent-1', '{"attribution":"self"}')`,
      [userId, ruleId],
    );

    const authorized = await service.buildAuthorizedContext(userId, agentId, 'weekly_review_analysis');
    expect(authorized.formal_evidence_summary.work.count).toBe(1);

    let evidenceReached!: () => void;
    let resumeRead!: () => void;
    const reached = new Promise<void>((resolve) => { evidenceReached = resolve; });
    const resume = new Promise<void>((resolve) => { resumeRead = resolve; });
    const pausedService = new AgentContextService({ pool: {
      connect: async () => {
        const client = await pool.connect();
        return {
          query: async (sql: string, params?: unknown[]) => {
            if (sql.includes('portrait_eligible_evidence_v2')) {
              evidenceReached();
              await resume;
            }
            return client.query(sql, params);
          },
          release: () => client.release(),
        };
      },
    } } as never);
    const reading = pausedService.buildAuthorizedContext(userId, agentId, 'weekly_review_analysis');
    await reached;
    const revoker = await pool.connect();
    try {
      const revocation = revoker.query(`UPDATE consent_grants SET granted = false, revoked_at = NOW()
        WHERE user_id = $1 AND consent_type = 'third_party_sharing'`, [userId]);
      let waitingForLock = false;
      for (let attempt = 0; attempt < 100; attempt++) {
        const state = await pool.query<{ wait_event_type: string | null }>(
          'SELECT wait_event_type FROM pg_stat_activity WHERE pid = $1', [revoker.processID],
        );
        if (state.rows[0]?.wait_event_type === 'Lock') { waitingForLock = true; break; }
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
      expect(waitingForLock).toBe(true);
      resumeRead();
      expect((await reading).formal_evidence_summary.work.count).toBe(1);
      await revocation;
    } finally {
      resumeRead();
      revoker.release();
    }
    await expect(service.buildAuthorizedContext(userId, agentId, 'weekly_review_analysis'))
      .rejects.toThrow(ForbiddenException);

    await pool.query(`UPDATE consent_grants SET granted = true, revoked_at = NULL
      WHERE user_id = $1 AND consent_type = 'third_party_sharing'`, [userId]);
    await pool.query(`UPDATE consent_grants SET granted = false, revoked_at = NOW()
      WHERE user_id = $1 AND consent_type = 'weekly_review_analysis'`, [userId]);
    await expect(service.buildAuthorizedContext(userId, agentId, 'weekly_review_analysis'))
      .rejects.toThrow(ForbiddenException);

    await pool.query(`UPDATE consent_grants SET granted = true, revoked_at = NULL
      WHERE user_id = $1 AND consent_type = 'weekly_review_analysis'`, [userId]);
    await pool.query(`UPDATE consent_grants SET granted = false, revoked_at = NOW()
      WHERE user_id = $1 AND consent_type = 'evidence_collection'`, [userId]);
    const withoutEvidence = await service.buildAuthorizedContext(userId, agentId, 'weekly_review_analysis');
    expect(withoutEvidence.formal_evidence_summary).toEqual({});
    expect(withoutEvidence.consent).toEqual({ weekly_review_analysis: true });

    await pool.query(`UPDATE consent_grants SET granted = true, revoked_at = NULL
      WHERE user_id = $1 AND consent_type = 'evidence_collection'`, [userId]);
    await pool.query('UPDATE agent_scope_grants SET revoked_at = NOW() WHERE user_id = $1', [userId]);
    await expect(service.buildAuthorizedContext(userId, agentId, 'weekly_review_analysis'))
      .rejects.toThrow(ForbiddenException);

    await pool.query('UPDATE agent_scope_grants SET revoked_at = NULL, scopes = ARRAY[]::text[] WHERE user_id = $1', [userId]);
    const withoutScope = await service.buildAuthorizedContext(userId, agentId, 'weekly_review_analysis');
    expect(withoutScope.formal_evidence_summary).toEqual({});

    await pool.query('UPDATE agent_scope_grants SET scopes = ARRAY[\'evidence:read\'] WHERE user_id = $1', [userId]);
    await pool.query("UPDATE agent_scope_grants SET expires_at = NOW() - INTERVAL '1 second' WHERE user_id = $1", [userId]);
    await expect(service.buildAuthorizedContext(userId, agentId, 'weekly_review_analysis'))
      .rejects.toThrow(ForbiddenException);

    await pool.query('UPDATE agent_scope_grants SET expires_at = NULL WHERE user_id = $1', [userId]);
    await pool.query("UPDATE governance_rule_versions SET status = 'draft' WHERE id = $1", [ruleId]);
    await expect(service.buildAuthorizedContext(userId, agentId, 'weekly_review_analysis'))
      .rejects.toThrow(ForbiddenException);
  } finally {
    await pool.query('DELETE FROM users WHERE id = $1', [userId]);
    await pool.query('DELETE FROM governance_rule_versions WHERE id = $1', [ruleId]);
    await pool.end();
  }
});
