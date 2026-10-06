// packages/core/src/reflection/reflection.property.test.ts
// Property-based tests using fast-check — verify invariants across many random inputs.

import { describe, expect, test } from 'bun:test';
import fc from 'fast-check';
import {
  decideNextQuestion,
  safeQuestionKind,
  type RouterInputDimension,
  type UserTier,
  type QuestionKind,
} from './next-question-router.js';
import { validateLLMExplanation } from './validation-gate.js';
import { validateQuestionContract } from './validate-question.js';
import type { QuestionContract } from './question-contract.js';
import type { LLMExplanationContract } from './llm-explanation-contract.js';

// ════════════════════════════════════════════════════════════════
// PROPERTY 1: Router is pure / deterministic
// 严格对应设计 P0-6: "同样 evidence 输入得到同样 profile 输出"
// ════════════════════════════════════════════════════════════════
describe('PROPERTY: Router determinism', () => {
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

  const inputDimArb: fc.Arbitrary<RouterInputDimension> = fc.record({
    dimension: dimensionArb,
    evidence_count: fc.integer({ min: 0, max: 50 }),
    confidence: fc.double({ min: 0, max: 1 }),
    has_contradiction: fc.boolean(),
    last_tested_at: fc.option(fc.integer({ min: 0, max: 1_000_000_000_000 }), {
      nil: undefined,
    }),
    current_value: fc.double({ min: 0, max: 100 }),
    previous_value: fc.option(fc.double({ min: 0, max: 100 }), {
      nil: undefined,
    }),
  });

  const tierArb: fc.Arbitrary<UserTier> = fc.constantFrom(
    'guest',
    'registered_free',
    'paid',
  );

  test('decideNextQuestion is deterministic across N calls', () => {
    fc.assert(
      fc.property(
        fc.array(inputDimArb, { minLength: 1, maxLength: 8 }),
        tierArb,
        fc.integer({ min: 0, max: 1_000_000_000_000 }),
        (dims, tier, now) => {
          // Shuffle input order to prove determinism is order-independent
          const shuffled = [...dims].sort(() => Math.random() - 0.5);

          const input1 = {
            dimensions: dims,
            user_tier: tier,
            now,
          };
          const input2 = {
            dimensions: shuffled,
            user_tier: tier,
            now,
          };

          const r1 = decideNextQuestion(input1);
          const r2 = decideNextQuestion(input2);

          // Both must produce structurally identical results
          if (r1 === null && r2 === null) return true;
          if (r1 === null || r2 === null) return false;

          return (
            r1.target_dimension === r2.target_dimension &&
            r1.reason === r2.reason &&
            r1.question_kind === r2.question_kind &&
            r1.scenario_pool === r2.scenario_pool
          );
        },
      ),
      { numRuns: 200 },
    );
  });

  test('Router never mutates input dimensions array', () => {
    fc.assert(
      fc.property(
        fc.array(inputDimArb, { minLength: 1, maxLength: 8 }),
        tierArb,
        fc.integer({ min: 0, max: 1_000_000_000_000 }),
        (dims, tier, now) => {
          const snapshot = JSON.parse(JSON.stringify(dims));
          decideNextQuestion({ dimensions: dims, user_tier: tier, now });
          return JSON.stringify(dims) === JSON.stringify(snapshot);
        },
      ),
      { numRuns: 200 },
    );
  });
});

// ════════════════════════════════════════════════════════════════
// PROPERTY 2: safeQuestionKind never escalates tier
// 免费用户拿到的东西，绝不能比它本来能拿到的"更高"
// ════════════════════════════════════════════════════════════════
describe('PROPERTY: safeQuestionKind tier monotonicity', () => {
  test('safeQuestionKind never returns calibration for non-paid users', () => {
    fc.assert(
      fc.property(
        fc.constantFrom('guest', 'registered_free'),
        fc.constantFrom('formal', 'practice', 'calibration'),
        (tier, requested) => {
          const result = safeQuestionKind(tier, requested);
          return result !== 'calibration';
        },
      ),
      { numRuns: 50 },
    );
  });

  test('safeQuestionKind for paid always returns the requested kind', () => {
    fc.assert(
      fc.property(
        fc.constantFrom('formal', 'practice', 'calibration'),
        (requested) => {
          return safeQuestionKind('paid', requested) === requested;
        },
      ),
      { numRuns: 30 },
    );
  });
});

// ════════════════════════════════════════════════════════════════
// PROPERTY 3: ValidationGate never panics on any input
// 即使 LLM 输出完全不合法（空字符串、缺失字段），必须 graceful
// ════════════════════════════════════════════════════════════════
describe('PROPERTY: ValidationGate robustness', () => {
  test('validateLLMExplanation never throws, always returns {ok, errors}', () => {
    const expl: LLMExplanationContract = {
      headline: 'h',
      summary: 's',
      changed_dimensions: [],
      stable_dimensions: [],
      uncertainty_notes: [],
      next_step: {
        action_type: 'next_test',
        label: 'l',
        reason: 'r',
      },
    };

    const dimArb = fc.array(
      fc.record({
        dimension: fc.string(),
        change_label: fc.string(),
        explanation: fc.string(),
        confidence_phrase: fc.string(),
      }),
      { maxLength: 5 },
    );

    fc.assert(
      fc.property(
        dimArb,
        fc.array(fc.string(), { maxLength: 5 }),
        fc.option(fc.double({ min: 0, max: 1 })),
        (changed, allowed, conf) => {
          const input = {
            allowed_dimensions: allowed,
            user_tier: 'registered_free' as const,
            confidence_by_dim: { trustBoundaries: conf ?? 0.5 },
          };
          const result = validateLLMExplanation(
            { ...expl, changed_dimensions: changed as any },
            input,
          );
          return (
            typeof result.ok === 'boolean' && Array.isArray(result.errors)
          );
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ════════════════════════════════════════════════════════════════
// PROPERTY 4: validateQuestionContract must reject at least one
// error for completely empty/minimal questions
// ════════════════════════════════════════════════════════════════
describe('PROPERTY: validateQuestionContract minimal inputs', () => {
  test('minimal question without target_dimension is rejected', () => {
    fc.assert(
      fc.property(
        fc.constantFrom('guest', 'registered_free', 'paid'),
        (tier) => {
          const q: QuestionContract = {
            scenario_id: 'x',
            scenario_set: 's',
            version: '1',
            source: 'static',
            target_dimension: '',
            measurement_intent: 'm',
            evidence_kind: 'formal',
            confidence_weight: 1,
            prompt: 'p',
            options: [
              { id: 'A', text: 'a', vector_patch: { trust_threshold: 0.5 } },
              { id: 'B', text: 'b', vector_patch: { trust_threshold: 0.5 } },
              { id: 'C', text: 'c', vector_patch: { trust_threshold: 0.5 } },
              { id: 'D', text: 'd', vector_patch: { trust_threshold: 0.5 } },
            ],
          };
          const result = validateQuestionContract(q, tier);
          return (
            !result.valid &&
            result.errors.some(
              (e) => e.code === 'missing_target_dimension',
            )
          );
        },
      ),
      { numRuns: 30 },
    );
  });
});
