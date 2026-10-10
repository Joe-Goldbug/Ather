// apps/api/src/modules/consent/consent.service.ts
// Consent module — GDPR / data authorization
// Phase 4 — written but marked lower priority for V2

import { BadRequestException, Injectable } from '@nestjs/common';
import { Database } from '../../common/database.js';
import { RedisService } from '../../common/redis.service.js';
import { QueueService } from '../../queue/queue.service.js';

export const CONSENT_TYPES = [
  'memory_retention', 'evidence_collection', 'report_storage', 'third_party_sharing',
  'weekly_review_analysis', 'report_generation', 'chat_history_use',
] as const;
export type ConsentType = typeof CONSENT_TYPES[number];

const PORTRAIT_OUTBOX_OWNERSHIP = `(
  aggregate_id IN (SELECT id FROM continuous_portraits WHERE user_id = $1)
  OR (event_type = 'portrait.unknown_revision_created' AND aggregate_id IN (
    SELECT revision.id FROM portrait_revisions revision
    JOIN continuous_portraits portrait ON portrait.id = revision.portrait_id
    WHERE portrait.user_id = $1
  ))
  OR (event_type = 'observation.confirmed' AND aggregate_id IN (
    SELECT revision.id FROM published_observation_revisions revision
    JOIN published_observations observation ON observation.id = revision.published_observation_id
    WHERE observation.user_id = $1
  ))
  OR (event_type IN ('correction.validation_requested', 'correction.withdraw_processed') AND aggregate_id IN (
    SELECT correction.id FROM correction_records correction
    JOIN observation_responses response ON response.id = correction.response_id
    WHERE response.user_id = $1
  ))
)`;

const BACKUP_DELETION_STATUS = {
  status: 'provider_verification_required' as const,
  maximum_retention_days: 30,
};

export function validateConsentType(value: unknown): ConsentType {
  if (typeof value !== 'string' || !CONSENT_TYPES.includes(value as ConsentType)) {
    throw new BadRequestException('Invalid consent_type');
  }
  return value as ConsentType;
}

export const RECORD_USAGE_SCOPES = ['store_only', 'analyze_permitted', 'share_permitted'] as const;
export type RecordUsageScope = typeof RECORD_USAGE_SCOPES[number];

export function validateRecordUsageScope(value: unknown): RecordUsageScope {
  if (typeof value !== 'string' || !RECORD_USAGE_SCOPES.includes(value as RecordUsageScope)) {
    throw new BadRequestException('Invalid record_usage_scope; must be store_only, analyze_permitted, or share_permitted');
  }
  return value as RecordUsageScope;
}

@Injectable()
export class ConsentService {
  constructor(
    private readonly db: Database,
    private readonly redis: RedisService,
    private readonly queues: QueueService,
  ) {}

  async grant(userId: string, consentType: ConsentType, client?: { query: (text: string, params?: unknown[]) => Promise<unknown> }): Promise<void> {
    const runner = client ?? this.db.pool;
    await runner.query(
      `INSERT INTO consent_grants (user_id, consent_type, granted)
       VALUES ($1, $2, true)
       ON CONFLICT (user_id, consent_type)
       DO UPDATE SET granted = true, granted_at = NOW(), revoked_at = NULL`,
      [userId, consentType],
    );
  }

  async revoke(userId: string, consentType: ConsentType, client?: { query: (text: string, params?: unknown[]) => Promise<unknown> }): Promise<void> {
    const runner = client ?? this.db.pool;
    await runner.query(
      `UPDATE consent_grants
       SET granted = false, revoked_at = NOW()
       WHERE user_id = $1 AND consent_type = $2`,
      [userId, consentType],
    );
  }

  async getStatus(userId: string): Promise<Record<ConsentType, boolean>> {
    const rows = await this.db.pool.query<{ consent_type: string; granted: boolean }>(
      'SELECT consent_type, granted FROM consent_grants WHERE user_id = $1',
      [userId],
    );
    const result = Object.fromEntries(CONSENT_TYPES.map((t) => [t, false])) as Record<ConsentType, boolean>;
    for (const row of rows.rows) {
      if (row.consent_type in result) {
        result[row.consent_type as ConsentType] = row.granted;
      }
    }
    return result;
  }

