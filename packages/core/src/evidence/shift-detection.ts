// packages/core/src/evidence/shift-detection.ts
// Five-gate shift detection [S1-active]
// Wraps existing detectYouShifted RCI output with additional safety gates.

// ─────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────

/** Minimum confidence required for the dimension to trigger shift */
export const CONFIDENCE_THRESHOLD = 0.50;

/** Minimum number of recent evidence events (last 30 days) required */
export const RECENT_EVIDENCE_MIN = 2;

/** Days since last user correction; must exceed this (or be null) */
export const NO_CORRECTION_DAYS = 14;

/** RCI absolute value must exceed this for statistical significance */
export const RCI_THRESHOLD = 1.96;

/** Fixed messaging — humble, non-assertive */
export const SHIFT_MESSAGE = 'EVA 发现一个可能的变化，需要你确认';

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

export interface ShiftGateInput {
  dimension: string;
  /** Whether a comparable parallel test item exists for this dimension */
  hasParallelItem: boolean;
  /** Current confidence for this dimension */
  confidence: number;
  /** Number of recent evidence events (last 30 days) for this dimension */
  recentEvidenceCount: number;
  /** Days since last user correction on this dimension (null if never corrected) */
  daysSinceLastCorrection: number | null;
  /** Reliable Change Index from detectYouShifted */
  rci: number;
}

export interface ShiftDetectionResult {
  shifted: boolean;
  dimension: string;
  /** Fixed messaging */
  message: string;
  /** Which gates passed/failed for debugging */
  gates: {
    parallelItem: boolean;
    confidence: boolean;
    recentEvidence: boolean;
    noCorrectionRecent: boolean;
    rciSignificant: boolean;
  };
}

// ─────────────────────────────────────────────────────────────
// Implementation
// ─────────────────────────────────────────────────────────────

/**
 * Five-gate shift detection. ALL five conditions must be met:
 * 1. hasParallelItem = true (comparable parallel test exists)
 * 2. confidence >= 0.50 (enough data to make a claim)
 * 3. recentEvidenceCount >= 2 (enough recent data)
 * 4. daysSinceLastCorrection > 14 OR null (no recent correction)
 * 5. |rci| > 1.96 (statistically significant change)
 *
 * If ALL gates pass → shifted=true with fixed message.
 * Otherwise → shifted=false.
 *
 * Postcondition: result.shifted === true ⟺ all five gates are true.
 */
export function detectShift(input: ShiftGateInput): ShiftDetectionResult {
  // Gate 1: comparable parallel test item exists
  const parallelItem = input.hasParallelItem;

  // Gate 2: confidence >= threshold
  const confidence = input.confidence >= CONFIDENCE_THRESHOLD;

  // Gate 3: sufficient recent evidence
  const recentEvidence = input.recentEvidenceCount >= RECENT_EVIDENCE_MIN;

  // Gate 4: no recent correction (> 14 days ago, or never corrected)
  const noCorrectionRecent =
    input.daysSinceLastCorrection === null ||
    input.daysSinceLastCorrection > NO_CORRECTION_DAYS;

  // Gate 5: RCI statistically significant
  const rciSignificant = Math.abs(input.rci) > RCI_THRESHOLD;

  const gates = {
    parallelItem,
    confidence,
    recentEvidence,
    noCorrectionRecent,
    rciSignificant,
  };

  const shifted =
    parallelItem && confidence && recentEvidence && noCorrectionRecent && rciSignificant;

  return {
    shifted,
    dimension: input.dimension,
    message: SHIFT_MESSAGE,
    gates,
  };
}
