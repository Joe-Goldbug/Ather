// packages/core/src/evidence/correction-candidate.ts
// Correction candidate evidence mechanism [S1-active]
// Corrections create high-weight candidates (×0.8) that don't enter formal aggregation
// until verified by subsequent same-direction evidence.

import type { EvidenceEventRow } from './evidence-types.js';

// ─────────────────────────────────────────────────────────────
// Public interfaces
// ─────────────────────────────────────────────────────────────

export interface CorrectionInput {
  userId: string;
  dimension: string;
  sourceType: 'report_claim' | 'chat_claim' | 'assessment_claim';
  sourceId?: string | null;
  originalText: string;
  correctedText: string;
  explanation?: string;
}

/**
 * Candidate evidence record (to be written as candidate=true evidence_events + user_corrections).
 * Does NOT enter formal UBV aggregation until verified.
 */
export interface CorrectionCandidate {
  correctionId: string;
  dimension: string;
  /** ×0.8 candidate weight — high but below formal ×1.0 */
  candidateWeight: number;
  /** Maturity penalty applied to original judgment (evidence_count halved) */
  maturityPenalty: number;
  /** Direction of the correction: 1 = positive, -1 = negative (used for verification matching) */
  correctionDirection: 1 | -1;
}

// ─────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────

/** Candidate weight for unverified corrections */
const CANDIDATE_WEIGHT = 0.8;

/** Maturity penalty: original judgment's evidence_count is halved */
const MATURITY_PENALTY = 0.5;

/** Promoted weight after verification */
const PROMOTED_WEIGHT = 1.0;

// ─────────────────────────────────────────────────────────────
// Implementation
// ─────────────────────────────────────────────────────────────

/**
 * Build a correction candidate from user input.
 * Pure function — returns data to be persisted by the caller.
 *
 * - candidateWeight = 0.8 (high-weight candidate, but < 1.0)
 * - maturityPenalty = 0.5 (original judgment's maturity is halved)
 * - correctionDirection = 1 (positive) — corrections always push toward the corrected direction
 * - Does NOT directly add to UBV value
 */
export function buildCorrectionCandidate(input: CorrectionInput): CorrectionCandidate {
  return {
    correctionId: crypto.randomUUID(),
    dimension: input.dimension,
    candidateWeight: CANDIDATE_WEIGHT,
    maturityPenalty: MATURITY_PENALTY,
    correctionDirection: 1, // Default positive — caller can override via subsequent logic
  };
}

/**
 * Evaluate whether a correction candidate has been verified by subsequent evidence.
 *
 * Verification condition: at least 1 subsequent evidence event on the same dimension
 * with a same-direction delta (sign matches correctionDirection).
 *
 * Verified → promotedWeight = 1.0
 * Not verified → promotedWeight = 0.8 (remains candidate)
 */
export function evaluateCandidateVerification(
  candidate: CorrectionCandidate,
  subsequentEvidence: EvidenceEventRow[],
): { verified: boolean; promotedWeight: number } {
  // Filter evidence: same dimension + non-candidate + same direction as correction
  const sameDimensionSameDirection = subsequentEvidence.filter(
    (ev) =>
      ev.dimension === candidate.dimension &&
      ev.delta != null &&
      ev.delta !== 0 &&
      !ev.candidate &&
      Math.sign(ev.delta) === candidate.correctionDirection,
  );

  if (sameDimensionSameDirection.length >= 1) {
    return { verified: true, promotedWeight: PROMOTED_WEIGHT };
  }

  return { verified: false, promotedWeight: CANDIDATE_WEIGHT };
}