  async setRecordScope(userId: string, scope: RecordUsageScope): Promise<{ scope: RecordUsageScope }> {
    const client = await this.db.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`SELECT pg_advisory_xact_lock(hashtext('consent_scope:' || $1))`, [userId]);

      for (const s of RECORD_USAGE_SCOPES) {
        if (s !== scope) {
          await client.query(
            `UPDATE consent_grants SET granted = false, revoked_at = NOW() WHERE user_id = $1 AND consent_type = $2`,
            [userId, `record_scope:${s}`],
          );
        }
      }
      await client.query(
        `INSERT INTO consent_grants (user_id, consent_type, granted)
         VALUES ($1, $2, true)
         ON CONFLICT (user_id, consent_type)
         DO UPDATE SET granted = true, granted_at = NOW(), revoked_at = NULL`,
        [userId, `record_scope:${scope}`],
      );

      if (scope === 'store_only') {
        await this.grant(userId, 'memory_retention', client);
        await this.grant(userId, 'report_storage', client);
        await this.revoke(userId, 'evidence_collection', client);
        await this.revoke(userId, 'report_generation', client);
        await this.revoke(userId, 'weekly_review_analysis', client);
        await this.revoke(userId, 'chat_history_use', client);
        await this.revoke(userId, 'third_party_sharing', client);
      } else if (scope === 'analyze_permitted') {
        await this.grant(userId, 'memory_retention', client);
        await this.grant(userId, 'report_storage', client);
        await this.grant(userId, 'evidence_collection', client);
        await this.grant(userId, 'report_generation', client);
        await this.grant(userId, 'weekly_review_analysis', client);
        await this.grant(userId, 'chat_history_use', client);
        await this.revoke(userId, 'third_party_sharing', client);
      } else if (scope === 'share_permitted') {
        await this.grant(userId, 'memory_retention', client);
        await this.grant(userId, 'report_storage', client);
        await this.grant(userId, 'evidence_collection', client);
        await this.grant(userId, 'report_generation', client);
        await this.grant(userId, 'weekly_review_analysis', client);
        await this.grant(userId, 'chat_history_use', client);
        await this.grant(userId, 'third_party_sharing', client);
      }

      await client.query('COMMIT');
      return { scope };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  async getRecordScope(userId: string): Promise<{ scope: RecordUsageScope | 'unset' }> {
    const rows = await this.db.pool.query<{ consent_type: string }>(
      `SELECT consent_type FROM consent_grants WHERE user_id = $1 AND granted = true AND consent_type LIKE 'record_scope:%'`,
      [userId],
    );
    if (rows.rows.length > 0) {
      const found = rows.rows[0].consent_type.replace('record_scope:', '') as RecordUsageScope;
      if (RECORD_USAGE_SCOPES.includes(found)) {
        const status = await this.getStatus(userId);
        if (found === 'store_only') {
          const hasActiveAnalysisOrSharing = status.evidence_collection || status.report_generation ||
            status.weekly_review_analysis || status.chat_history_use || status.third_party_sharing;
          if (!hasActiveAnalysisOrSharing) {
            return { scope: 'store_only' };
          }
        } else if (found === 'analyze_permitted') {
          if (!status.third_party_sharing && status.evidence_collection && status.chat_history_use) {
            return { scope: 'analyze_permitted' };
          }
        } else if (found === 'share_permitted') {
          if (status.third_party_sharing && status.evidence_collection && status.chat_history_use) {
            return { scope: 'share_permitted' };
          }
        }
      }
    }
    return { scope: 'unset' };
  }

