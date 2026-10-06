// apps/api/src/modules/agent-context/agent-context.service.ts
// Agent Context API — provides structured context to external AI agents
// Phase 4 — enables third-party agents (MCP, Web3 wallets, etc.) to query user context

import { ForbiddenException, Injectable } from '@nestjs/common';
import { Database } from '../../common/database.js';
import { FORMAL_EVIDENCE_VIEW } from '../../common/formal-evidence.js';

export interface AgentContext {
  user_id: string;
  model_status: 'unknown';
  formal_evidence_summary: Record<string, { count: number; latest_at: string | null }>;
  limitations: ['目前没有已批准的正式画像规则，因此无法提供长期结论。'];
  consent: Record<string, boolean>;
}

@Injectable()
export class AgentContextService {
  constructor(private readonly db: Database) {}

  async buildAuthorizedContext(
    userId: string,
    agentId: string,
    purposeScope: string,
    // Compatibility only; authorization always comes from locked DB rows.
    _legacyConsent?: Record<string, boolean>,
  ): Promise<AgentContext> {
    if (!agentId || !['evidence_collection', 'weekly_review_analysis', 'report_generation', 'chat_history_use'].includes(purposeScope)) {
      throw new ForbiddenException({ code: 'authorization_denied' });
    }
    const client = await this.db.pool.connect();
    try {
      await client.query('BEGIN');
      // Revocation updates must wait until the authorized evidence read completes.
      const consent = await client.query<{ consent_type: string; granted: boolean; revoked_at: Date | null }>(
        `SELECT consent_type, granted, revoked_at FROM consent_grants
         WHERE user_id = $1 AND consent_type IN ('third_party_sharing', $2, 'evidence_collection')
         ORDER BY consent_type FOR SHARE`,
        [userId, purposeScope],
      );
      const active = (type: string) => consent.rows.some((row) => row.consent_type === type && row.granted && row.revoked_at === null);
      if (!active('third_party_sharing') || !active(purposeScope)) {
        throw new ForbiddenException({ code: 'authorization_denied' });
      }
      const grant = await client.query<{ scopes: string[] }>(
        `SELECT g.scopes FROM agent_scope_grants g
         JOIN governance_rule_versions r ON r.id = g.rule_id
         WHERE g.user_id = $1 AND g.agent_id = $2 AND g.purpose_scope = $3
           AND g.revoked_at IS NULL
           AND (g.expires_at IS NULL OR g.expires_at > clock_timestamp())
           AND r.status = 'approved'
         LIMIT 1 FOR SHARE OF g, r`,
        [userId, agentId, purposeScope],
      );
      if (!grant.rows[0]) throw new ForbiddenException({ code: 'authorization_denied' });
      const canReadEvidence = grant.rows[0].scopes.includes('evidence:read') && active('evidence_collection');
      const evidence = canReadEvidence ? await client.query<{ dimension: string; count: string; latest_at: string | null }>(
        `SELECT dimension, COUNT(*) AS count, MAX(created_at) AS latest_at
         FROM ${FORMAL_EVIDENCE_VIEW}
         WHERE user_id = $1
         GROUP BY dimension`,
        [userId],
      ) : { rows: [] };
      await client.query('COMMIT');
      return {
        user_id: userId,
        model_status: 'unknown',
        formal_evidence_summary: Object.fromEntries(
          evidence.rows.map((row) => [
            row.dimension,
            { count: parseInt(String(row.count), 10), latest_at: row.latest_at ?? null },
          ]),
        ),
        limitations: ['目前没有已批准的正式画像规则，因此无法提供长期结论。'],
        consent: { [purposeScope]: true, ...(canReadEvidence ? { evidence_collection: true } : {}) },
      };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
}
