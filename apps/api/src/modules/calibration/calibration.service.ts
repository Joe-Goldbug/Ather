// apps/api/src/modules/calibration/calibration.service.ts
// [S1-active] Wraps core calibration-engine + correction-candidate pure functions with DB context.
// Thin service: delegates domain logic to @eva/core, handles persistence & queries.

import { Injectable } from '@nestjs/common';
import {
  buildCalibrationRound,
  advanceCalibrationRound,
  isCalibrationComplete,
  buildCorrectionCandidate,
  type CalibrationRound,
  type CalibrationRoundOptions,
  type CorrectionInput,
  type CorrectionCandidate,
} from '@eva/core';
import { Database } from '../../common/database.js';
import { EvidenceService } from '../evidence/evidence.service.js';

@Injectable()
export class CalibrationService {
  constructor(
    private readonly db: Database,
    private readonly evidence: EvidenceService,
  ) {}

  // ─────────────────────────────────────────────────────────────
  // Calibration Round (attachment-test follow-up)
  // ─────────────────────────────────────────────────────────────

  /**
   * Start a new calibration round for a dimension with an identified evidence gap.
   * Pure delegation to core buildCalibrationRound — no DB write yet.
   * Caller may persist the round if needed for session tracking.
   */
  startCalibrationRound(
    dimension: string,
    gap: string,
    options?: CalibrationRoundOptions,
  ): CalibrationRound {
    return buildCalibrationRound(dimension, gap, options);
  }

  /**
   * Advance a calibration round after user responds.
   * Returns updated (immutable) round with incremented turn / terminated flag.
   */
  advanceRound(round: CalibrationRound): CalibrationRound {
    return advanceCalibrationRound(round);
  }

  /**
   * Check whether a calibration round should terminate.
   */
  isComplete(round: CalibrationRound): boolean {
    return isCalibrationComplete(round);
  }

  // ─────────────────────────────────────────────────────────────
  // Correction Candidate (user correction → candidate evidence)
  // ─────────────────────────────────────────────────────────────

  /**
   * Legacy compatibility write. It records an unweighted candidate and never
   * promotes it. The v1 response path uses revision-bound correction records.
   */
  async processUserCorrection(
    userId: string,
    input: CorrectionInput,
  ): Promise<CorrectionCandidate> {
    // 1. Build candidate via core pure function
    const candidate = buildCorrectionCandidate(input);

    const client = await this.db.pool.connect();
    try {
      await client.query('BEGIN');

      // 2. Write candidate evidence inside transaction
      const localDate = new Date().toISOString().slice(0, 10);
      const evRes = await client.query<{ id: string }>(
        `INSERT INTO evidence_events (user_id, source_type, source_id, dimension, weight, explanation, evidence_kind, evidence_mode, candidate, portrait_status, origin_operation_id, local_date)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'candidate', $10, $11)
         RETURNING id`,
        [
          userId,
          'user_correction',
          candidate.correctionId,
          candidate.dimension,
          0,
          `User correction: ${input.explanation ?? input.correctedText}`,
          'correction',
          'input',
          true,
          candidate.correctionId,
          localDate,
        ],
      );
      const evidenceId = evRes.rows[0].id;

      // 3. Record in user_corrections inside the same transaction
      await client.query(
        `INSERT INTO user_corrections
           (id, user_id, dimension, original_text, corrected_text, explanation, source_type,
            candidate_status, candidate_evidence_id, source_type_ext)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'candidate', $8, $9)`,
        [
          candidate.correctionId,
          userId,
          candidate.dimension,
          input.originalText,
          input.correctedText,
          input.explanation ?? null,
          input.sourceType,
          evidenceId,
          input.sourceType,
        ],
      );

      await client.query('COMMIT');
      return candidate;
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * Legacy compatibility guard. Automatic promotion is not an approved v1
   * validation rule, so this method always keeps the candidate pending.
   */
  async checkCandidateVerification(
    userId: string,
    correctionId: string,
  ): Promise<{ verified: boolean; promotedWeight: number }> {
    // 1. Load the correction record
    const corrRow = await this.db.pool.query<{
      dimension: string;
      candidate_evidence_id: string;
      created_at: string;
    }>(
      `SELECT dimension, candidate_evidence_id, created_at
       FROM user_corrections
       WHERE id = $1 AND user_id = $2 AND candidate_status = 'candidate'
       LIMIT 1`,
      [correctionId, userId],
    );

    if (!corrRow.rows[0]) {
      return { verified: false, promotedWeight: 0 };
    }

    const { dimension, candidate_evidence_id, created_at } = corrRow.rows[0];

    void candidate_evidence_id;
    void created_at;
    void dimension;
    return { verified: false, promotedWeight: 0 };
  }
}