  async createAgentGrant(
    userId: string,
    params: {
      agentId: string;
      purposeScope: string;
      scopes: string[];
      expiresInDays?: number;
    },
  ) {
    if (!params.agentId || !params.purposeScope || !Array.isArray(params.scopes) || params.scopes.length === 0) {
      throw new BadRequestException('agentId, purposeScope, and non-empty scopes are required');
    }

    const ruleRes = await this.db.pool.query(
      `SELECT id FROM governance_rule_versions WHERE status = 'approved' ORDER BY version DESC LIMIT 1`,
    );
    const ruleId = ruleRes.rows[0]?.id;
    if (!ruleId) {
      throw new BadRequestException('No approved governance rule found');
    }

    const grantId = (await import('node:crypto')).randomUUID();
    const expiresIn = Number(params.expiresInDays) || 30;

    await this.db.pool.query(
      `INSERT INTO agent_scope_grants (id, user_id, agent_id, purpose_scope, scopes, rule_id, granted_at, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW() + ($7 || ' days')::INTERVAL)`,
      [grantId, userId, params.agentId, params.purposeScope, params.scopes, ruleId, expiresIn],
    );

    await this.grant(userId, 'third_party_sharing');
    if (CONSENT_TYPES.includes(params.purposeScope as ConsentType)) {
      await this.grant(userId, params.purposeScope as ConsentType);
    }

    return {
      receiptType: 'Eva 记录的用户授权',
      grantId,
      userId,
      agentId: params.agentId,
      purposeScope: params.purposeScope,
      scopes: params.scopes,
      grantedAt: new Date().toISOString(),
      expiresInDays: expiresIn,
      status: 'active',
      auditNotice: '该授权回执代表用户在Eva平台明确授权接收方在指定范围与期限内访问，非用户私钥签名。',
    };
  }

  async revokeAgentGrant(userId: string, grantId: string) {
    const res = await this.db.pool.query(
      `UPDATE agent_scope_grants
       SET revoked_at = NOW()
       WHERE id = $1 AND user_id = $2 AND revoked_at IS NULL
       RETURNING id, agent_id, purpose_scope, revoked_at`,
      [grantId, userId],
    );
    if (res.rows.length === 0) {
      throw new BadRequestException('Active grant not found or already revoked');
    }
    return {
      revoked: true,
      grantId,
      revokedAt: res.rows[0].revoked_at,
    };
  }

  async listAgentGrants(userId: string) {
    const res = await this.db.pool.query(
      `SELECT id, agent_id, purpose_scope, scopes, granted_at, expires_at, revoked_at,
              CASE WHEN revoked_at IS NOT NULL THEN 'revoked'
                   WHEN expires_at IS NOT NULL AND expires_at <= NOW() THEN 'expired'
                   ELSE 'active' END AS status
       FROM agent_scope_grants
       WHERE user_id = $1
       ORDER BY granted_at DESC`,
      [userId],
    );
    return res.rows;
  }

