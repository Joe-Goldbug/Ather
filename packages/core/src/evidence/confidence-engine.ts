// packages/core/src/evidence/confidence-engine.ts
// Four-factor confidence engine [S1-active]
// confidence = min(sufficiency, consistency, sourceCoverage, calibration)

import type { EvidenceEventRow } from './evidence-types.js';
import { EVIDENCE_BASE_WEIGHT, type EvidenceKind } from './evidence-weights.js';
import { aggregateDimensionConfidence } from './confidence-aggregator.js';

// ─────────────────────────────────────────────────────────────
// Public interfaces
// ─────────────────────────────────────────────────────────────

/** Four independent factor scores (each 0-1) */
export interface ConfidenceFactors {
  sufficiency: number;    // 证据充分度
  consistency: number;    // 一致性
  sourceCoverage: number; // 来源覆盖(不可绕过)
  calibration: number;    // 校准度
}

export interface DimensionConfidenceResult {
  dimension: string;
  /** = min(四因子), clamped [0.1, 1.0] */
  confidence: number;
  factors: ConfidenceFactors;
  /** The factor with the lowest score */
  limitingFactor: keyof ConfidenceFactors;
  /** Whether to trigger targeted test (2+ contradictions) */
  triggerTargetedTest: boolean;
  /** Value from the existing aggregator's weighted_value */
  value: number;
}

export interface ComputeConfidenceInput {
  dimension: string;
  baseValue: number;
  events: EvidenceEventRow[];
  /** Recent calibration timestamps for this dimension (ms) */
  calibrationTimestamps: number[];
  now: number;
}

// ─────────────────────────────────────────────────────────────
// Constants (tunable)
// ─────────────────────────────────────────────────────────────

const FULL_SUFFICIENCY = 4.0;
const SAME_DAY_SECOND = 0.5;
const SAME_DAY_THIRD_PLUS = 0.2;
const CONSISTENCY_ONE_CONFLICT = 0.70;
const CONSISTENCY_MULTI_CONFLICT = 0.50;
const COVERAGE_TEST_ONLY = 0.60;
const COVERAGE_TEST_CAPTURE = 0.80;
const COVERAGE_FULL = 1.00;
const COVERAGE_NO_TEST = 0.50;
const CALIBRATION_MIN_GAP_MS = 3 * 24 * 60 * 60 * 1000; // 3 days
const CALIBRATION_DYNAMIC_FAIL = 0.40;
const CONFIDENCE_MIN = 0.1;
const CONFIDENCE_MAX = 1.0;

// ─────────────────────────────────────────────────────────────
// Internal helpers
// ─────────────────────────────────────────────────────────────

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

/** Map evidence_kind to coverage category */
function toCategory(kind: string): 'test' | 'capture' | 'decision' | null {
  switch (kind) {
    case 'formal':
    case 'practice':
    case 'calibration':
      return 'test';
    case 'reality':
      return 'capture';
    case 'decision':
      return 'decision';
    default:
      return null;
  }
}

/** Get the local_date key for grouping (fallback to created_at date) */
function getLocalDate(ev: EvidenceEventRow): string {
  if (ev.local_date) return ev.local_date;
  return ev.created_at.toISOString().slice(0, 10);
}

/** Get evidence_kind with fallback for legacy rows */
function getEvidenceKind(ev: EvidenceEventRow): EvidenceKind {
  if (ev.evidence_kind && ev.evidence_kind in EVIDENCE_BASE_WEIGHT) {
    return ev.evidence_kind as EvidenceKind;
  }
  // Legacy fallback: map source_type to evidence_kind
  switch (ev.source_type) {
    case 'test': return 'formal';
    case 'diary': return 'reality';
    case 'user_correction': return 'correction';
    case 'chat': return 'formal';
    default: return 'formal';
  }
}

/**
 * Count contradictions: evidence pairs with opposing deltas on the same dimension.
 * A contradiction = two events where one has positive delta and another negative delta,
 * and both have |delta| > 0 (non-zero).
 */
function countContradictions(events: EvidenceEventRow[]): number {
  let hasPositive = false;
  let hasNegative = false;
  let positiveCount = 0;
  let negativeCount = 0;

  for (const ev of events) {
    if (ev.delta != null && ev.delta > 0) {
      hasPositive = true;
      positiveCount++;
    } else if (ev.delta != null && ev.delta < 0) {
      hasNegative = true;
      negativeCount++;
    }
  }

  if (!hasPositive || !hasNegative) return 0;
  // Number of contradictions = min(positive count, negative count)
  return Math.min(positiveCount, negativeCount);
}

/**
 * Filter calibration timestamps with >= 3 day gap between each.
 * Returns the valid timestamps sorted ascending.
 */
function filterValidCalibrations(timestamps: number[]): number[] {
  if (timestamps.length === 0) return [];
  const sorted = [...timestamps].sort((a, b) => a - b);
  const valid: number[] = [sorted[0]!];
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i]! - valid[valid.length - 1]! >= CALIBRATION_MIN_GAP_MS) {
      valid.push(sorted[i]!);
    }
  }
  return valid;
}

