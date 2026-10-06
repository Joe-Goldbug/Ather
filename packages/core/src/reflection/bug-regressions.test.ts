// packages/core/src/reflection/bug-regressions.test.ts
// 7 BUG regression tests — each test reproduces a real bug found during audit.

import { describe, expect, test } from 'bun:test';
import { decideNextQuestion, safeQuestionKind } from './next-question-router.js';
import { validateLLMExplanation } from './validation-gate.js';
import { validateQuestionContract } from './validate-question.js';
import type { RouterInputDimension } from './next-question-router.js';
import type { QuestionContract } from './question-contract.js';
import type { LLMExplanationContract } from './llm-explanation-contract.js';

// ════════════════════════════════════════════════════════════════
// BUG-1: Router immutability — input array must not be mutated
// 严重度: 🔴 Critical (assertion corrected: the .sort() in current code
// operates on filter() return values, which are already new arrays.
// But it's fragile — re-assert here to lock down the contract.)
// ════════════════════════════════════════════════════════════════
describe('BUG-1: Router must not mutate input dimensions array', () => {
  test('decideNextQuestion does not reorder or mutate input dimensions array', () => {
    const original: RouterInputDimension[] = [
      {
        dimension: 'attachment',
        evidence_count: 1,
        confidence: 0.7,
        has_contradiction: false,
        current_value: 60,
      },
      {
        dimension: 'socialEnergy',
        evidence_count: 1,
        confidence: 0.7,
        has_contradiction: false,
        current_value: 60,
      },
      {
        dimension: 'trustBoundaries',
        evidence_count: 1,
        confidence: 0.7,
        has_contradiction: false,
        current_value: 60,
      },
    ];

    const snapshotBefore = original.map((d) => d.dimension);
    const snapshotJson = JSON.stringify(original);

    decideNextQuestion({
      dimensions: original,
      user_tier: 'registered_free',
      now: Date.now(),
    });

    const snapshotAfter = original.map((d) => d.dimension);
    expect(snapshotAfter).toEqual(snapshotBefore);
    expect(JSON.stringify(original)).toBe(snapshotJson);
  });

  test('Router is a pure function — same input produces same output across multiple calls', () => {
    const dims: RouterInputDimension[] = [
      {
        dimension: 'trustBoundaries',
        evidence_count: 10,
        confidence: 0.8,
        has_contradiction: false,
        last_tested_at: 1000,
        current_value: 60,
      },
      {
        dimension: 'attachment',
        evidence_count: 10,
        confidence: 0.8,
        has_contradiction: false,
        last_tested_at: 1000,
        current_value: 60,
      },
    ];

    const input = {
      dimensions: dims,
      user_tier: 'registered_free' as const,
      now: 1000 + 60 * 24 * 60 * 60 * 1000,
    };

    const r1 = decideNextQuestion(input);
    const r2 = decideNextQuestion(input);
    const r3 = decideNextQuestion(input);

    expect(r1).toEqual(r2);
    expect(r2).toEqual(r3);
  });
});

// ════════════════════════════════════════════════════════════════
// BUG-2: Stale-dimension tie-breaking non-deterministic
// 严重度: 🔴 Critical
// ════════════════════════════════════════════════════════════════
describe('BUG-2: Router must be deterministic for equal timestamps', () => {
  test('stale_dimension routing is deterministic when last_tested_at ties', () => {
    const sameTime = 1000;
    const dims: RouterInputDimension[] = [
      {
        dimension: 'attachment',
        evidence_count: 10,
        confidence: 0.8,
        has_contradiction: false,
        last_tested_at: sameTime,
        current_value: 60,
      },
      {
        dimension: 'socialEnergy',
        evidence_count: 10,
        confidence: 0.8,
        has_contradiction: false,
        last_tested_at: sameTime,
        current_value: 60,
      },
      {
        dimension: 'trustBoundaries',
        evidence_count: 10,
        confidence: 0.8,
        has_contradiction: false,
        last_tested_at: sameTime,
        current_value: 60,
      },
    ];

    const run1 = decideNextQuestion({
      dimensions: dims,
      user_tier: 'registered_free',
      now: sameTime + 60 * 24 * 60 * 60 * 1000,
    });

    const run2 = decideNextQuestion({
      dimensions: dims,
      user_tier: 'registered_free',
      now: sameTime + 60 * 24 * 60 * 60 * 1000,
    });

    expect(run1).not.toBeNull();
    expect(run2).not.toBeNull();
    expect(run1!.target_dimension).toBe(run2!.target_dimension);
  });

  test('priority order for tie-breaking is alphabetic on dimension name', () => {
    const sameTime = 1000;
    const dims: RouterInputDimension[] = [
      {
        dimension: 'socialEnergy',
        evidence_count: 10,
        confidence: 0.8,
        has_contradiction: false,
        last_tested_at: sameTime,
        current_value: 60,
      },
      {
        dimension: 'attachment',
        evidence_count: 10,
        confidence: 0.8,
        has_contradiction: false,
        last_tested_at: sameTime,
        current_value: 60,
      },
    ];

    const result = decideNextQuestion({
      dimensions: dims,
      user_tier: 'registered_free',
      now: sameTime + 60 * 24 * 60 * 60 * 1000,
    });

    // alphabetic tie-break: 'attachment' < 'socialEnergy'
    expect(result!.target_dimension).toBe('attachment');
  });
});