  async exportUserData(userId: string) {
    const tables = [
      'dynamic_profiles', 'evidence_events', 'assessment_runs', 'personality_snapshots',
      'shift_events', 'conversations', 'conversation_reports', 'weekly_reviews',
      'weekly_experiments', 'weekly_experiment_checkins', 'diary_entries',
      'user_corrections', 'consent_grants', 'captures', 'capture_interpretations',
      'evidence_input_archives', 'theme_assessment_rounds', 'theme_assessment_round_answers',
      'theme_assessment_result_responses', 'dynamic_script_sessions',
      'dynamic_script_generations', 'dynamic_scripts', 'pending_dynamic_script_evidence',
      'understanding_sessions', 'understanding_turns',
      'continuous_portraits', 'published_observations', 'observation_responses',
      'agent_scope_grants', 'legacy_archetype_references', 'historical_report_references',
      'product_feedback', 'product_events', 'login_events',
    ] as const;
    const related: Record<string, string> = {
      evidence_source_fragments: 'evidence_event_id IN (SELECT id FROM evidence_events WHERE user_id = $1)',
      evidence_relationships: 'from_evidence_id IN (SELECT id FROM evidence_events WHERE user_id = $1)',
      portrait_revisions: 'portrait_id IN (SELECT id FROM continuous_portraits WHERE user_id = $1)',
      portrait_dimension_states: 'portrait_revision_id IN (SELECT r.id FROM portrait_revisions r JOIN continuous_portraits p ON p.id = r.portrait_id WHERE p.user_id = $1)',
      portrait_revision_evidence: 'portrait_revision_id IN (SELECT r.id FROM portrait_revisions r JOIN continuous_portraits p ON p.id = r.portrait_id WHERE p.user_id = $1)',
      observation_selection_runs: 'portrait_revision_id IN (SELECT r.id FROM portrait_revisions r JOIN continuous_portraits p ON p.id = r.portrait_id WHERE p.user_id = $1)',
      observation_candidates: 'selection_run_id IN (SELECT s.id FROM observation_selection_runs s JOIN portrait_revisions r ON r.id = s.portrait_revision_id JOIN continuous_portraits p ON p.id = r.portrait_id WHERE p.user_id = $1)',
      observation_claims: 'candidate_id IN (SELECT c.id FROM observation_candidates c JOIN observation_selection_runs s ON s.id = c.selection_run_id JOIN portrait_revisions r ON r.id = s.portrait_revision_id JOIN continuous_portraits p ON p.id = r.portrait_id WHERE p.user_id = $1)',
      observation_claim_evidence: 'claim_id IN (SELECT c.id FROM observation_claims c JOIN observation_candidates oc ON oc.id = c.candidate_id JOIN observation_selection_runs s ON s.id = oc.selection_run_id JOIN portrait_revisions r ON r.id = s.portrait_revision_id JOIN continuous_portraits p ON p.id = r.portrait_id WHERE p.user_id = $1)',
      published_observation_revisions: 'published_observation_id IN (SELECT id FROM published_observations WHERE user_id = $1)',
      correction_records: 'response_id IN (SELECT id FROM observation_responses WHERE user_id = $1)',
      correction_record_revisions: 'correction_record_id IN (SELECT c.id FROM correction_records c JOIN observation_responses r ON r.id = c.response_id WHERE r.user_id = $1)',
      product_feedback_status_history: 'feedback_id IN (SELECT id FROM product_feedback WHERE user_id = $1)',
      admin_access_logs: 'target_user_id = $1',
      theme_assessment_round_items: 'round_id IN (SELECT id FROM theme_assessment_rounds WHERE user_id = $1)',
      theme_assessment_result_revisions: 'round_id IN (SELECT id FROM theme_assessment_rounds WHERE user_id = $1)',
      portrait_outbox: PORTRAIT_OUTBOX_OWNERSHIP,
    };
    const client = await this.db.pool.connect();
    try {
      await client.query('BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');
      const result: Record<string, unknown[]> = {};
      const user = await client.query(`SELECT id, email, name, avatar_url, memory_state,
        script_completed, entitlement_tier, anonymous_id, session_expires_at, is_synthetic,
        created_at, updated_at FROM users WHERE id = $1`, [userId]);
      result.users = user.rows;
      for (const table of tables) {
        result[table] = (await client.query(`SELECT * FROM ${table} WHERE user_id = $1`, [userId])).rows;
      }
      for (const [table, predicate] of Object.entries(related)) {
        result[table] = (await client.query(`SELECT * FROM ${table} WHERE ${predicate}`, [userId])).rows;
      }
      const audit = await client.query<{ table_name: string; old_data: Record<string, unknown> | null; new_data: Record<string, unknown> | null }>(`SELECT * FROM audit_logs
        WHERE performed_by = $1 OR old_data->>'user_id' = $1::text OR new_data->>'user_id' = $1::text
          OR (table_name = 'users' AND record_id = $1::text)`, [userId]);
      result.audit_logs = audit.rows.map((row) => {
        if (row.table_name !== 'users') return row;
        const redact = (data: Record<string, unknown> | null) => {
          if (!data) return data;
          const { session_token, email_hash, ...safe } = data;
          void session_token;
          void email_hash;
          return safe;
        };
        return { ...row, old_data: redact(row.old_data), new_data: redact(row.new_data) };
      });
      result.session_tokens = (await client.query('SELECT id, user_id, expires_at, revoked, created_at FROM session_tokens WHERE user_id = $1', [userId])).rows;
      result.email_login_challenges = (await client.query(`SELECT id, email, expires_at, attempts, consumed, created_at
        FROM email_login_challenges WHERE email = (SELECT email FROM users WHERE id = $1)`, [userId])).rows;
      result.auth_rate_limits = (await client.query(`SELECT id, identifier, action, created_at
        FROM auth_rate_limits WHERE identifier = (SELECT email FROM users WHERE id = $1)`, [userId])).rows;
      await client.query('COMMIT');
      return result;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  async deleteUserData(userId: string) {
    const client = await this.db.pool.connect();
    let failureReason = 'deletion_failed';
    try {
      await client.query('BEGIN');
      const candidate = await client.query<{ email: string }>(
        'SELECT email FROM users WHERE id = $1',
        [userId],
      );
      if (!candidate.rows[0]) {
        await client.query('COMMIT');
        return { status: 'completed' as const, deleted: true, backup_deletion: BACKUP_DELETION_STATUS };
      }
      const email = candidate.rows[0].email;
      // Auth also takes the email lock before touching the user row. Preserve
      // that order, then add the user lock used by queue admission.
      await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1::text, 0))', [email]);
      await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1::text, 0))', [userId]);
      const locked = await client.query<{ email: string }>(
        'SELECT email FROM users WHERE id = $1 FOR UPDATE',
        [userId],
      );
      if (!locked.rows[0]) {
        await client.query('COMMIT');
        return { status: 'completed' as const, deleted: true, backup_deletion: BACKUP_DELETION_STATUS };
      }
      await client.query(
        'UPDATE users SET deletion_requested_at = COALESCE(deletion_requested_at, NOW()) WHERE id = $1',
        [userId],
      );

