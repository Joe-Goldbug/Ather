// packages/core/src/progression/stages.property.test.ts
// Property-based tests for Stage 2 unlock engine
// Uses fast-check to verify invariant P14

import { describe, test, expect } from 'bun:test';
import * as fc from 'fast-check';
import {
  evaluateStage2Unlock,
  STAGE2_MIN_DIMENSIONS,
  STAGE2_MIN_SOURCES,
  STAGE2_MIN_CORRECTIONS,
  STAGE2_MIN_DAYS,
  type Stage2UnlockInput,
} from './stages.js';

// ─────────────────────────────────────────────────────────────
// Arbitraries / Generators
// ─────────────────────────────────────────────────────────────

/**
 * Generator for Stage2UnlockInput that covers the full input space:
 * - dimensionsAtThreshold: 0..8 (8 core dimensions max)
 * - hasContradictions: boolean
 * - distinctSourceCount: 0..3 (test/capture/decision)
 * - correctionCount: 0..20
 * - daysSinceFirstEvidence: 0..60
 */
const stage2UnlockInputArb: fc.Arbitrary<Stage2UnlockInput> = fc.record({
  dimensionsAtThreshold: fc.integer({ min: 0, max: 8 }),
  hasContradictions: fc.boolean(),
  distinctSourceCount: fc.integer({ min: 0, max: 3 }),
  correctionCount: fc.integer({ min: 0, max: 20 }),
  daysSinceFirstEvidence: fc.integer({ min: 0, max: 60 }),
});

// ─────────────────────────────────────────────────────────────
// Helper: compute expected unlock result from raw input
// ─────────────────────────────────────────────────────────────

function allConditionsMet(input: Stage2UnlockInput): boolean {
  return (
    input.dimensionsAtThreshold >= STAGE2_MIN_DIMENSIONS &&
    !input.hasContradictions &&
    input.distinctSourceCount >= STAGE2_MIN_SOURCES &&
    input.correctionCount >= STAGE2_MIN_CORRECTIONS &&
    input.daysSinceFirstEvidence >= STAGE2_MIN_DAYS
  );
}

// ─────────────────────────────────────────────────────────────
// Property Tests
// ─────────────────────────────────────────────────────────────

describe('stage2 unlock property tests', () => {
  /**
   * P14: evaluateStage2Unlock(input).unlocked === true if and only if ALL five conditions met:
   *   dimensionsAtThreshold >= 4 AND !hasContradictions AND distinctSourceCount >= 2
   *   AND correctionCount >= 1 AND daysSinceFirstEvidence >= 7
   *
   * This is a biconditional: unlocked ⟺ allConditionsMet
   * **Validates: Requirements 11.1**
   */
  test('P14: unlocked === true ⟺ all five conditions met (biconditional)', () => {
    fc.assert(
      fc.property(stage2UnlockInputArb, (input) => {
        const result = evaluateStage2Unlock(input);
        const expected = allConditionsMet(input);

        // The biconditional
        expect(result.unlocked).toBe(expected);

        // Stage correctness
        if (result.unlocked) {
          expect(result.stage).toBe(2);
          expect(result.gaps).toHaveLength(0);
        } else {
          expect(result.stage).toBe(1);
          expect(result.gaps.length).toBeGreaterThan(0);
        }

        // Verify gaps are accurate per condition
        if (input.dimensionsAtThreshold < STAGE2_MIN_DIMENSIONS) {
          expect(result.gaps).toContain('需要更多维度达到可信阈值');
        }
        if (input.hasContradictions) {
          expect(result.gaps).toContain('存在未解决的矛盾证据');
        }
        if (input.distinctSourceCount < STAGE2_MIN_SOURCES) {
          expect(result.gaps).toContain('需要更多来源类型的证据');
        }
        if (input.correctionCount < STAGE2_MIN_CORRECTIONS) {
          expect(result.gaps).toContain('需要至少一次纠正反馈');
        }
        if (input.daysSinceFirstEvidence < STAGE2_MIN_DAYS) {
          expect(result.gaps).toContain('模型需要更多时间成熟');
        }
      }),
      { numRuns: 1000 },
    );
  });
});