// ════════════════════════════════════════════════════════════════
// BUG-3: checkDiagnostic only reports first matching pattern
// 严重度: 🟡 High
// ════════════════════════════════════════════════════════════════
describe('BUG-3: checkDiagnostic must report ALL diagnostic patterns', () => {
  test('detects both mental illness AND personality disorder patterns in summary', () => {
    const expl: LLMExplanationContract = {
      headline: '你的变化',
      summary: 'This shows personality disorder and mental illness patterns.',
      changed_dimensions: [],
      stable_dimensions: [],
      uncertainty_notes: [],
      next_step: {
        action_type: 'next_test',
        label: '继续',
        reason: '继续',
      },
    };

    const result = validateLLMExplanation(expl, {
      allowed_dimensions: ['trustBoundaries'],
      user_tier: 'registered_free',
      confidence_by_dim: { trustBoundaries: 0.7 },
    });

    const diagErrors = result.errors.filter(
      (e) => e.code === 'diagnostic_language',
    );
    expect(diagErrors.length).toBe(2);
  });
});

// ════════════════════════════════════════════════════════════════
// BUG-4: checkOverconfidence may produce duplicate errors per dimension
// 严重度: 🟡 High
// ════════════════════════════════════════════════════════════════
describe('BUG-4: checkOverconfidence must dedupe per dimension', () => {
  test('produces at most one overconfident_claim error per dimension', () => {
    const expl: LLMExplanationContract = {
      headline: '你的变化',
      summary: '总结',
      changed_dimensions: [
        {
          dimension: 'trustBoundaries',
          change_label: '改变',
          explanation: '确定是这样的',
          confidence_phrase: '毫无疑问是确定的',
        },
      ],
      stable_dimensions: [],
      uncertainty_notes: [],
      next_step: {
        action_type: 'next_test',
        label: '继续',
        reason: '继续',
      },
    };

    const result = validateLLMExplanation(expl, {
      allowed_dimensions: ['trustBoundaries'],
      user_tier: 'registered_free',
      confidence_by_dim: { trustBoundaries: 0.2 },
    });

    const errors = result.errors.filter(
      (e) => e.code === 'overconfident_claim',
    );
    expect(errors.length).toBe(1);
    expect(errors[0]!.message).toContain('trustBoundaries');
  });
});

// ════════════════════════════════════════════════════════════════
// BUG-5: safeQuestionKind allows practice for guest (should only be next_test/profile_view)
// 严重度: 🟡 High
// ════════════════════════════════════════════════════════════════
describe('BUG-5: safeQuestionKind for guest user', () => {
  test('guest requesting practice must be downgraded to formal (not practice)', () => {
    // Per design Section 10: guest cannot do practice/calibration
    // The QuestionKind enum is formal/practice/calibration, so
    // guest is downgraded to "formal" (the only kind they're allowed)
    const result = safeQuestionKind('guest', 'practice');
    expect(result).toBe('formal');
  });

  test('guest requesting formal gets formal', () => {
    const result = safeQuestionKind('guest', 'formal');
    expect(result).toBe('formal');
  });

  test('guest requesting calibration gets formal (downgrade)', () => {
    const result = safeQuestionKind('guest', 'calibration');
    expect(result).toBe('formal');
  });

  test('registered_free requesting calibration gets practice', () => {
    const result = safeQuestionKind('registered_free', 'calibration');
    expect(result).toBe('practice');
  });
});

// ════════════════════════════════════════════════════════════════
// BUG-6: RECENT_CHANGE_THRESHOLD unit ambiguity
// 严重度: 🟢 Medium
// ════════════════════════════════════════════════════════════════
describe('BUG-6: Router recent_change threshold must be on 0-100 scale', () => {
  test('routes to recent_change when delta is 20 on 0-100 scale', () => {
    const dims: RouterInputDimension[] = [
      {
        dimension: 'trustBoundaries',
        evidence_count: 10,
        confidence: 0.7,
        has_contradiction: false,
        current_value: 70,
        previous_value: 50,
      },
    ];
    const result = decideNextQuestion({
      dimensions: dims,
      user_tier: 'registered_free',
      now: Date.now(),
    });
    expect(result).not.toBeNull();
    expect(result!.reason).toBe('recent_change');
  });

  test('does NOT route to recent_change when delta is exactly 15 on 0-100 scale', () => {
    const dims: RouterInputDimension[] = [
      {
        dimension: 'trustBoundaries',
        evidence_count: 10,
        confidence: 0.7,
        has_contradiction: false,
        current_value: 65,
        previous_value: 50,
      },
    ];
    const result = decideNextQuestion({
      dimensions: dims,
      user_tier: 'registered_free',
      now: Date.now(),
    });
    // delta = 15 is not strictly greater than 15, so not recent_change
    if (result) {
      expect(result.reason).not.toBe('recent_change');
    }
  });
});

