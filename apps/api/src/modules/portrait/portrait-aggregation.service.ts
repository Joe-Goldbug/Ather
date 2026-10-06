import { createHash } from 'node:crypto';
import { Injectable, UnprocessableEntityException } from '@nestjs/common';
import { Database } from '../../common/database.js';
import { FORMAL_EVIDENCE_VIEW } from '../../common/formal-evidence.js';

export interface AggregatePortraitResult {
  portrait_id: string;
  revision_id: string;
  state: 'unknown';
  replayed: boolean;
}

@Injectable()
export class PortraitAggregationService {
  constructor(private readonly db: Database) {}

  /**
   * Infrastructure-only aggregation. Until a versioned aggregation contract is
   * approved, the only legal output is an immutable `unknown` revision whose
   * input manifest makes later replay and review possible.
   */
  async aggregateUnknown(
    userId: string,
    evidenceId: string,
    operationId: string,
  ): Promise<AggregatePortraitResult> {
    const client = await this.db.pool.connect();
    try {
      await client.query('BEGIN');
      const evidence = await client.query<{ id: string; dimension: string; status_rule_id: string }>(
        `SELECT id, dimension, status_rule_id
         FROM ${FORMAL_EVIDENCE_VIEW}
         WHERE id = $1 AND user_id = $2
         FOR UPDATE`,
        [evidenceId, userId],
      );
      if (!evidence.rows[0]) {
        throw new UnprocessableEntityException({ code: 'evidence_not_eligible' });
      }

      await client.query(
        `INSERT INTO continuous_portraits (user_id)
         VALUES ($1)
         ON CONFLICT (user_id) DO UPDATE SET updated_at = NOW()`,
        [userId],
      );
      const portraitResult = await client.query<{ id: string }>(
        `SELECT id FROM continuous_portraits WHERE user_id = $1 FOR UPDATE`,
        [userId],
      );
      const portraitId = portraitResult.rows[0].id;

      const replay = await client.query<{ id: string }>(
        `SELECT id FROM portrait_revisions
         WHERE portrait_id = $1 AND operation_id = $2
         LIMIT 1`,
        [portraitId, operationId],
      );
      if (replay.rows[0]) {
        await client.query('COMMIT');
        return { portrait_id: portraitId, revision_id: replay.rows[0].id, state: 'unknown', replayed: true };
      }

      const latest = await client.query<{ revision_number: number }>(
        `SELECT revision_number FROM portrait_revisions
         WHERE portrait_id = $1 ORDER BY revision_number DESC LIMIT 1`,
        [portraitId],
      );
      const manifestHash = createHash('sha256')
        .update(JSON.stringify({ portraitId, evidenceId, operationId, state: 'unknown' }))
        .digest('hex');
      const revision = await client.query<{ id: string }>(
        `INSERT INTO portrait_revisions
           (portrait_id, revision_number, operation_id, manifest_hash, state)
         VALUES ($1, $2, $3, $4, 'unknown')
         RETURNING id`,
        [portraitId, (latest.rows[0]?.revision_number ?? 0) + 1, operationId, manifestHash],
      );
      const revisionId = revision.rows[0].id;

      await client.query(
        `INSERT INTO portrait_revision_evidence
           (portrait_revision_id, evidence_event_id, dimension_key, role, input_order)
         VALUES ($1, $2, $3, 'limitation', 1)`,
        [revisionId, evidenceId, evidence.rows[0].dimension],
      );
      await client.query(
        `UPDATE continuous_portraits SET current_revision_id = $2, updated_at = NOW() WHERE id = $1`,
        [portraitId, revisionId],
      );
      await client.query(
        `INSERT INTO portrait_outbox (event_type, aggregate_id, payload_minimized)
         VALUES ('portrait.unknown_revision_created', $1, jsonb_build_object('revision_id', $1))`,
        [revisionId],
      );
      await client.query('COMMIT');
      return { portrait_id: portraitId, revision_id: revisionId, state: 'unknown', replayed: false };
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      throw error;
    } finally {
      client.release();
    }
  }
}
