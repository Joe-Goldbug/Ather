import { describe, expect, test } from 'bun:test';
import {
  decideNextQuestion,
  safeQuestionKind,
  type RouterInput,
  type RouterInputDimension,
} from './next-question-router.js';

function makeDim(
  dimension: string,
  overrides: Partial<RouterInputDimension> = {},
): RouterInputDimension {
  return {
    dimension,
    evidence_count: 10,
    confidence: 0.7,
    has_contradiction: false,
    current_value: 60,
    ...overrides,
  };
}

function makeInput(
  overrides: Partial<RouterInput> = {},
): RouterInput {
  return {
    dimensions: [
      makeDim('trustBoundaries'),
      makeDim('conflictResponse'),
      makeDim('attachment'),
      makeDim('emotionRegulation'),
      makeDim('stressResponse'),
      makeDim('achievementMotivation'),
      makeDim('selfCognition'),
      makeDim('socialEnergy'),
    ],
    user_tier: 'registered_free',
    now: Date.now(),
    ...overrides,
  };
}

// P0-7: Router in low_confidence -> free:practice, paid:calibration
describe('Router — low_confidence routing', () => {
  test('free user gets practice when low confidence', () => {
    const input = makeInput({
      dimensions: [
        makeDim('trustBoundaries', { confidence: 0.3, evidence_count: 5 }),
        makeDim('conflictResponse'),
      ],
    });
    const result = decideNextQuestion(input);
    expect(result).not.toBeNull();
    expect(result!.reason).toBe('low_confidence');
    expect(result!.question_kind).toBe('practice');
  });

  test('paid user gets calibration when low confidence', () => {
    const input = makeInput({
      user_tier: 'paid',
      dimensions: [
        makeDim('trustBoundaries', { confidence: 0.3, evidence_count: 5 }),
        makeDim('conflictResponse'),
      ],
    });
    const result = decideNextQuestion(input);
    expect(result).not.toBeNull();
    expect(result!.reason).toBe('low_confidence');
    expect(result!.question_kind).toBe('calibration');
  });
});

describe('Router — contradiction priority', () => {
  test('contradiction takes priority over low evidence', () => {
    const input = makeInput({
      dimensions: [
        makeDim('trustBoundaries', { evidence_count: 1, has_contradiction: false }),
        makeDim('conflictResponse', {
          evidence_count: 10,
          has_contradiction: true,
          confidence: 0.4,
        }),
      ],
    });
    const result = decideNextQuestion(input);
    expect(result).not.toBeNull();
    expect(result!.reason).toBe('contradiction');
    expect(result!.target_dimension).toBe('conflictResponse');
  });
});

describe('Router — low_evidence', () => {
  test('routes to dimension with fewest evidence', () => {
    const input = makeInput({
      dimensions: [
        makeDim('trustBoundaries', { evidence_count: 1 }),
        makeDim('conflictResponse', { evidence_count: 2 }),
        makeDim('attachment', { evidence_count: 10 }),
      ],
    });
    const result = decideNextQuestion(input);
    expect(result).not.toBeNull();
    expect(result!.reason).toBe('low_evidence');
    expect(result!.target_dimension).toBe('trustBoundaries');
  });
});

describe('Router — stale_dimension', () => {
  test('routes to stale dimension', () => {
    const now = Date.now();
    const staleTime = now - 31 * 24 * 60 * 60 * 1000;
    const input = makeInput({
      now,
      dimensions: [
        makeDim('trustBoundaries', {
          evidence_count: 10,
          confidence: 0.8,
          last_tested_at: staleTime,
        }),
        makeDim('conflictResponse', {
          evidence_count: 10,
          confidence: 0.8,
          last_tested_at: now,
        }),
      ],
    });
    const result = decideNextQuestion(input);
    expect(result).not.toBeNull();
    expect(result!.reason).toBe('stale_dimension');
  });
});

describe('Router — recent_change', () => {
  test('routes to dimension with recent significant change', () => {
    const input = makeInput({
      dimensions: [
        makeDim('trustBoundaries', {
          evidence_count: 10,
          confidence: 0.7,
          current_value: 80,
          previous_value: 50,
        }),
      ],
    });
    const result = decideNextQuestion(input);
    expect(result).not.toBeNull();
    expect(result!.reason).toBe('recent_change');
  });
});

describe('Router — paid_calibration', () => {
  test('paid user gets paid_calibration when all dimensions are stable', () => {
    const input = makeInput({
      user_tier: 'paid',
      dimensions: [
        makeDim('trustBoundaries', {
          evidence_count: 20,
          confidence: 0.8,
        }),
        makeDim('conflictResponse', {
          evidence_count: 20,
          confidence: 0.85,
        }),
      ],
    });
    const result = decideNextQuestion(input);
    expect(result).not.toBeNull();
    expect(result!.reason).toBe('paid_calibration');
    expect(result!.question_kind).toBe('calibration');
  });
});

describe('Router — coverage_balance', () => {
  test('falls back to coverage balance for free user with stable dimensions', () => {
    const input = makeInput({
      user_tier: 'registered_free',
      dimensions: [
        makeDim('trustBoundaries', {
          evidence_count: 20,
          confidence: 0.9,
        }),
        makeDim('conflictResponse', {
          evidence_count: 10,
          confidence: 0.5,
        }),
      ],
    });
    const result = decideNextQuestion(input);
    expect(result).not.toBeNull();
    expect(result!.reason).toBe('coverage_balance');
  });
});

describe('Router — empty input', () => {
  test('returns null for empty dimensions', () => {
    const result = decideNextQuestion({
      dimensions: [],
      user_tier: 'registered_free',
      now: Date.now(),
    });
    expect(result).toBeNull();
  });
});

describe('safeQuestionKind', () => {
  test('downgrades calibration to practice for free user', () => {
    expect(safeQuestionKind('registered_free', 'calibration')).toBe('practice');
  });

  test('keeps calibration for paid user', () => {
    expect(safeQuestionKind('paid', 'calibration')).toBe('calibration');
  });

  test('keeps formal for free user', () => {
    expect(safeQuestionKind('registered_free', 'formal')).toBe('formal');
  });
});
