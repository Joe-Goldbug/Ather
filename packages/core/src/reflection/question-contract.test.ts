import { describe, expect, test } from 'bun:test';
import {
  validateQuestionContract,
  type QuestionValidationError,
} from './validate-question.js';
import type { QuestionContract } from './question-contract.js';

function makeValidQuestion(
  overrides: Partial<QuestionContract> = {},
): QuestionContract {
  return {
    scenario_id: 'test-1',
    scenario_set: 'baseline_v1',
    version: '1.0.0',
    source: 'static',
    target_dimension: 'trustBoundaries',
    measurement_intent: 'reaction_to_ambiguous_intimacy',
    evidence_kind: 'formal',
    confidence_weight: 1.0,
    prompt: '当你遇到一个不太熟悉的人向你倾诉私事，你会？',
    options: [
      {
        id: 'A',
        text: '保持距离，礼貌回应',
        vector_patch: { trust_threshold: 0.9 },
      },
      {
        id: 'B',
        text: '适度回应，保持开放',
        vector_patch: { trust_threshold: 0.45 },
      },
      {
        id: 'C',
        text: '主动了解对方情况',
        vector_patch: { trust_threshold: 0.25 },
      },
      {
        id: 'D',
        text: '分享一个自己的类似经历',
        vector_patch: { trust_threshold: 0.1 },
      },
    ],
    ...overrides,
  };
}

// P0-5: 免费用户不能生成 calibration question
describe('validateQuestionContract — calibration for free user', () => {
  test('rejects calibration source for free user', () => {
    const q = makeValidQuestion({
      source: 'calibration',
      evidence_kind: 'calibration',
    });
    const result = validateQuestionContract(q, 'registered_free');
    expect(result.valid).toBe(false);
    expect(
      result.errors.some((e) => e.code === 'unauthorized_question_source'),
    ).toBe(true);
  });

  test('allows calibration for paid user', () => {
    const q = makeValidQuestion({
      source: 'calibration',
      evidence_kind: 'calibration',
    });
    const result = validateQuestionContract(q, 'paid');
    expect(result.valid).toBe(true);
  });
});

// P0-8: 动态题缺 vector_patch 时拒绝
describe('validateQuestionContract — missing vector_patch', () => {
  test('rejects option without vector_patch', () => {
    const q = makeValidQuestion();
    q.options = [
      { id: 'A', text: '选项A', vector_patch: { trust_threshold: 0.5 } },
      { id: 'B', text: '选项B', vector_patch: {} },
      { id: 'C', text: '选项C', vector_patch: { trust_threshold: 0.3 } },
      { id: 'D', text: '选项D', vector_patch: { trust_threshold: 0.1 } },
    ];
    const result = validateQuestionContract(q, 'registered_free');
    expect(result.valid).toBe(false);
    expect(
      result.errors.some((e) => e.code === 'missing_vector_patch'),
    ).toBe(true);
  });

  test('rejects llm_generated question with all empty vector_patches', () => {
    const q = makeValidQuestion({
      llm_generated: true,
      source: 'dynamic_llm',
      evidence_kind: 'practice',
    });
    q.options = [
      { id: 'A', text: '选项A', vector_patch: {} },
      { id: 'B', text: '选项B', vector_patch: {} },
      { id: 'C', text: '选项C', vector_patch: {} },
      { id: 'D', text: '选项D', vector_patch: {} },
    ];
    const result = validateQuestionContract(q, 'registered_free');
    expect(result.valid).toBe(false);
    expect(
      result.errors.some((e) => e.code === 'missing_vector_patch'),
    ).toBe(true);
  });
});

// P0-9: 动态题 vector_patch key 非白名单时拒绝
describe('validateQuestionContract — invalid vector_patch keys', () => {
  test('rejects vector_patch with unknown keys', () => {
    const q = makeValidQuestion({ llm_generated: true });
    q.options[0]!.vector_patch = {
      trust_threshold: 0.5,
      some_fake_dimension: 0.8,
    };
    const result = validateQuestionContract(q, 'registered_free');
    expect(result.valid).toBe(false);
    expect(
      result.errors.some((e) => e.code === 'invalid_vector_patch_key'),
    ).toBe(true);
  });
});

// 补充：少于 4 选项拒绝
describe('validateQuestionContract — option count', () => {
  test('rejects question with fewer than 4 options', () => {
    const q = makeValidQuestion();
    q.options = [
      { id: 'A', text: '选项A', vector_patch: { trust_threshold: 0.5 } },
      { id: 'B', text: '选项B', vector_patch: { trust_threshold: 0.5 } },
    ];
    const result = validateQuestionContract(q, 'registered_free');
    expect(result.valid).toBe(false);
    expect(
      result.errors.some((e) => e.code === 'invalid_option_count'),
    ).toBe(true);
  });
});

// 补充：必须有 target_dimension
describe('validateQuestionContract — target_dimension', () => {
  test('rejects question without target_dimension', () => {
    const q = makeValidQuestion({ target_dimension: '' });
    const result = validateQuestionContract(q, 'registered_free');
    expect(result.valid).toBe(false);
    expect(
      result.errors.some((e) => e.code === 'missing_target_dimension'),
    ).toBe(true);
  });
});

// BUG-3: evidence_kind=calibration 免费用户绕过
describe('validateQuestionContract — calibration evidence_kind for free user', () => {
  test('rejects calibration evidence_kind for free user even when source is dynamic_llm', () => {
    const q = makeValidQuestion({
      source: 'dynamic_llm',
      evidence_kind: 'calibration',
    });
    const result = validateQuestionContract(q, 'registered_free');
    expect(result.valid).toBe(false);
    expect(
      result.errors.some((e) => e.code === 'unauthorized_evidence_kind'),
    ).toBe(true);
  });

  test('rejects calibration evidence_kind for guest user', () => {
    const q = makeValidQuestion({
      source: 'dynamic_llm',
      evidence_kind: 'calibration',
    });
    const result = validateQuestionContract(q, 'guest');
    expect(result.valid).toBe(false);
    expect(
      result.errors.some((e) => e.code === 'unauthorized_evidence_kind'),
    ).toBe(true);
  });

  test('allows calibration evidence_kind for paid user', () => {
    const q = makeValidQuestion({
      source: 'dynamic_llm',
      evidence_kind: 'calibration',
    });
    const result = validateQuestionContract(q, 'paid');
    expect(result.valid).toBe(true);
  });
});
