// packages/core/src/evidence/shift-detection.property.test.ts
// Property-based tests for the five-gate shift detection mechanism
// Uses fast-check to verify invariant P9

import { describe, test, expect } from 'bun:test';
import * as fc from 'fast-check';
import {
  detectShift,
  CONFIDENCE_THRESHOLD,
  RECENT_EVIDENCE_MIN,
  NO_CORRECTION_DAYS,
  RCI_THRESHOLD,
  SHIFT_MESSAGE,
  type ShiftGateInput,
} from './shift-detection.js';

// ─────────────────────────────────────────────────────────────
// Arbitraries / Generators
// ─────────────────────────────────────────────────────────────

const dimensionArb = fc.constantFrom(
  'trustBoundaries',
  'conflictResponse',
  'attachment',
  'emotionRegulation',
  'stressResponse',
  'achievementMotivation',
  'selfCognition',
  'socialEnergy',
);

/**
 * Generator for ShiftGateInput that covers the full input space:
 * - hasParallelItem: boolean
 * - confidence: spans below, at, and above threshold
 * - recentEvidenceCount: 0..10
 * - daysSinceLastCorrection: null or 0..30
 * - rci: spans negative and positive values, around threshold
 */
const shiftGateInputArb: fc.Arbitrary<ShiftGateInput> = fc.record({
  dimension: dimensionArb,
  hasParallelItem: fc.boolean(),
  confidence: fc.double({ min: 0.0, max: 1.0, noNaN: true }),
  recentEvidenceCount: fc.integer({ min: 0, max: 10 }),
  daysSinceLastCorrection: fc.oneof(
    fc.constant(null),
    fc.integer({ min: 0, max: 60 }),
  ),
  rci: fc.double({ min: -5.0, max: 5.0, noNaN: true }),
});

// ─────────────────────────────────────────────────────────────
// Helper: compute expected gate results from raw input
// ─────────────────────────────────────────────────────────────

function allGatesPass(input: ShiftGateInput): boolean {
  const c1 = input.hasParallelItem;
  const c2 = input.confidence >= CONFIDENCE_THRESHOLD;
  const c3 = input.recentEvidenceCount >= RECENT_EVIDENCE_MIN;
  const c4 =
    input.daysSinceLastCorrection === null ||
    input.daysSinceLastCorrection > NO_CORRECTION_DAYS;
  const c5 = Math.abs(input.rci) > RCI_THRESHOLD;
  return c1 && c2 && c3 && c4 && c5;
}

// ─────────────────────────────────────────────────────────────
// Property Tests
// ─────────────────────────────────────────────────────────────

describe('shift-detection property tests', () => {
  /**
   * P9: detectShift(input).shifted === true if and only if ALL five gates pass:
   *   hasParallelItem=true AND confidence>=0.50 AND recentEvidenceCount>=2
   *   AND (daysSinceLastCorrection>14 OR null) AND |rci|>1.96
   *
   * This is a biconditional: shifted ⟺ allGatesPass
   * **Validates: Requirements 9.1**
   */
  test('P9: shifted === true ⟺ all five gates pass (biconditional)', () => {
    fc.assert(
      fc.property(shiftGateInputArb, (input) => {
        const result = detectShift(input);
        const expected = allGatesPass(input);

        // The biconditional
        expect(result.shifted).toBe(expected);

        // Also verify each individual gate matches expectations
        expect(result.gates.parallelItem).toBe(input.hasParallelItem);
        expect(result.gates.confidence).toBe(input.confidence >= CONFIDENCE_THRESHOLD);
        expect(result.gates.recentEvidence).toBe(input.recentEvidenceCount >= RECENT_EVIDENCE_MIN);
        expect(result.gates.noCorrectionRecent).toBe(
          input.daysSinceLastCorrection === null ||
          input.daysSinceLastCorrection > NO_CORRECTION_DAYS,
        );
        expect(result.gates.rciSignificant).toBe(Math.abs(input.rci) > RCI_THRESHOLD);

        // When shifted, message must be the fixed text
        if (result.shifted) {
          expect(result.message).toBe(SHIFT_MESSAGE);
        }

        // dimension is always passed through
        expect(result.dimension).toBe(input.dimension);
      }),
      { numRuns: 1000 },
    );
  });
});
