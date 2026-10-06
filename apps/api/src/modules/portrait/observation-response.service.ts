import { createHash, randomUUID } from 'node:crypto';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { Injectable } from '@nestjs/common';
import { Database } from '../../common/database.js';

export type ObservationResponseAction = 'confirm' | 'partial' | 'refute' | 'clarify';

export interface ObservationResponseCommand {
  operation_id: string;
  action: ObservationResponseAction;
  explanation?: string;
}

export interface ObservationResponseResult {
  response_id: string;
  correction_id: string | null;
  state: 'recorded' | 'confirmed' | 'pending_validation';
  replayed: boolean;
}

const ACTIONS = new Set<ObservationResponseAction>(['confirm', 'partial', 'refute', 'clarify']);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function fingerprint(command: ObservationResponseCommand) {
  return createHash('sha256')
    .update(JSON.stringify({ action: command.action, explanation: command.explanation?.trim() ?? '' }))
    .digest('hex');
}

@Injectable()
export class ObservationResponseService {
  constructor(private readonly db: Database) {}

  async respond(
    userId: string,
    observationId: string,
    revisionId: string,
    command: ObservationResponseCommand,
  ): Promise<ObservationResponseResult> {
    if (!UUID.test(command.operation_id) || !ACTIONS.has(command.action)) {
      throw new BadRequestException({ code: 'invalid_response_command' });
    }

    const requestFingerprint = fingerprint(command);
    const client = await this.db.pool.connect();
    try {
      await client.query('BEGIN');

      // Serialize this user's first submission before checking the idempotency key.
      await client.query('SELECT id FROM users WHERE id = $1 FOR UPDATE', [userId]);

      const replay = await client.query<{
        id: string;
        request_fingerprint: string;
        action: ObservationResponseAction;
        published_observation_revision_id: string;
        published_observation_id: string;
      }>(
        `SELECT response.id, response.request_fingerprint, response.action,
                response.published_observation_revision_id, revision.published_observation_id
         FROM observation_responses response
         JOIN published_observation_revisions revision
           ON revision.id = response.published_observation_revision_id
         WHERE response.user_id = $1 AND response.operation_id = $2
         FOR UPDATE OF response`,
        [userId, command.operation_id],
      );
      if (replay.rows[0]) {
        const existing = replay.rows[0];
        if (existing.request_fingerprint !== requestFingerprint || existing.action !== command.action
          || existing.published_observation_revision_id !== revisionId
          || existing.published_observation_id !== observationId) {
          throw new ConflictException({ code: 'idempotency_key_reused' });
        }
        const correction = await client.query<{ id: string; state: string }>(
          `SELECT id, state FROM correction_records WHERE response_id = $1 LIMIT 1`,
          [existing.id],
        );
        await client.query('COMMIT');
        return {
          response_id: existing.id,
          correction_id: correction.rows[0]?.id ?? null,
          state: correction.rows[0] ? 'pending_validation' : existing.action === 'confirm' ? 'confirmed' : 'recorded',
          replayed: true,
        };
      }

      const target = await client.query<{ id: string }>(
        `SELECT r.id
         FROM published_observation_revisions r
         JOIN published_observations o ON o.id = r.published_observation_id
         WHERE o.id = $1
           AND r.id = $2
           AND o.user_id = $3
           AND r.publication_status = 'published'
         FOR UPDATE OF r`,
        [observationId, revisionId, userId],
      );
      if (!target.rows[0]) {
        throw new NotFoundException({ code: 'authorization_denied' });
      }

      const responseId = randomUUID();
      await client.query(
        `INSERT INTO observation_responses
           (id, user_id, published_observation_revision_id, operation_id, request_fingerprint, action, explanation, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, clock_timestamp())`,
        [responseId, userId, revisionId, command.operation_id, requestFingerprint, command.action, command.explanation?.trim() || null],
      );

      if (command.action === 'confirm') {
        // 1-5：confirm 不再静默——同事务写入 outbox 事件，供下游消费。
        // （置信度加权等实质效果属 D-3 产品决策，此处保证事件可见、有序、可重放）
        await client.query(
          `INSERT INTO portrait_outbox (event_type, aggregate_id, payload_minimized)
           VALUES ('observation.confirmed', $1::uuid, jsonb_build_object(
             'observation_revision_id', $1::uuid,
             'response_id', $2::uuid,
             'operation_id', $3::uuid))`,
          [revisionId, responseId, command.operation_id],
        );
        await client.query('COMMIT');
        return { response_id: responseId, correction_id: null, state: 'confirmed', replayed: false };
      }

      const correctionId = randomUUID();
      const evidence = await client.query<{ id: string }>(
        `INSERT INTO evidence_events
           (user_id, source_type, source_id, dimension, weight, explanation, evidence_kind, evidence_mode,
            candidate, portrait_status, origin_operation_id, local_date)
         VALUES ($1, 'observation_response', $2, 'unclassified', 0,
                 'Candidate evidence attached to a revision-bound user response.', 'correction', 'input',
                 true, 'candidate', $3, CURRENT_DATE)
         RETURNING id`,
        [userId, responseId, command.operation_id],
      );
      await client.query(
        `INSERT INTO correction_records
           (id, response_id, candidate_evidence_id, current_revision_number, state)
         VALUES ($1, $2, $3, 1, 'pending_validation')`,
        [correctionId, responseId, evidence.rows[0].id],
      );
      await client.query(
        `INSERT INTO correction_record_revisions
           (correction_record_id, revision_number, state, reason_code)
         VALUES ($1, 1, 'pending_validation', 'approval_required')`,
        [correctionId],
      );
      await client.query(
        `INSERT INTO portrait_outbox (event_type, aggregate_id, payload_minimized)
         VALUES ('correction.validation_requested', $1::uuid, jsonb_build_object('correction_id', $1::uuid))`,
        [correctionId],
      );
      await client.query('COMMIT');
      return { response_id: responseId, correction_id: correctionId, state: 'pending_validation', replayed: false };
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      throw error;
    } finally {
      client.release();
    }
  }
}