      failureReason = 'queue_cleanup_failed';
      const queueCleanup = await this.queues.removeUserJobs(userId);
      if (queueCleanup.status === 'pending') {
        await client.query('COMMIT');
        return { status: 'pending' as const, deleted: false, active_jobs: queueCleanup.active };
      }

      failureReason = 'deletion_failed';
      // Redis must be invalidated before PG commit; failure keeps the account intact.
      await this.redis.del(`otp:${email}`, `rate_limit:otp:${email}`);
      await client.query(
        `INSERT INTO account_deletion_tombstones (user_id)
         VALUES ($1)
         ON CONFLICT (user_id) DO NOTHING`,
        [userId],
      );
      await client.query('DELETE FROM email_login_challenges WHERE email = (SELECT email FROM users WHERE id = $1)', [userId]);
      await client.query('DELETE FROM auth_rate_limits WHERE identifier = (SELECT email FROM users WHERE id = $1)', [userId]);
      await client.query('DELETE FROM evidence_input_archives WHERE user_id = $1', [userId]);
      await client.query('DELETE FROM product_feedback WHERE user_id = $1', [userId]);
      await client.query('DELETE FROM product_events WHERE user_id = $1', [userId]);
      await client.query('DELETE FROM login_events WHERE user_id = $1', [userId]);
      await client.query('DELETE FROM admin_access_logs WHERE target_user_id = $1', [userId]);
      await client.query(`DELETE FROM portrait_outbox WHERE ${PORTRAIT_OUTBOX_OWNERSHIP}`, [userId]);
      await client.query('DELETE FROM observation_responses WHERE user_id = $1', [userId]);
      await client.query('UPDATE published_observations SET current_revision_id = NULL WHERE user_id = $1', [userId]);
      await client.query('DELETE FROM published_observations WHERE user_id = $1', [userId]);
      await client.query('UPDATE continuous_portraits SET current_revision_id = NULL WHERE user_id = $1', [userId]);
      await client.query('DELETE FROM continuous_portraits WHERE user_id = $1', [userId]);
      await client.query('DELETE FROM user_corrections WHERE user_id = $1', [userId]);
      await client.query('DELETE FROM capture_interpretations WHERE user_id = $1', [userId]);
      await client.query('DELETE FROM evidence_events WHERE user_id = $1', [userId]);
      await client.query('DELETE FROM conversation_reports WHERE user_id = $1', [userId]);
      await client.query('DELETE FROM conversations WHERE user_id = $1', [userId]);
      // Remaining user-owned tables have ON DELETE CASCADE; children above must go first.
      await client.query(`DELETE FROM audit_logs
        WHERE performed_by = $1 OR old_data->>'user_id' = $1::text OR new_data->>'user_id' = $1::text
          OR (table_name = 'users' AND record_id = $1::text)`, [userId]);
      await client.query('DELETE FROM users WHERE id = $1', [userId]);
      await client.query('COMMIT');
      return { status: 'completed' as const, deleted: true, backup_deletion: BACKUP_DELETION_STATUS };
    } catch (err) {
      await client.query('ROLLBACK');
      const errorCode = typeof err === 'object' && err && 'code' in err && typeof err.code === 'string'
        ? `:${err.code}` : '';
      console.error(`[ConsentService] account deletion failed (${failureReason}${errorCode})`);
      return { status: 'failed' as const, deleted: false, reason: failureReason };
    } finally {
      client.release();
    }
  }
}
