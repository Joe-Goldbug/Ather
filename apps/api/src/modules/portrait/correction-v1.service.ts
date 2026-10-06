import { createHash } from 'node:crypto';
import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Database } from '../../common/database.js';

type CorrectionCommand = {
  operation_id: string;
  revision_number: number;
};

type CorrectionCommandResult = {
  correction_id: string;
  revision_number: number;
  state: 'pending_validation' | 'withdrawn';
  replayed: boolean;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function fingerprint(action: 'retry' | 'withdraw', command: CorrectionCommand) {
  return createHash('sha256')
    .update(JSON.stringify({ action, revision_number: command.revision_number }))
    .digest('hex');
}

/**
 * Append-only command handler for the correction lifecycle. No command here
 * promotes candidate evidence or computes a personality result; it only makes
 * a retry/withdrawal auditable and safe to repeat.
 */
@Injectable()
export class CorrectionV1Service {
  constructor(private readonly db: Database) {}

  async retry(userId: string, correctionId: string, command: CorrectionCommand): Promise<CorrectionCommandResult> {
    return this.apply(userId, correctionId, 'retry', command);
  }

  async withdraw(userId: string, correctionId: string, command: CorrectionCommand): Promise<CorrectionCommandResult> {
    return this.apply(userId, correctionId, 'withdraw', command);
  }

  private async apply(
    userId: string,
    correctionId: string,
    action: 'retry' | 'withdraw',
    command: CorrectionCommand,
  ): Promise<CorrectionCommandResult> {
    if (!UUID.test(command.operation_id) || !Number.isInteger(command.revision_number) || command.revision_number < 1) {
      throw new BadRequestException({ code: 'invalid_correction_command' });
    }

    const requestFingerprint = fingerprint(action, command);
    const client = await this.db.pool.connect();
    try {
      await client.query('BEGIN');
      const existing = await client.query<{
        correction_record_id: string;
        revision_number: number;
        state: 'pending_validation' | 'withdrawn';
        request_fingerprint: string;
      }>(
        `SELECT correction_record_id, revision_number, state, request_fingerprint
         FROM correction_record_revisions
         WHERE operation_id = $1
         FOR UPDATE`,
        [command.operation_id],
      );
      if (existing.rows[0]) {
        const prior = existing.rows[0];
        if (prior.correction_record_id !== correctionId || prior.request_fingerprint !== requestFingerprint) {
          throw new ConflictException({ code: 'idempotency_key_reused' });
        }
        await client.query('COMMIT');
        return {
          correction_id: correctionId,
          revision_number: prior.revision_number,
          state: prior.state,
          replayed: true,
        };
      }

      const correction = await client.query<{
        id: string;
        current_revision_number: number;
        state: string;
        candidate_evidence_id: string | null;
      }>(
        `SELECT c.id, c.current_revision_number, c.state, c.candidate_evidence_id
         FROM correction_records c
         JOIN observation_responses response ON response.id = c.response_id
         JOIN published_observation_revisions revision ON revision.id = response.published_observation_revision_id
         JOIN published_observations observation ON observation.id = revision.published_observation_id
         WHERE c.id = $1 AND observation.user_id = $2
         FOR UPDATE OF c`,
        [correctionId, userId],
      );
      const current = correction.rows[0];
      if (!current) throw new NotFoundException({ code: 'authorization_denied' });
      if (current.current_revision_number !== command.revision_number) {
        throw new ConflictException({ code: 'revision_precondition_failed' });
      }
      if (current.state === 'withdrawn') {
        throw new ConflictException({ code: 'correction_already_withdrawn' });
      }

      const nextRevisionNumber = current.current_revision_number + 1;
      const nextState = action === 'withdraw' ? 'withdrawn' : 'pending_validation';
      await client.query(
        `INSERT INTO correction_record_revisions
           (correction_record_id, revision_number, state, reason_code, operation_id, request_fingerprint)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [correctionId, nextRevisionNumber, nextState, action === 'withdraw' ? 'user_withdrawal' : 'retry_requested', command.operation_id, requestFingerprint],
      );
      await client.query(
        `UPDATE correction_records
         SET current_revision_number = $2, state = $3, updated_at = NOW()
         WHERE id = $1`,
        [correctionId, nextRevisionNumber, nextState],
      );

      if (action === 'withdraw' && current.candidate_evidence_id) {
        // P0-4 修复：原 SQL 仅 portrait_status='candidate' 才撤回 → 已晋升为 'formal' 的证据撤回失败
        // 改为 IN ('candidate','formal')，让派生结果也停止使用该证据
        await client.query(
          `UPDATE evidence_events
           SET portrait_status = 'withdrawn', candidate = true, updated_at = NOW()
           WHERE id = $1 AND portrait_status IN ('candidate', 'formal')`,
          [current.candidate_evidence_id],
        );
        // The worker retires any stored portrait revision that used this source.
        await client.query(
          `INSERT INTO portrait_outbox (event_type, aggregate_id, payload_minimized)
           VALUES ('correction.withdraw_processed', $1::uuid, jsonb_build_object('correction_id', $1::uuid, 'evidence_id', $2::uuid))`,
          [correctionId, current.candidate_evidence_id],
        );
      }
      if (action === 'retry') {
        await client.query(
          `INSERT INTO portrait_outbox (event_type, aggregate_id, payload_minimized)
           VALUES ('correction.validation_requested', $1::uuid, jsonb_build_object('correction_id', $1::uuid, 'revision_number', $2::integer))`,
          [correctionId, nextRevisionNumber],
        );
      }

      await client.query('COMMIT');
      return { correction_id: correctionId, revision_number: nextRevisionNumber, state: nextState, replayed: false };
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      throw error;
    } finally {
      client.release();
    }
  }
}
