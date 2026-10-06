import { describe, expect, test } from 'bun:test';
import { validateQuestionContract } from './validate-question.js';
import type { QuestionContract } from './question-contract.js';
import { buildProfileDeltaContract } from './profile-delta-builder.js';

function makeQuestion(
  overrides: Partial<QuestionContract> = {},
): QuestionContract {
  return {
    scenario_id: 'test-1',
    scenario_set: 'baseline_v1',
    version: '1.0.0',
    source: 'dynamic_llm',
    target_dimension: 'trustBoundaries',
    measurement_intent: 'reaction_to_ambiguous_intimacy',
    evidence_kind: 'practice',
    confidence_weight: 1.0,
    prompt: '当你遇到一个不太熟悉的人向你倾诉私事，你会？',
    options: [
      { id: 'A', text: '选项A', vector_patch: { trust_threshold: 0.9 } },
      { id: 'B', text: '选项B', vector_patch: { trust_threshold: 0.45 } },
      { id: 'C', text: '选项C', vector_patch: { trust_threshold: 0.25 } },
      { id: 'D', text: '选项D', vector_patch: { trust_threshold: 0.1 } },
    ],
    ...overrides,
  };
}

describe('AUDIT: validate-question diagnostic patterns — BUG-A candidate', () => {
  test('reports ALL matching diagnostic patterns, not just the first', () => {
    const q = makeQuestion({
      prompt: '这个场景描述了某种心理障碍和创伤后应激，需要了解症状',
    });
    const result = validateQuestionContract(q, 'paid');
    expect(result.valid).toBe(false);
    const diagnosticErrors = result.errors.filter(
      (e) => e.code === 'diagnostic_question_content',
    );
    expect(diagnosticErrors.length).toBeGreaterThanOrEqual(2);
  });
});

describe('AUDIT: buildProfileDeltaContract — BUG-B candidate (missing dimensions)', () => {
  test('dim in previous_profile but missing in current should be UNCERTAIN, not changed', () => {
    const result = buildProfileDeltaContract({
      user_id: 'u1',
      run_id: 'r1',
      user_tier: 'registered_free',
      current_archetype_id: 'a1',
      previous_profile: { trustBoundaries: 80 },
      current_profile: {},
      evidence_count_by_dimension: { trustBoundaries: 5 },
      confidence_before_by_dimension: { trustBoundaries: 0.7 },
      confidence_after_by_dimension: { trustBoundaries: 0.8 },
      next_target_dimension: 'trustBoundaries',
    });
    const dimChanged = result.changed_dimensions.find(
      (d) => d.dimension === 'trustBoundaries',
    );
    expect(dimChanged).toBeUndefined();
    const dimUncertain = result.uncertain_dimensions.find(
      (d) => d.dimension === 'trustBoundaries',
    );
    expect(dimUncertain).toBeDefined();
  });

  test('dim in current_profile but missing in previous should be UNCERTAIN, not changed', () => {
    const result = buildProfileDeltaContract({
      user_id: 'u1',
      run_id: 'r1',
      user_tier: 'registered_free',
      current_archetype_id: 'a1',
      previous_profile: {},
      current_profile: { trustBoundaries: 80 },
      evidence_count_by_dimension: { trustBoundaries: 5 },
      confidence_before_by_dimension: { trustBoundaries: 0.7 },
      confidence_after_by_dimension: { trustBoundaries: 0.8 },
      next_target_dimension: 'trustBoundaries',
    });
    const dimChanged = result.changed_dimensions.find(
      (d) => d.dimension === 'trustBoundaries',
    );
    expect(dimChanged).toBeUndefined();
  });
});

describe('AUDIT: buildProfileDeltaContract — mutual exclusivity', () => {
  test('a dimension cannot appear in both changed and uncertain', () => {
    const result = buildProfileDeltaContract({
      user_id: 'u1',
      run_id: 'r1',
      user_tier: 'registered_free',
      current_archetype_id: 'a1',
      previous_profile: { trustBoundaries: 50, conflictResponse: 50 },
      current_profile: { trustBoundaries: 55, conflictResponse: 65 },
      evidence_count_by_dimension: { trustBoundaries: 5, conflictResponse: 2 },
      confidence_before_by_dimension: { trustBoundaries: 0.6, conflictResponse: 0.4 },
      confidence_after_by_dimension: { trustBoundaries: 0.7, conflictResponse: 0.5 },
      next_target_dimension: 'trustBoundaries',
    });
    for (const dim of result.changed_dimensions) {
      const inUncertain = result.uncertain_dimensions.some(
        (u) => u.dimension === dim.dimension,
      );
      expect(inUncertain).toBe(false);
    }
  });

  test('a dimension cannot appear in both stable and uncertain', () => {
    const result = buildProfileDeltaContract({
      user_id: 'u1',
      run_id: 'r1',
      user_tier: 'registered_free',
      current_archetype_id: 'a1',
      previous_profile: { trustBoundaries: 50 },
      current_profile: { trustBoundaries: 50 },
      evidence_count_by_dimension: { trustBoundaries: 1 },
      confidence_before_by_dimension: { trustBoundaries: 0.3 },
      confidence_after_by_dimension: { trustBoundaries: 0.4 },
      next_target_dimension: 'trustBoundaries',
    });
    for (const dim of result.stable_dimensions) {
      const inUncertain = result.uncertain_dimensions.some(
        (u) => u.dimension === dim.dimension,
      );
      expect(inUncertain).toBe(false);
    }
  });
});
