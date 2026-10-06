import { describe, expect, test } from 'bun:test';
import {
  buildProfileDeltaContract,
  type BuildProfileDeltaInput,
} from './profile-delta-builder.js';

function makeInput(overrides: Partial<BuildProfileDeltaInput> = {}): BuildProfileDeltaInput {
  return {
    user_id: 'user-1',
    run_id: 'run-1',
    user_tier: 'registered_free',
    current_archetype_id: 'archetype-a',
    previous_profile: {},
    current_profile: {},
    evidence_count_by_dimension: {},
    confidence_before_by_dimension: {},
    confidence_after_by_dimension: {},
    next_target_dimension: 'trustBoundaries',
    ...overrides,
  };
}

describe('buildProfileDeltaContract — empty profiles', () => {
  test('returns all core dimensions as uncertain for empty profiles', () => {
    const result = buildProfileDeltaContract(makeInput());
    expect(result.changed_dimensions).toEqual([]);
    expect(result.stable_dimensions).toEqual([]);
    expect(result.uncertain_dimensions.length).toBe(8);
    expect(result.uncertain_dimensions.every((d) => d.reason === 'low_evidence')).toBe(true);
  });
});

describe('buildProfileDeltaContract — changed dimensions', () => {
  test('classifies dimension with delta >= 2 as changed', () => {
    const result = buildProfileDeltaContract(makeInput({
      previous_profile: { trustBoundaries: 50 },
      current_profile: { trustBoundaries: 55 },
      evidence_count_by_dimension: { trustBoundaries: 3 },
      confidence_before_by_dimension: { trustBoundaries: 0.4 },
      confidence_after_by_dimension: { trustBoundaries: 0.7 },
    }));
    expect(result.changed_dimensions.length).toBe(1);
    expect(result.changed_dimensions[0]!.dimension).toBe('trustBoundaries');
    expect(result.changed_dimensions[0]!.previous_value).toBe(50);
    expect(result.changed_dimensions[0]!.current_value).toBe(55);
    expect(result.changed_dimensions[0]!.delta).toBe(5);
    expect(result.changed_dimensions[0]!.confidence_before).toBe(0.4);
    expect(result.changed_dimensions[0]!.confidence_after).toBe(0.7);
    expect(result.changed_dimensions[0]!.evidence_count).toBe(3);
  });

  test('classifies negative delta >= 2 as changed', () => {
    const result = buildProfileDeltaContract(makeInput({
      previous_profile: { conflictResponse: 70 },
      current_profile: { conflictResponse: 65 },
      evidence_count_by_dimension: { conflictResponse: 5 },
      confidence_before_by_dimension: { conflictResponse: 0.6 },
      confidence_after_by_dimension: { conflictResponse: 0.8 },
    }));
    expect(result.changed_dimensions.length).toBe(1);
    expect(result.changed_dimensions[0]!.delta).toBe(-5);
  });
});

describe('buildProfileDeltaContract — stable dimensions', () => {
  test('classifies dimension with small change as stable', () => {
    const result = buildProfileDeltaContract(makeInput({
      previous_profile: { trustBoundaries: 50 },
      current_profile: { trustBoundaries: 51 },
      evidence_count_by_dimension: { trustBoundaries: 10 },
    }));
    expect(result.changed_dimensions.length).toBe(0);
    expect(result.stable_dimensions.length).toBe(1);
    expect(result.stable_dimensions[0]!.dimension).toBe('trustBoundaries');
    expect(result.stable_dimensions[0]!.current_value).toBe(51);
  });

  test('classifies no-change dimension as stable', () => {
    const result = buildProfileDeltaContract(makeInput({
      previous_profile: { trustBoundaries: 50 },
      current_profile: { trustBoundaries: 50 },
      evidence_count_by_dimension: { trustBoundaries: 10 },
    }));
    expect(result.stable_dimensions.length).toBe(1);
    expect(result.changed_dimensions.length).toBe(0);
  });
});

describe('buildProfileDeltaContract — allowed next actions', () => {
  test('paid user gets all actions', () => {
    const result = buildProfileDeltaContract(makeInput({ user_tier: 'paid' }));
    expect(result.allowed_next_actions).toContain('paid_calibration');
    expect(result.allowed_next_actions).toContain('diary_prompt');
    expect(result.allowed_next_actions).toContain('next_test');
    expect(result.allowed_next_actions).toContain('practice');
    expect(result.allowed_next_actions).toContain('profile_view');
  });

  test('guest user gets minimal actions', () => {
    const result = buildProfileDeltaContract(makeInput({ user_tier: 'guest' }));
    expect(result.allowed_next_actions).toContain('next_test');
    expect(result.allowed_next_actions).toContain('profile_view');
    expect(result.allowed_next_actions).not.toContain('paid_calibration');
    expect(result.allowed_next_actions).not.toContain('diary_prompt');
  });

  test('free user gets standard free actions', () => {
    const result = buildProfileDeltaContract(makeInput({ user_tier: 'registered_free' }));
    expect(result.allowed_next_actions).toContain('next_test');
    expect(result.allowed_next_actions).toContain('practice');
    expect(result.allowed_next_actions).toContain('profile_view');
    expect(result.allowed_next_actions).not.toContain('paid_calibration');
  });
});

describe('buildProfileDeltaContract — deterministic', () => {
  test('same input produces same output', () => {
    const input = makeInput({
      previous_profile: { trustBoundaries: 50, conflictResponse: 70 },
      current_profile: { trustBoundaries: 55, conflictResponse: 65 },
      evidence_count_by_dimension: { trustBoundaries: 3, conflictResponse: 5 },
      confidence_before_by_dimension: { trustBoundaries: 0.4, conflictResponse: 0.6 },
      confidence_after_by_dimension: { trustBoundaries: 0.7, conflictResponse: 0.8 },
    });
    const result1 = buildProfileDeltaContract(input);
    const result2 = buildProfileDeltaContract(input);
    expect(result1).toEqual(result2);
  });
});

describe('buildProfileDeltaContract — missing dimensions', () => {
  test('marks core dimensions not in either profile as uncertain', () => {
    const result = buildProfileDeltaContract(makeInput({
      previous_profile: { trustBoundaries: 50 },
      current_profile: { trustBoundaries: 55 },
    }));
    const uncertainDims = result.uncertain_dimensions.map((d) => d.dimension);
    expect(uncertainDims).toContain('conflictResponse');
    expect(uncertainDims).toContain('attachment');
    expect(uncertainDims).toContain('emotionRegulation');
    expect(uncertainDims).toContain('stressResponse');
    expect(uncertainDims).toContain('achievementMotivation');
    expect(uncertainDims).toContain('selfCognition');
    expect(uncertainDims).toContain('socialEnergy');
  });
});

describe('buildProfileDeltaContract — confidence defaults', () => {
  test('uses default confidence when not provided', () => {
    const result = buildProfileDeltaContract(makeInput({
      previous_profile: { trustBoundaries: 50 },
      current_profile: { trustBoundaries: 55 },
    }));
    expect(result.changed_dimensions[0]!.confidence_before).toBe(0.6);
    expect(result.changed_dimensions[0]!.confidence_after).toBe(0.6);
  });
});
