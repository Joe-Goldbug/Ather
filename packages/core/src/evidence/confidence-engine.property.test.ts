// packages/core/src/evidence/confidence-engine.property.test.ts
// Property-based tests for the four-factor confidence engine
// Uses fast-check to verify invariants P3, P4, P5

import { describe, test, expect } from 'bun:test';
import * as fc from 'fast-check';
import { computeDimensionConfidence } from './confidence-engine.js';
import type { ComputeConfidenceInput } from './confidence-engine.js';
import type { EvidenceEventRow } from './evidence-types.js';
import type { EvidenceKind } from './evidence-weights.js';

// ─────────────────────────────────────────────────────────────
// Arbitraries / Generators
// ─────────────────────────────────────────────────────────────

const evidenceKindArb: fc.Arbitrary<EvidenceKind> = fc.constantFrom(
  'formal',
  'practice',
  'calibration',
  'reality',
  'decision',
  'correction',
);

const testOnlyKindArb: fc.Arbitrary<EvidenceKind> = fc.constantFrom(
  'formal',
  'practice',
  'calibration',
);

const sourceTypeArb = fc.constantFrom(
  'test' as const,
  'chat' as const,
  'diary' as const,
  'user_correction' as const,
);

function makeEvidenceEventArb(kindArb?: fc.Arbitrary<EvidenceKind>): fc.Arbitrary<EvidenceEventRow> {
  const kindGen = kindArb ?? evidenceKindArb;
  return fc.record({
    id: fc.uuid(),
    user_id: fc.uuid(),
    source_type: sourceTypeArb,
    source_id: fc.constant(null),
    dimension: fc.constant('trustBoundaries'),
    delta: fc.oneof(fc.double({ min: -30, max: 30, noNaN: true }), fc.constant(null)),
    weight: fc.double({ min: 0.1, max: 2.0, noNaN: true }),
    confidence: fc.double({ min: 0.1, max: 1.0, noNaN: true }),
    quote: fc.constant(null),
    explanation: fc.constant('test evidence'),
    created_at: fc.date({ min: new Date('2024-01-01'), max: new Date('2025-12-31') }),
    evidence_kind: kindGen,
    local_date: fc.constantFrom('2024-06-01', '2024-06-02', '2024-06-03', '2024-06-04', '2024-06-05'),
    candidate: fc.constant(false),
    evidence_mode: fc.constantFrom('choice' as const, 'input' as const),
  });
}

function makeComputeInputArb(kindArb?: fc.Arbitrary<EvidenceKind>): fc.Arbitrary<ComputeConfidenceInput> {
  return fc.record({
    dimension: fc.constant('trustBoundaries'),
    baseValue: fc.double({ min: 0, max: 100, noNaN: true }),
    events: fc.array(makeEvidenceEventArb(kindArb), { minLength: 1, maxLength: 12 }),
    calibrationTimestamps: fc.array(
      fc.integer({ min: 1700000000000, max: 1750000000000 }),
      { minLength: 0, maxLength: 5 },
    ),
    now: fc.constant(1720000000000),
  });
}

// ─────────────────────────────────────────────────────────────
// Property Tests
// ─────────────────────────────────────────────────────────────

describe('confidence-engine property tests', () => {
  /**
   * P3: confidence == min(factors), clamped to [0.1, 1.0]
   * **Validates: Requirements 7.1**
   */
  test('P3: confidence equals clamped min of all four factors', () => {
    fc.assert(
      fc.property(makeComputeInputArb(), (input) => {
        const result = computeDimensionConfidence(input);
        const { sufficiency, consistency, sourceCoverage, calibration } = result.factors;
        const rawMin = Math.min(sufficiency, consistency, sourceCoverage, calibration);
        const expectedConfidence = Math.max(0.1, Math.min(1.0, rawMin));

        // Use approximate comparison for floating point
        expect(Math.abs(result.confidence - expectedConfidence)).toBeLessThan(1e-10);
      }),
      { numRuns: 500 },
    );
  });

  /**
   * P4: confidence <= sourceCoverage
   * **Validates: Requirements 7.2**
   */
  test('P4: confidence never exceeds sourceCoverage factor', () => {
    fc.assert(
      fc.property(makeComputeInputArb(), (input) => {
        const result = computeDimensionConfidence(input);
        // confidence = min(all factors) so it must be <= each individual factor
        expect(result.confidence).toBeLessThanOrEqual(result.factors.sourceCoverage + 1e-10);
      }),
      { numRuns: 500 },
    );
  });

  /**
   * P5: When ALL events have test-only evidence_kind, sourceCoverage <= 0.60
   * **Validates: Requirements 7.3**
   */
  test('P5: test-only evidence yields sourceCoverage <= 0.60', () => {
    fc.assert(
      fc.property(makeComputeInputArb(testOnlyKindArb), (input) => {
        const result = computeDimensionConfidence(input);
        expect(result.factors.sourceCoverage).toBeLessThanOrEqual(0.60);
      }),
      { numRuns: 500 },
    );
  });
});