// ─────────────────────────────────────────────────────────────
// Main computation
// ─────────────────────────────────────────────────────────────

/**
 * Compute dimension confidence as min(sufficiency, consistency, sourceCoverage, calibration).
 * Pure — no DB, no network.
 *
 * Filters out candidate=true events before computation.
 */
export function computeDimensionConfidence(
  input: ComputeConfidenceInput,
): DimensionConfidenceResult {
  // Filter out candidate evidence
  const events = input.events.filter(ev =>
    !ev.candidate && ev.content_kind !== 'simulation_choice' && ev.portrait_status !== 'withdrawn',
  );

  if (events.length === 0) {
    const factors: ConfidenceFactors = {
      sufficiency: 0,
      consistency: 1.0,
      sourceCoverage: COVERAGE_NO_TEST,
      calibration: 0.5,
    };
    return {
      dimension: input.dimension,
      confidence: CONFIDENCE_MIN,
      factors,
      limitingFactor: 'sufficiency',
      triggerTargetedTest: false,
      value: input.baseValue,
    };
  }

  // ── Factor 1: Sufficiency (同天递减) ──────────────────────
  let effectiveEvidence = 0;

  // Group by (evidence_kind, local_date)
  const groups = new Map<string, EvidenceEventRow[]>();
  for (const ev of events) {
    const kind = getEvidenceKind(ev);
    const date = getLocalDate(ev);
    const key = `${kind}::${date}`;
    const group = groups.get(key) ?? [];
    group.push(ev);
    groups.set(key, group);
  }

  for (const [, group] of groups) {
    // Sort by created_at within group
    const sorted = [...group].sort(
      (a, b) => a.created_at.getTime() - b.created_at.getTime(),
    );
    for (let i = 0; i < sorted.length; i++) {
      const ev = sorted[i]!;
      const kind = getEvidenceKind(ev);
      const baseWeight = EVIDENCE_BASE_WEIGHT[kind] ?? 1.0;
      let sameDayFactor: number;
      if (i === 0) {
        sameDayFactor = 1.0;
      } else if (i === 1) {
        sameDayFactor = SAME_DAY_SECOND;
      } else {
        sameDayFactor = SAME_DAY_THIRD_PLUS;
      }
      effectiveEvidence += baseWeight * sameDayFactor;
    }
  }

  const sufficiency = Math.min(1.0, effectiveEvidence / FULL_SUFFICIENCY);

  // ── Factor 2: Consistency ─────────────────────────────────
  const contradictions = countContradictions(events);
  let consistency: number;
  if (contradictions === 0) {
    consistency = 1.0;
  } else if (contradictions === 1) {
    consistency = CONSISTENCY_ONE_CONFLICT;
  } else {
    consistency = CONSISTENCY_MULTI_CONFLICT;
  }
  const triggerTargetedTest = contradictions >= 2;

  // ── Factor 3: Source Coverage ─────────────────────────────
  const categories = new Set<string>();
  for (const ev of events) {
    const kind = getEvidenceKind(ev);
    const cat = toCategory(kind);
    if (cat) categories.add(cat);
  }

  const hasTest = categories.has('test');
  const hasCapture = categories.has('capture');
  const hasDecision = categories.has('decision');

  let sourceCoverage: number;
  if (hasTest && hasCapture && hasDecision) {
    sourceCoverage = COVERAGE_FULL;
  } else if (hasTest && hasCapture) {
    sourceCoverage = COVERAGE_TEST_CAPTURE;
  } else if (hasTest) {
    sourceCoverage = COVERAGE_TEST_ONLY;
  } else {
    sourceCoverage = COVERAGE_NO_TEST;
  }

  // ── Factor 4: Calibration ─────────────────────────────────
  const validCalibrations = filterValidCalibrations(input.calibrationTimestamps);
  // For S1, assume dynamic structure check always passes
  const dynamicPassed = true;
  let calibration: number;
  if (!dynamicPassed) {
    calibration = CALIBRATION_DYNAMIC_FAIL;
  } else {
    calibration = Math.min(1.0, 0.5 + 0.25 * validCalibrations.length);
  }

  // ── Result: min of all factors ────────────────────────────
  const factors: ConfidenceFactors = {
    sufficiency,
    consistency,
    sourceCoverage,
    calibration,
  };

  const minValue = Math.min(sufficiency, consistency, sourceCoverage, calibration);
  const confidence = clamp(minValue, CONFIDENCE_MIN, CONFIDENCE_MAX);

  // Determine limiting factor (argmin)
  const entries: [keyof ConfidenceFactors, number][] = [
    ['sufficiency', sufficiency],
    ['consistency', consistency],
    ['sourceCoverage', sourceCoverage],
    ['calibration', calibration],
  ];
  entries.sort((a, b) => a[1] - b[1]);
  const limitingFactor = entries[0]![0];

  // Value: reuse existing aggregator
  const aggregation = aggregateDimensionConfidence(input.baseValue, events);
  const value = aggregation.weighted_value;

  return {
    dimension: input.dimension,
    confidence,
    factors,
    limitingFactor,
    triggerTargetedTest,
    value,
  };
}
