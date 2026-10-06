import type { z } from 'zod';
import type { ReportSchema } from '@eva/core';
import type { PoolClient, QueryPool } from '../common/pool.js';
import { REPORT_CLAIMS_QUERY, type ReportClaimRow } from './report-claims.js';

function claimManifest(rows: ReportClaimRow[]): string {
  return JSON.stringify(rows.map((row) => [
    row.claim_id, row.revision_id, row.claim_text, row.evidence_ids, row.counterevidence_ids, row.limitations,
  ]));
}

async function stillCurrentClaims(client: PoolClient, userId: string, claims: ReportClaimRow[]): Promise<boolean> {
  const claimIds = claims.map((claim) => claim.claim_id);
  if (claimIds.length > 0) {
    // Lock the source graph through COMMIT so revocation cannot pass the final recheck.
    const owners = await client.query<{ id: string }>(
      `SELECT c.id FROM observation_claims c
       JOIN observation_candidates candidate ON candidate.id = c.candidate_id
       JOIN published_observation_revisions revision ON revision.candidate_id = candidate.id
       JOIN published_observations observation ON observation.current_revision_id = revision.id
       WHERE observation.user_id = $1 AND c.id = ANY($2::uuid[])
       ORDER BY observation.id, c.id
       FOR UPDATE OF observation, revision, candidate, c`,
      [userId, claimIds],
    );
    if (new Set(owners.rows.map((row) => row.id)).size !== claimIds.length) return false;

    const links = await client.query<{ evidence_event_id: string }>(
      `SELECT evidence_event_id FROM observation_claim_evidence
       WHERE claim_id = ANY($1::uuid[])
       ORDER BY evidence_event_id FOR SHARE`,
      [claimIds],
    );
    const evidenceIds = [...new Set(links.rows.map((row) => row.evidence_event_id))];
    const evidence = await client.query<{ status_rule_id: string | null }>(
      `SELECT id, status_rule_id FROM evidence_events
       WHERE id = ANY($1::uuid[]) ORDER BY id FOR SHARE`,
      [evidenceIds],
    );
    const ruleIds = [...new Set(evidence.rows.map((row) => row.status_rule_id).filter((id): id is string => Boolean(id)))];
    if (ruleIds.length > 0) {
      await client.query(
        `SELECT id FROM governance_rule_versions
         WHERE id = ANY($1::uuid[]) ORDER BY id FOR SHARE`,
        [ruleIds],
      );
    }
  }
  const current = await client.query<ReportClaimRow>(REPORT_CLAIMS_QUERY, [userId]);
  return claimManifest(current.rows) === claimManifest(claims);
}

export async function upsertReport(
  pool: QueryPool,
  reportId: string,
  conversationId: string,
  userId: string,
): Promise<{ id: string; status: string }> {
  const result = await pool.query<{ id: string; status: string }>(
    `INSERT INTO conversation_reports (id, conversation_id, user_id, status)
     SELECT $1, conversation.id, conversation.user_id, 'generating'
     FROM conversations conversation
     WHERE conversation.id = $2 AND conversation.user_id = $3
     ON CONFLICT (conversation_id) DO UPDATE
     SET status = CASE WHEN conversation_reports.status = 'completed'
                      THEN 'completed' ELSE 'generating' END,
         error_message = CASE WHEN conversation_reports.status = 'completed'
                              THEN conversation_reports.error_message ELSE NULL END,
         updated_at = NOW()
     WHERE conversation_reports.id = EXCLUDED.id AND conversation_reports.user_id = EXCLUDED.user_id
     RETURNING id, status`,
    [reportId, conversationId, userId],
  );
  if (!result.rows[0]) throw new Error('Report job does not match its conversation owner and id');
  return result.rows[0];
}

async function updateConversationState(
  client: PoolClient,
  conversationId: string,
  userId: string,
  status: 'completed' | 'failed',
  errorMessage: string,
): Promise<void> {
  const updated = await client.query<{ id: string }>(
    `UPDATE conversations
     SET meta = jsonb_set(
       COALESCE(meta, '{}'::jsonb), '{report}',
       (CASE WHEN jsonb_typeof(meta->'report') = 'object'
         THEN meta->'report' ELSE '{}'::jsonb END)
         || jsonb_build_object('status', $3::text, 'error', $4::text),
       true
     ), updated_at = NOW()
     WHERE id = $1 AND user_id = $2
     RETURNING id`,
    [conversationId, userId, status, errorMessage],
  );
  if (updated.rows.length !== 1) throw new Error('Report conversation not found');
}

export async function completeReport(
  pool: QueryPool,
  reportId: string,
  userId: string,
  data: z.infer<typeof ReportSchema>,
  claims: ReportClaimRow[],
): Promise<'completed' | 'permission_revoked' | 'sources_changed' | 'not_pending'> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const grants = await client.query<{ consent_type: string }>(
      `SELECT consent_type FROM consent_grants
       WHERE user_id = $1 AND consent_type = ANY($2::text[]) AND granted = true
       ORDER BY consent_type FOR SHARE`,
      [userId, ['report_generation', 'report_storage']],
    );
    if (grants.rows.length !== 2) {
      await client.query('ROLLBACK');
      return 'permission_revoked';
    }
    if (!await stillCurrentClaims(client, userId, claims)) {
      await client.query('ROLLBACK');
      return 'sources_changed';
    }
    const updated = await client.query<{ conversation_id: string }>(
      `UPDATE conversation_reports SET
         rt_score = $2, ic_score = $3, pa_score = $4, ar_score = $5,
         archetype_name = $6, archetype_description = $7,
         core_traits = $8, internal_tension = $9, behavior_patterns = $10,
         suggestions = $11, summary = $12, report_data = $13::jsonb,
         status = 'completed', error_message = NULL, updated_at = NOW()
       WHERE id = $1 AND user_id = $14 AND status = 'generating'
       RETURNING conversation_id`,
      [
        reportId,
        data.rtScore,
        data.icScore,
        data.paScore,
        data.arScore,
        data.archetypeName,
        data.archetypeDescription,
        data.coreTraits,
        data.internalTension,
        data.behaviorPatterns,
        data.suggestions,
        data.summary,
        JSON.stringify(data),
        userId,
      ],
    );
    if (updated.rows.length !== 1) {
      await client.query('ROLLBACK');
      return 'not_pending';
    }
    await updateConversationState(client, updated.rows[0].conversation_id, userId, 'completed', '');
    await client.query('COMMIT');
    return 'completed';
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function failReport(
  pool: QueryPool,
  reportId: string,
  userId: string,
  errorMessage: string,
): Promise<boolean> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const updated = await client.query<{ conversation_id: string }>(
      `UPDATE conversation_reports
       SET status = 'failed', error_message = $3, updated_at = NOW()
       WHERE id = $1 AND user_id = $2 AND status = 'generating'
       RETURNING conversation_id`,
      [reportId, userId, errorMessage],
    );
    if (updated.rows.length !== 1) {
      await client.query('ROLLBACK');
      return false;
    }
    await updateConversationState(client, updated.rows[0].conversation_id, userId, 'failed', errorMessage);
    await client.query('COMMIT');
    return true;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