// ════════════════════════════════════════════════════════════════
// BUG-7: checkNextAction uses Array.prototype.has for guest
// 严重度: 🟢 Medium
// ════════════════════════════════════════════════════════════════
describe('BUG-7: ValidationGate for guest user next_action', () => {
  test('guest cannot use practice action', () => {
    const expl: LLMExplanationContract = {
      headline: '你的变化',
      summary: '总结',
      changed_dimensions: [],
      stable_dimensions: [],
      uncertainty_notes: [],
      next_step: {
        action_type: 'practice',
        label: '练习',
        reason: '继续',
      },
    };

    const result = validateLLMExplanation(expl, {
      allowed_dimensions: [],
      user_tier: 'guest',
      confidence_by_dim: {},
    });

    expect(
      result.errors.some(
        (e) => e.code === 'unauthorized_next_action',
      ),
    ).toBe(true);
  });

  test('guest can use next_test', () => {
    const expl: LLMExplanationContract = {
      headline: '你的变化',
      summary: '总结',
      changed_dimensions: [],
      stable_dimensions: [],
      uncertainty_notes: [],
      next_step: {
        action_type: 'next_test',
        label: '继续',
        reason: '继续',
      },
    };

    const result = validateLLMExplanation(expl, {
      allowed_dimensions: [],
      user_tier: 'guest',
      confidence_by_dim: {},
    });

    expect(
      result.errors.some(
        (e) => e.code === 'unauthorized_next_action',
      ),
    ).toBe(false);
  });
});

// ════════════════════════════════════════════════════════════════
// BUG-9: NaN in confidence values causes non-deterministic sort
// 严重度: 🔴 Critical (found by property-based testing)
// ════════════════════════════════════════════════════════════════
describe('BUG-9: NaN in confidence must not break Router determinism', () => {
  test('Router is deterministic even with NaN confidence', () => {
    const dims: RouterInputDimension[] = [
      {
        dimension: 'trustBoundaries',
        evidence_count: 0,
        confidence: Number.NaN,
        has_contradiction: true,
        last_tested_at: 0,
        current_value: 0,
      },
      {
        dimension: 'socialEnergy',
        evidence_count: 0,
        confidence: 0,
        has_contradiction: true,
        last_tested_at: 0,
        current_value: 0,
      },
    ];

    const input = {
      dimensions: dims,
      user_tier: 'guest' as const,
      now: 241840948600,
    };

    const r1 = decideNextQuestion(input);
    const r2 = decideNextQuestion(input);
    const r3 = decideNextQuestion({ ...input, dimensions: [...dims].reverse() });

    expect(r1).not.toBeNull();
    expect(r2).not.toBeNull();
    expect(r3).not.toBeNull();
    expect(r1!.target_dimension).toBe(r2!.target_dimension);
    expect(r2!.target_dimension).toBe(r3!.target_dimension);
  });
});

// ════════════════════════════════════════════════════════════════
// BUG-8 (extra): validateQuestionContract has 4-way duplicate error for empty vector_patch on each option
// 严重度: 🟢 Medium
// ════════════════════════════════════════════════════════════════
describe('BUG-8: validateQuestionContract: short-circuit on invalid option count', () => {
  test('when option count is wrong, do not also report missing_vector_patch per option', () => {
    const q: QuestionContract = {
      scenario_id: 't',
      scenario_set: 's',
      version: '1',
      source: 'static',
      target_dimension: 'trustBoundaries',
      measurement_intent: 'm',
      evidence_kind: 'formal',
      confidence_weight: 1,
      prompt: 'p',
      options: [
        { id: 'A', text: 'a', vector_patch: {} },
      ],
    };

    const result = validateQuestionContract(q, 'registered_free');

    // 缺 vector_patch 应被报告，但 option count 错误不会产生额外重复 error
    const errors = result.errors;
    const optionCountErrors = errors.filter(
      (e) => e.code === 'invalid_option_count',
    );
    const missingPatchErrors = errors.filter(
      (e) => e.code === 'missing_vector_patch',
    );

    // Expect exactly 1 option count error (not 4)
    expect(optionCountErrors.length).toBe(1);
    // And 1 missing_vector_patch error for the single bad option
    expect(missingPatchErrors.length).toBe(1);
  });
});
