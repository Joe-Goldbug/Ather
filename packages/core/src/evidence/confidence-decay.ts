// packages/core/src/evidence/confidence-decay.ts
// Pure functions — no DB, no network
//
// Applies time-based confidence decay to a BeliefDim.
// Different `kind` values decay at different rates:
//
//   trait  → half-life 90 days   (stable personality characteristics)
//   state  → half-life 7 days    (transient emotional / situational states)
//   signal → half-life 1 day     (weak linguistic signals, current-session only)
//
// Formula: new_confidence = max(FLOOR, old_confidence * 0.5^(elapsed_days / half_life_days))

import type { BeliefDim, BeliefDimKind } from '../shared/types.js';

// ─────────────────────────────────────────────────────────────
// Tuning constants
// ─────────────────────────────────────────────────────────────

/** Half-life in days per dimension kind */
const HALF_LIFE_DAYS: Record<BeliefDimKind, number> = {
  trait: 90,
  state: 7,
  signal: 1,
};

/** Confidence never decays below this floor */
const DECAY_FLOOR = 0.1;

const MS_PER_DAY = 1000 * 60 * 60 * 24;

// ─────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────

/**
 * Compute the decayed confidence for a single BeliefDim.
 * Pure — does not mutate the input.
 *
 * @param dim  The belief dimension to decay
 * @param now  Current timestamp in milliseconds (Date.now())
 * @returns    A new BeliefDim with updated `confidence` and `last_updated`
 */
export function applyConfidenceDecay(dim: BeliefDim, now: number): BeliefDim {
  const kind: BeliefDimKind = dim.kind ?? 'trait';
  const halfLifeDays = HALF_LIFE_DAYS[kind];

  // Use last_evidence_at if available, fall back to last_updated
  const lastEvidence = dim.last_evidence_at ?? dim.last_updated;
  const elapsedMs = now - lastEvidence;
  const elapsedDays = elapsedMs / MS_PER_DAY;

  if (elapsedDays <= 0) return dim;

  // Exponential decay: confidence * 0.5^(elapsed / half_life)
  const decayFactor = Math.pow(0.5, elapsedDays / halfLifeDays);
  const newConfidence = Math.max(DECAY_FLOOR, dim.confidence * decayFactor);

  // Only update if there's a meaningful change (> 0.001)
  if (Math.abs(newConfidence - dim.confidence) < 0.001) return dim;

  return {
    ...dim,
    confidence: newConfidence,
    last_updated: now,
  };
}

/**
 * Compute how many days until this dimension's confidence halves again
 * from its current value, given ongoing decay.
 */
export function daysUntilHalfConfidence(dim: BeliefDim, now: number): number {
  const kind: BeliefDimKind = dim.kind ?? 'trait';
  return HALF_LIFE_DAYS[kind];
}

/**
 * Apply decay to an entire UBV-like record of BeliefDims.
 * Returns a new object — does not mutate input.
 *
 * @param dims  Record of dimension key → BeliefDim
 * @param now   Current timestamp (Date.now())
 */
export function applyDecayToAll<K extends string>(
  dims: Record<K, BeliefDim>,
  now: number,
): Record<K, BeliefDim> {
  const result = {} as Record<K, BeliefDim>;
  for (const key in dims) {
    result[key] = applyConfidenceDecay(dims[key]!, now);
  }
  return result;
}

/**
 * Determine the default kind for a given UBV dimension key.
 * L1/L3 structural dimensions are traits; currentMood is state; linguistic is signal.
 *
 * This is the single source of truth for kind assignment when BeliefDim.kind is absent.
 */
export const DIMENSION_KIND_MAP: Readonly<Record<string, BeliefDimKind>> = {
  // L1 core — stable traits
  trustBoundaries: 'trait',
  conflictResponse: 'trait',
  attachment: 'trait',
  emotionRegulation: 'trait',
  stressResponse: 'trait',
  achievementMotivation: 'trait',
  selfCognition: 'trait',
  socialEnergy: 'trait',
  // L3 psycholinguistic — partially state, partially trait
  emotionalGranularity: 'trait',
  shameSensitivity: 'trait',
  helpSeekingPattern: 'trait',
  growthOrientation: 'trait',
  // L3 language signals — decays fast
  linguisticExtraversion: 'signal',
  narrativeCoherence: 'signal',
};
