// packages/core/src/progression/stages.test.ts
// Unit tests for stage unlock engine

import { describe, test, expect } from 'bun:test';
import {
  evaluateStage2Unlock,
  evaluateStage3Unlock,
  STAGE2_MIN_DIMENSIONS,
  STAGE2_MIN_SOURCES,
  STAGE2_MIN_CORRECTIONS,
  STAGE2_MIN_DAYS,
  type Stage2UnlockInput,
} from './stages.js';

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

/** Input that satisfies ALL five conditions */
function allMetInput(): Stage2UnlockInput {
  return {
    dimensionsAtThreshold: 4,
    hasContradictions: false,
    distinctSourceCount: 2,
    correctionCount: 1,
    daysSinceFirstEvidence: 7,
  };
}

// ─────────────────────────────────────────────────────────────
// evaluateStage2Unlock
// ─────────────────────────────────────────────────────────────

describe('evaluateStage2Unlock', () => {
  test('returns unlocked when all five conditions are met', () => {
    const result = evaluateStage2Unlock(allMetInput());
    expect(result.unlocked).toBe(true);
    expect(result.stage).toBe(2);
    expect(result.gaps).toEqual([]);
  });

  test('returns unlocked when conditions exceed thresholds', () => {
    const result = evaluateStage2Unlock({
      dimensionsAtThreshold: 8,
      hasContradictions: false,
      distinctSourceCount: 3,
      correctionCount: 10,
      daysSinceFirstEvidence: 30,
    });
    expect(result.unlocked).toBe(true);
    expect(result.stage).toBe(2);
    expect(result.gaps).toEqual([]);
  });

  test('locked when dimensionsAtThreshold < 4', () => {
    const input = { ...allMetInput(), dimensionsAtThreshold: 3 };
    const result = evaluateStage2Unlock(input);
    expect(result.unlocked).toBe(false);
    expect(result.stage).toBe(1);
    expect(result.gaps).toContain('需要更多维度达到可信阈值');
  });

  test('locked when hasContradictions is true', () => {
    const input = { ...allMetInput(), hasContradictions: true };
    const result = evaluateStage2Unlock(input);
    expect(result.unlocked).toBe(false);
    expect(result.stage).toBe(1);
    expect(result.gaps).toContain('存在未解决的矛盾证据');
  });

  test('locked when distinctSourceCount < 2', () => {
    const input = { ...allMetInput(), distinctSourceCount: 1 };
    const result = evaluateStage2Unlock(input);
    expect(result.unlocked).toBe(false);
    expect(result.stage).toBe(1);
    expect(result.gaps).toContain('需要更多来源类型的证据');
  });

  test('locked when correctionCount < 1', () => {
    const input = { ...allMetInput(), correctionCount: 0 };
    const result = evaluateStage2Unlock(input);
    expect(result.unlocked).toBe(false);
    expect(result.stage).toBe(1);
    expect(result.gaps).toContain('需要至少一次纠正反馈');
  });

  test('locked when daysSinceFirstEvidence < 7', () => {
    const input = { ...allMetInput(), daysSinceFirstEvidence: 6 };
    const result = evaluateStage2Unlock(input);
    expect(result.unlocked).toBe(false);
    expect(result.stage).toBe(1);
    expect(result.gaps).toContain('模型需要更多时间成熟');
  });

  test('accumulates multiple gaps when multiple conditions fail', () => {
    const input: Stage2UnlockInput = {
      dimensionsAtThreshold: 2,
      hasContradictions: true,
      distinctSourceCount: 0,
      correctionCount: 0,
      daysSinceFirstEvidence: 3,
    };
    const result = evaluateStage2Unlock(input);
    expect(result.unlocked).toBe(false);
    expect(result.stage).toBe(1);
    expect(result.gaps).toHaveLength(5);
    expect(result.gaps).toContain('需要更多维度达到可信阈值');
    expect(result.gaps).toContain('存在未解决的矛盾证据');
    expect(result.gaps).toContain('需要更多来源类型的证据');
    expect(result.gaps).toContain('需要至少一次纠正反馈');
    expect(result.gaps).toContain('模型需要更多时间成熟');
  });

  test('boundary: exactly at thresholds unlocks', () => {
    // Exactly at minimum values for all conditions
    const result = evaluateStage2Unlock({
      dimensionsAtThreshold: STAGE2_MIN_DIMENSIONS,
      hasContradictions: false,
      distinctSourceCount: STAGE2_MIN_SOURCES,
      correctionCount: STAGE2_MIN_CORRECTIONS,
      daysSinceFirstEvidence: STAGE2_MIN_DAYS,
    });
    expect(result.unlocked).toBe(true);
    expect(result.stage).toBe(2);
  });

  test('boundary: one below threshold on each dimension locks', () => {
    // dimensionsAtThreshold = 3 (one below 4)
    const r1 = evaluateStage2Unlock({ ...allMetInput(), dimensionsAtThreshold: STAGE2_MIN_DIMENSIONS - 1 });
    expect(r1.unlocked).toBe(false);

    // distinctSourceCount = 1 (one below 2)
    const r2 = evaluateStage2Unlock({ ...allMetInput(), distinctSourceCount: STAGE2_MIN_SOURCES - 1 });
    expect(r2.unlocked).toBe(false);

    // correctionCount = 0 (one below 1)
    const r3 = evaluateStage2Unlock({ ...allMetInput(), correctionCount: STAGE2_MIN_CORRECTIONS - 1 });
    expect(r3.unlocked).toBe(false);

    // daysSinceFirstEvidence = 6 (one below 7)
    const r4 = evaluateStage2Unlock({ ...allMetInput(), daysSinceFirstEvidence: STAGE2_MIN_DAYS - 1 });
    expect(r4.unlocked).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────
// evaluateStage3Unlock
// ─────────────────────────────────────────────────────────────

describe('evaluateStage3Unlock', () => {
  test('always returns locked with stage3_reserved reason', () => {
    const result = evaluateStage3Unlock();
    expect(result.unlocked).toBe(false);
    expect(result.stage).toBe(2);
    expect(result.gaps).toContain('stage3_reserved');
  });
});
