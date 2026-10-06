// packages/core/src/evidence/correction-candidate.property.test.ts
// Property-based tests for the correction candidate mechanism
// Uses fast-check to verify invariants P7 and P6

import { describe, test, expect } from 'bun:test';
import * as fc from 'fast-check';
import { buildCorrectionCandidate, evaluateCandidateVerification } from './correction-candidate.js';
import type { CorrectionInput } from './correction-candidate.js';
import { computeDimensionConfidence } from './confidence-engine.js';
import type { EvidenceEventRow } from './evidence-types.js';
import type { EvidenceKind } from './evidence-weights.js';

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

const sourceTypeArb = fc.constantFrom(
  'report_claim' as const,
  'chat_claim' as const,
  'assessment_claim' as const,
);

const correctionInputArb: fc.Arbitrary<CorrectionInput> = fc.record({
  userId: fc.uuid(),
  dimension: dimensionArb,
  sourceType: sourceTypeArb,
  sourceId: fc.oneof(fc.uuid(), fc.constant(null)),
  originalText: fc.string({ minLength: 1, maxLength: 100 }),
  correctedText: fc.string({ minLength: 1, maxLength: 100 }),
  explanation: fc.option(fc.string({ minLength: 1, maxLength: 200 }), { nil: undefined }),
});

const evidenceKindArb: fc.Arbitrary<EvidenceKind> = fc.constantFrom(
  'formal',
  'practice',
  'calibration',
  'reality',
  'decision',
  'correction',
);

const dbSourceTypeArb = fc.constantFrom(
  'test' as const,
  'chat' as const,
  'diary' as const,
  'user_correction' as const,
);

function makeEvidenceEventArb(overrides?: {
  dimension?: string;
  candidate?: boolean;
  deltaSign?: 'positive' | 'negative';
}): fc.Arbitrary<EvidenceEventRow> {
  const deltaArb = overrides?.deltaSign === 'positive'
    ? fc.double({ min: 0.1, max: 30, noNaN: true })
    : overrides?.deltaSign === 'negative'
      ? fc.double({ min: -30, max: -0.1, noNaN: true })
      : fc.oneof(fc.double({ min: -30, max: 30, noNaN: true }), fc.constant(null));

  return fc.record({
    id: fc.uuid(),
    user_id: fc.uuid(),
    source_type: dbSourceTypeArb,
    source_id: fc.constant(null),
    dimension: fc.constant(overrides?.dimension ?? 'trustBoundaries'),
    delta: deltaArb,
    weight: fc.double({ min: 0.1, max: 2.0, noNaN: true }),
    confidence: fc.double({ min: 0.1, max: 1.0, noNaN: true }),
    quote: fc.constant(null),
    explanation: fc.constant('test evidence'),
    created_at: fc.date({ min: new Date('2024-01-01'), max: new Date('2025-12-31') }),
    evidence_kind: evidenceKindArb,
    local_date: fc.constantFrom('2024-06-01', '2024-06-02', '2024-06-03'),
    candidate: fc.constant(overrides?.candidate ?? false),
    evidence_mode: fc.constantFrom('choice' as const, 'input' as const),
  });
}

// ─────────────────────────────────────────────────────────────
// Property Tests
// ─────────────────────────────────────────────────────────────

describe('correction-candidate property tests', () => {
  /**
   * P7 (part 1): buildCorrectionCandidate always returns candidateWeight === 0.8
   * **Validates: Requirements 8.1**
   */
  test('P7a: unverified candidate always has weight 0.8', () => {
    fc.assert(
      fc.property(correctionInputArb, (input) => {
        const candidate = buildCorrectionCandidate(input);
        expect(candidate.candidateWeight).toBe(0.8);
        expect(candidate.maturityPenalty).toBe(0.5);
        expect(candidate.dimension).toBe(input.dimension);
        expect(candidate.correctionId).toBeTruthy();
      }),
      { numRuns: 500 },
    );
  });

  /**
   * P7 (part 2): When verified (same-dimension same-direction evidence exists),
   * promotedWeight === 1.0
   * **Validates: Requirements 8.1**
   */
  test('P7b: verified candidate promoted to weight 1.0', () => {
    fc.assert(
      fc.property(
        correctionInputArb,
        fc.array(makeEvidenceEventArb({ dimension: 'trustBoundaries', candidate: false, deltaSign: 'positive' }), { minLength: 1, maxLength: 5 }),
        (input, subsequentEvidence) => {
          // Force dimension alignment
          const correctedInput = { ...input, dimension: 'trustBoundaries' };
          const candidate = buildCorrectionCandidate(correctedInput);
          const result = evaluateCandidateVerification(candidate, subsequentEvidence);
          expect(result.verified).toBe(true);
          expect(result.promotedWeight).toBe(1.0);
        },
      ),
      { numRuns: 500 },
    );
  });

  /**
   * P7 (part 3): When NO same-direction evidence exists, remains unverified at 0.8
   * **Validates: Requirements 8.1**
   */
  test('P7c: no matching evidence keeps candidate at 0.8', () => {
    fc.assert(
      fc.property(
        correctionInputArb,
        (input) => {
          const candidate = buildCorrectionCandidate(input);
          // Empty subsequent evidence
          const result = evaluateCandidateVerification(candidate, []);
          expect(result.verified).toBe(false);
          expect(result.promotedWeight).toBe(0.8);
        },
      ),
      { numRuns: 500 },
    );
  });

  /**
   * P6: candidate=true events do NOT affect confidence computation.
   * The confidence engine must filter them out.
   * **Validates: Requirements 6.1**
   */
  test('P6: candidate events do not affect confidence result', () => {
    fc.assert(
      fc.property(
        // Generate base non-candidate events
        fc.array(makeEvidenceEventArb({ dimension: 'trustBoundaries', candidate: false }), { minLength: 1, maxLength: 8 }),
        // Generate candidate events (should be ignored)
        fc.array(makeEvidenceEventArb({ dimension: 'trustBoundaries', candidate: true }), { minLength: 1, maxLength: 5 }),
        fc.double({ min: 0, max: 100, noNaN: true }),
        (baseEvents, candidateEvents, baseValue) => {
          const now = 1720000000000;
          const calibrationTimestamps: number[] = [];

          // Compute with only base events
          const resultWithoutCandidates = computeDimensionConfidence({
            dimension: 'trustBoundaries',
            baseValue,
            events: baseEvents,
            calibrationTimestamps,
            now,
          });

          // Compute with base + candidate events mixed in
          const mixedEvents = [...baseEvents, ...candidateEvents];
          const resultWithCandidates = computeDimensionConfidence({
            dimension: 'trustBoundaries',
            baseValue,
            events: mixedEvents,
            calibrationTimestamps,
            now,
          });

          // Confidence must be identical — candidates are filtered out
          expect(resultWithCandidates.confidence).toBe(resultWithoutCandidates.confidence);
          expect(resultWithCandidates.factors.sufficiency).toBe(resultWithoutCandidates.factors.sufficiency);
          expect(resultWithCandidates.factors.consistency).toBe(resultWithoutCandidates.factors.consistency);
          expect(resultWithCandidates.factors.sourceCoverage).toBe(resultWithoutCandidates.factors.sourceCoverage);
          expect(resultWithCandidates.factors.calibration).toBe(resultWithoutCandidates.factors.calibration);
        },
      ),
      { numRuns: 500 },
    );
  });
});
