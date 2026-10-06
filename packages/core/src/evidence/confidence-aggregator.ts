// packages/core/src/evidence/confidence-aggregator.ts
// Multi-evidence weighted confidence aggregation — no DB, no network
//
// Replaces the naive single-delta approach:
//   before: one evidence event → one UBV update, no cross-event awareness
//   after:  N events per dimension → weighted mean + conflict detection + correction penalty

import type { EvidenceEventRow, EvidenceDimension } from './evidence-types.js';

/** Aggregated accuracy result for a single dimension */
export interface DimensionAggregation {
  dimension: EvidenceDimension;
  /** Weighted mean score (0-100), smoothed for extreme values */
  weighted_value: number;
  /** Final confidence [0.1, 0.95] after all penalties */
  confidence: number;
  /** True if evidence events contradict each other significantly */
  conflict_detected: boolean;
  /**
   * Variance across weighted deltas.
   * High variance (> 400) = contradictory evidence.
   */
  delta_variance: number;
  /** Total number of evidence events used */
  evidence_count: number;
  /** Breakdown by source type */
  source_counts: Record<'test' | 'chat' | 'diary' | 'user_correction' | 'capture', number>;
}

/**
 * Maximum single-turn delta applied to UBV value.
 * Prevents one extreme choice from saturating a dimension.
 */
const MAX_SINGLE_DELTA = 30;

/**
 * Minimum evidence count to reach full base confidence.
 * With fewer events, confidence is scaled down proportionally.
 */
const FULL_CONFIDENCE_EVIDENCE_COUNT = 5;

/**
 * Conflict variance threshold.
 * Above this, confidence is penalised for contradictory signals.
 */
const CONFLICT_VARIANCE_THRESHOLD = 400;

/**
 * Penalty applied per unit of variance exceeding the threshold.
 * Final penalty = excess_variance / CONFLICT_PENALTY_DIVISOR
 */
const CONFLICT_PENALTY_DIVISOR = 2000;

/** Hard floor and ceiling for all confidence outputs */
const CONFIDENCE_MIN = 0.1;
const CONFIDENCE_MAX = 0.95;

// ─────────────────────────────────────────────────────────────
// Internal helpers
// ─────────────────────────────────────────────────────────────

function clampConfidence(v: number): number {
  return Math.max(CONFIDENCE_MIN, Math.min(CONFIDENCE_MAX, v));
}

function clampDelta(delta: number): number {
  return Math.max(-MAX_SINGLE_DELTA, Math.min(MAX_SINGLE_DELTA, delta));
}

/** Weighted variance of an array: Σ w_i*(x_i - mean)² / Σ w_i */
function weightedVariance(values: number[], weights: number[], mean: number): number {
  const totalW = weights.reduce((s, w) => s + w, 0);
  if (totalW === 0) return 0;
  const variance = values.reduce((s, v, i) => s + weights[i]! * (v - mean) ** 2, 0) / totalW;
  return variance;
}

// ─────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────

/**
 * Aggregate all evidence events for a single dimension into one
 * confidence-annotated value.
 *
 * Algorithm:
 *  1. Clamp individual deltas to ±MAX_SINGLE_DELTA (extreme-value smoothing)
 *  2. Compute weighted mean of clamped deltas
 *  3. Base confidence = f(evidence_count) * mean(confidence per event)
 *  4. Detect conflicts via weighted delta variance
 *  5. Apply conflict penalty to confidence
 *  6. Clamp final confidence to [0.1, 0.95]
 *
 * @param baseValue  Starting UBV value before applying these events (0-100)
 * @param events     Evidence events for exactly ONE dimension
 */
export function aggregateDimensionConfidence(
  baseValue: number,
  events: EvidenceEventRow[],
): DimensionAggregation {
  // Filter out candidate evidence — candidates do not enter formal aggregation
  events = events.filter(ev => !ev.candidate);

  if (events.length === 0) {
    return {
      dimension: '' as EvidenceDimension,
      weighted_value: baseValue,
      confidence: CONFIDENCE_MIN,
      conflict_detected: false,
      delta_variance: 0,
      evidence_count: 0,
      source_counts: { test: 0, chat: 0, diary: 0, user_correction: 0, capture: 0 },
    };
  }

  const dimension = events[0]!.dimension as EvidenceDimension;

  // Source breakdown
  const source_counts: Record<'test' | 'chat' | 'diary' | 'user_correction' | 'capture', number> = {
    test: 0, chat: 0, diary: 0, user_correction: 0, capture: 0,
  };

  const clampedDeltas: number[] = [];
  const weights: number[] = [];
  const confidences: number[] = [];

  for (const ev of events) {
    source_counts[ev.source_type]++;
    const delta = ev.delta != null ? clampDelta(ev.delta) : 0;
    clampedDeltas.push(delta);
    weights.push(ev.weight);
    confidences.push(ev.confidence);
  }

  const totalWeight = weights.reduce((s, w) => s + w, 0);

  // Weighted mean delta
  const weightedMeanDelta = clampedDeltas.reduce((s, d, i) => s + d * weights[i]!, 0) / totalWeight;
  const weighted_value = Math.max(0, Math.min(100, baseValue + weightedMeanDelta));

  // Weighted mean confidence from individual events
  const weightedMeanConfidence = confidences.reduce((s, c, i) => s + c * weights[i]!, 0) / totalWeight;

  // Scale confidence by evidence count: fewer events → lower confidence
  const evidenceScale = Math.min(1.0, events.length / FULL_CONFIDENCE_EVIDENCE_COUNT);
  const base_confidence = clampConfidence(evidenceScale * weightedMeanConfidence);

  // Conflict detection: high variance across deltas indicates contradictory evidence
  const delta_variance = weightedVariance(clampedDeltas, weights, weightedMeanDelta);
  const conflict_detected = delta_variance > CONFLICT_VARIANCE_THRESHOLD;
  const excess_variance = Math.max(0, delta_variance - CONFLICT_VARIANCE_THRESHOLD);
  const conflict_penalty = excess_variance / CONFLICT_PENALTY_DIVISOR;

  const confidence = clampConfidence(base_confidence - conflict_penalty);

  return {
    dimension,
    weighted_value,
    confidence,
    conflict_detected,
    delta_variance,
    evidence_count: events.length,
    source_counts,
  };
}

/**
 * Batch-aggregate all dimensions from a flat list of evidence events.
 * Groups by dimension internally, then calls aggregateDimensionConfidence for each.
 *
 * @param baseValues  Map of dimension → current UBV value (used as starting point)
 * @param events      All evidence events (may span multiple dimensions)
 */
export function aggregateAllDimensions(
  baseValues: Partial<Record<string, number>>,
  events: EvidenceEventRow[],
): Map<string, DimensionAggregation> {
  // Group by dimension
  const byDimension = new Map<string, EvidenceEventRow[]>();
  for (const ev of events) {
    const group = byDimension.get(ev.dimension) ?? [];
    group.push(ev);
    byDimension.set(ev.dimension, group);
  }

  const results = new Map<string, DimensionAggregation>();
  for (const [dim, dimEvents] of byDimension) {
    const base = baseValues[dim] ?? 50;
    results.set(dim, aggregateDimensionConfidence(base, dimEvents));
  }

  return results;
}
