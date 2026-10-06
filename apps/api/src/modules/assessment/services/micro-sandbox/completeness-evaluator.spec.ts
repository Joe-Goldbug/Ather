// apps/api/src/modules/assessment/services/micro-sandbox/completeness-evaluator.spec.ts
import { describe, test, expect } from '@jest/globals';
import { CompletenessEvaluator } from './completeness-evaluator.js';

describe('CompletenessEvaluator.shouldTerminate', () => {
  const eval_ = new CompletenessEvaluator({
    minTurns: 3,
    maxTurns: 5,
    threshold: 0.7,
  });

  test('terminates when minTurns reached AND all dimensions >= threshold', () => {
    const progress = { scenario: 0.8, emotion: 0.8, background: 0.8, relationship: 0.8 };
    expect(eval_.shouldTerminate(3, progress)).toBe(true);
  });

  test('does NOT terminate if below minTurns even when all dims pass', () => {
    const progress = { scenario: 1.0, emotion: 1.0, background: 1.0, relationship: 1.0 };
    expect(eval_.shouldTerminate(2, progress)).toBe(false);
  });

  test('does NOT terminate if any dimension below threshold at minTurns', () => {
    const progress = { scenario: 0.8, emotion: 0.5, background: 0.8, relationship: 0.8 };
    expect(eval_.shouldTerminate(3, progress)).toBe(false);
  });

  test('terminates at maxTurns even if dimensions not all >= threshold', () => {
    const progress = { scenario: 0.5, emotion: 0.5, background: 0.5, relationship: 0.5 };
    expect(eval_.shouldTerminate(5, progress)).toBe(true);
  });

  test('does NOT terminate below minTurns', () => {
    const progress = { scenario: 0.8, emotion: 0.8, background: 0.8, relationship: 0.8 };
    expect(eval_.shouldTerminate(1, progress)).toBe(false);
  });
});