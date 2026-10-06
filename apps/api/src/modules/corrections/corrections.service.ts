// apps/api/src/modules/corrections/corrections.service.ts
// Legacy corrections read service. New writes are revision-bound v1 responses.
// Responsibilities:
//  1. Query recent corrections without inventing an expiry policy
//  2. Analytics
//  3. Lazy expiration: candidates older than 14 days → 'expired'
// Legacy writes are retired. Current feedback is written through theme-result
// responses or revision-bound observation responses.

import { Injectable } from '@nestjs/common';
import { Database } from '../../common/database.js';
import {
  computeCorrectionSignals,
  applyCorrectionsToConfidence,
  DIMENSION_KIND_MAP,
  type CorrectionRow,
  type BeliefDim,
} from '@eva/core';

export interface CorrectionAnalytics {
  byDimension: Array<{
    dimension: string;
    correctionCount: number;
    latestCorrectionAt: Date;
    avgCorrectionEvidenceConfidence: number | null;
    correctionEvidenceCount: number;
  }>;
  bySource: Array<{
    sourceType: string;
    sourceId: string | null;
    correctionCount: number;
    dimensions: string[];
    latestCorrectionAt: Date;
  }>;
}

@Injectable()
export class CorrectionsService {
  constructor(private readonly db: Database) {}

  // ─────────────────────────────────────────────────────────────
  // Candidate lifecycle
  // ─────────────────────────────────────────────────────────────

  /**
   * There is no approved automatic-expiry rule. Keep candidates pending until a
   * versioned validation or an explicit user withdrawal resolves them.
   */
  private async expireStaleCandidate(userId: string): Promise<number> {
    void userId;
    return 0;
  }

  // ─────────────────────────────────────────────────────────────
  // Query (with lazy expiration)
  // ─────────────────────────────────────────────────────────────

  /**
   * Get recent corrections without applying a time-based expiry rule.
   */
  async getRecentWithExpiration(userId: string, limit = 20) {
    await this.expireStaleCandidate(userId);

    const rows = await this.db.pool.query(
      `SELECT id, source_type, source_id, dimension,
              original_text, corrected_text, explanation,
              candidate_status, verified_at, candidate_evidence_id,
              created_at
       FROM user_corrections
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT $2`,
      [userId, limit],
    );
    return rows.rows;
  }

  /**
   * Legacy getRecent (for backward compatibility with existing callers).
   */
  async getRecent(userId: string, limit = 20) {
    return this.getRecentWithExpiration(userId, limit);
  }

  // ─────────────────────────────────────────────────────────────
  // Analytics
  // ─────────────────────────────────────────────────────────────

  /**
   * Aggregate correction signals so hard-coded rules can be reviewed.
   */
  async getAnalytics(userId: string): Promise<CorrectionAnalytics> {
    await this.expireStaleCandidate(userId);

    const byDimension = await this.db.pool.query<CorrectionAnalytics['byDimension'][number]>(
      `SELECT
          c.dimension,
          COUNT(*)::int AS "correctionCount",
          MAX(c.created_at) AS "latestCorrectionAt",
          AVG(e.confidence) FILTER (WHERE e.source_type = 'user_correction') AS "avgCorrectionEvidenceConfidence",
          (COUNT(e.id) FILTER (WHERE e.source_type = 'user_correction'))::int AS "correctionEvidenceCount"
       FROM user_corrections c
       LEFT JOIN evidence_events e
         ON e.user_id = c.user_id
        AND e.source_type = 'user_correction'
        AND e.source_id = c.id::text
       WHERE c.user_id = $1
       GROUP BY c.dimension
       ORDER BY COUNT(*) DESC, MAX(c.created_at) DESC`,
      [userId],
    );

    const bySource = await this.db.pool.query<CorrectionAnalytics['bySource'][number]>(
      `SELECT
          c.source_type AS "sourceType",
          c.source_id AS "sourceId",
          COUNT(*)::int AS "correctionCount",
          ARRAY_AGG(DISTINCT c.dimension) AS dimensions,
          MAX(c.created_at) AS "latestCorrectionAt"
       FROM user_corrections c
       WHERE c.user_id = $1
       GROUP BY c.source_type, c.source_id
       ORDER BY COUNT(*) DESC, MAX(c.created_at) DESC`,
      [userId],
    );

    return {
      byDimension: byDimension.rows,
      bySource: bySource.rows,
    };
  }
}
