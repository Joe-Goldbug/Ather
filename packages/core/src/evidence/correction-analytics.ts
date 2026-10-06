// packages/core/src/evidence/correction-analytics.ts
// Pure functions — no DB, no network
//
// Reads user_corrections data and produces calibration signals:
//   - Per-dimension correction rate
//   - Confidence penalty recommendations
//   - Retest suggestions when a dimension is consistently rejected

/** Minimal shape of a user_corrections row (only what analytics needs) */
export interface CorrectionRow {
  id: string;
  user_id: string;
  dimension: string;
  source_type: 'report_claim' | 'chat_claim' | 'assessment_claim';
  original_text: string;
  corrected_text: string;
  created_at: Date | string;
}

/** Calibration signal for a single dimension derived from correction history */
export interface CorrectionSignal {
  dimension: string;
  /** Total corrections recorded for this dimension */
  total_corrections: number;
  /**
   * Ratio of corrections to total evaluations for this dimension.
   * Range [0, 1]. Computed as corrections / max(evaluations, corrections).
   * When evaluation_count is unknown, falls back to corrections / ASSUMED_BASELINE.
   */
  correction_rate: number;
  /**
   * Recommended confidence penalty to subtract.
   * 0 if correction_rate < PENALTY_THRESHOLD.
   * Scales linearly from 0 → MAX_PENALTY as rate goes PENALTY_THRESHOLD → 1.0.
   */
  confidence_penalty: number;
  /**
   * True when the dimension has been corrected enough times to warrant
   * actively prompting a re-assessment.
   */
  suggest_retest: boolean;
  /** Source type breakdown for diagnostics */
  source_breakdown: Record<CorrectionRow['source_type'], number>;
}

// ─────────────────────────────────────────────────────────────
// Tuning constants
// ─────────────────────────────────────────────────────────────

/**
 * Assumed number of evaluations per dimension when we don't have the exact count.
 * Used to compute correction_rate conservatively.
 */
const ASSUMED_BASELINE_EVALUATIONS = 10;

/**
 * Correction rate above which a confidence penalty kicks in.
 * Below this threshold, corrections are treated as normal noise.
 */
const PENALTY_THRESHOLD = 0.3;

/** Maximum confidence penalty that can be applied (keeps floor meaningful) */
const MAX_PENALTY = 0.4;

/**
 * Number of corrections that triggers a retest suggestion,
 * regardless of correction_rate.
 */
const RETEST_CORRECTION_COUNT = 3;

// ─────────────────────────────────────────────────────────────
// Internal helpers
// ─────────────────────────────────────────────────────────────

function computePenalty(rate: number): number {
  if (rate < PENALTY_THRESHOLD) return 0;
  const excess = (rate - PENALTY_THRESHOLD) / (1.0 - PENALTY_THRESHOLD);
  return Math.min(MAX_PENALTY, excess * MAX_PENALTY);
}

// ─────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────

/**
 * Compute calibration signals from a flat list of correction rows.
 *
 * @param corrections   All correction rows for ONE user (any dimension mix)
 * @param evaluationCounts  Optional map of dimension → how many times EVA
 *   made a claim on that dimension. When absent, uses ASSUMED_BASELINE_EVALUATIONS.
 *
 * @returns One CorrectionSignal per dimension that has ≥ 1 correction.
 */
export function computeCorrectionSignals(
  corrections: CorrectionRow[],
  evaluationCounts?: Partial<Record<string, number>>,
): CorrectionSignal[] {
  if (corrections.length === 0) return [];

  // Group by dimension
  const byDimension = new Map<string, CorrectionRow[]>();
  for (const row of corrections) {
    const group = byDimension.get(row.dimension) ?? [];
    group.push(row);
    byDimension.set(row.dimension, group);
  }

  const signals: CorrectionSignal[] = [];

  for (const [dimension, rows] of byDimension) {
    const total_corrections = rows.length;
    const evaluations = evaluationCounts?.[dimension] ?? ASSUMED_BASELINE_EVALUATIONS;
    // correction_rate must stay ≤ 1 even if corrections > evaluations (data anomaly guard)
    const correction_rate = Math.min(1.0, total_corrections / Math.max(evaluations, total_corrections));
    const confidence_penalty = computePenalty(correction_rate);
    const suggest_retest = total_corrections >= RETEST_CORRECTION_COUNT;

    const source_breakdown: Record<CorrectionRow['source_type'], number> = {
      report_claim: 0,
      chat_claim: 0,
      assessment_claim: 0,
    };
    for (const row of rows) {
      source_breakdown[row.source_type]++;
    }

    signals.push({
      dimension,
      total_corrections,
      correction_rate,
      confidence_penalty,
      suggest_retest,
      source_breakdown,
    });
  }

  // Sort by correction_rate descending (highest concern first)
  signals.sort((a, b) => b.correction_rate - a.correction_rate);

  return signals;
}

/**
 * Apply correction penalties to an existing confidence map.
 * Pure — does not mutate inputs.
 *
 * @param confidences  Map of dimension → current confidence
 * @param signals      Output of computeCorrectionSignals
 * @returns New map with penalties applied, clamped to [0.1, 0.95]
 */
export function applyCorrectionsToConfidence(
  confidences: Partial<Record<string, number>>,
  signals: CorrectionSignal[],
): Record<string, number> {
  const result: Record<string, number> = { ...confidences } as Record<string, number>;

  for (const signal of signals) {
    if (signal.confidence_penalty === 0) continue;
    const current = result[signal.dimension] ?? 0.5;
    result[signal.dimension] = Math.max(0.1, Math.min(0.95, current - signal.confidence_penalty));
  }

  return result;
}
