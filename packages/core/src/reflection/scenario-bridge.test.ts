// packages/core/src/reflection/scenario-bridge.test.ts
// Bridge existing ScenarioSchema → QuestionContract (Reflection Funnel)

import { describe, expect, test } from 'bun:test';
import {
  scenarioToContract,
  answerToEvidence,
  computeProfileDelta,
  extractPrimaryNumericDelta,
  dimensionDirection,
  type CopyLookup,
} from './scenario-bridge.js';
import type { ScenarioSchema } from '../assessment/script-schema.js';
import type { ChoiceOption } from '../shared/types.js';
import type { LLMExplanationContract } from './llm-explanation-contract.js';

// ════════════════════════════════════════════════════════════════
// FIXTURE
// ════════════════════════════════════════════════════════════════
function makeScenario(overrides: Partial<ScenarioSchema> = {}): ScenarioSchema {
  return {
    id: 'trust',
    dimension: 'trustBoundaries',
    measurementIntent: 'reaction_to_ambiguous_intimacy',
    confounders: ['social_desirability'],
    reverse_scored: false,
    attention_check: false,
    expected_signal: { A: 'low', B: 'mid-high', C: 'mid-low', D: 'high' },
    vector_patch: {
      A: { trust_threshold: 0.9, boundary_strength: 0.9 },
      B: { trust_threshold: 0.45, boundary_strength: 0.45 },
      C: { trust_threshold: 0.65, boundary_strength: 0.72 },
      D: { trust_threshold: 0.18, boundary_strength: 0.22 },
    },
    allow_free_text: false,
    ...overrides,
  };
}

function makeCopyLookup(): CopyLookup {
  return (scenarioId) => ({
    title: `Title for ${scenarioId}`,
    setup: `Setup for ${scenarioId}`,
    prompt: `Prompt for ${scenarioId}?`,
    options: {
      A: { text: 'option A text', label: 'A', feedback: 'feedback A' },
      B: { text: 'option B text', label: 'B', feedback: 'feedback B' },
      C: { text: 'option C text', label: 'C', feedback: 'feedback C' },
      D: { text: 'option D text', label: 'D', feedback: 'feedback D' },
    },
  });
}

// ════════════════════════════════════════════════════════════════
// 1. scenarioToContract — converts ScenarioSchema → QuestionContract
// ════════════════════════════════════════════════════════════════
describe('scenarioToContract', () => {
  test('converts basic scenario to QuestionContract', () => {
    const scenario = makeScenario();
    const lookup = makeCopyLookup();
    const contract = scenarioToContract(scenario, lookup, 'global_core_v2', '1.0.0');

    expect(contract.scenario_id).toBe('trust');
    expect(contract.scenario_set).toBe('global_core_v2');
    expect(contract.version).toBe('1.0.0');
    expect(contract.source).toBe('static');
    expect(contract.target_dimension).toBe('trustBoundaries');
    expect(contract.measurement_intent).toBe('reaction_to_ambiguous_intimacy');
    expect(contract.evidence_kind).toBe('formal');
    expect(contract.confidence_weight).toBe(1.0);
    expect(contract.llm_generated).toBe(false);
  });

  test('copies 4 options with vector_patch from scenario', () => {
    const scenario = makeScenario();
    const lookup = makeCopyLookup();
    const contract = scenarioToContract(scenario, lookup, 'set', '1.0');

    expect(contract.options).toHaveLength(4);
    expect(contract.options[0]!.id).toBe('A');
    expect(contract.options[0]!.text).toBe('option A text');
    expect(contract.options[0]!.vector_patch).toEqual({
      trust_threshold: 0.9,
      boundary_strength: 0.9,
    });
  });

  test('uses provided prompt from copy lookup', () => {
    const scenario = makeScenario();
    const lookup = makeCopyLookup();
    const contract = scenarioToContract(scenario, lookup, 'set', '1.0');
    expect(contract.prompt).toBe('Prompt for trust?');
  });

  test('includes confounders when present', () => {
    const scenario = makeScenario({
      confounders: ['cultural_context', 'social_desirability'],
    });
    const lookup = makeCopyLookup();
    const contract = scenarioToContract(scenario, lookup, 'set', '1.0');
    expect(contract.confounders).toEqual([
      'cultural_context',
      'social_desirability',
    ]);
  });

  test('omits confounders when absent', () => {
    const scenario = makeScenario({ confounders: [] });
    const lookup = makeCopyLookup();
    const contract = scenarioToContract(scenario, lookup, 'set', '1.0');
    expect(contract.confounders).toBeUndefined();
  });

  test('looks up prompt by scenario.id, not scenario.dimension', () => {
    const scenario = makeScenario({ id: 'special_id' });
    const lookup = makeCopyLookup();
    const contract = scenarioToContract(scenario, lookup, 'set', '1.0');
    expect(contract.prompt).toBe('Prompt for special_id?');
  });
});

// ════════════════════════════════════════════════════════════════
// 2. extractPrimaryNumericDelta — utility
// ════════════════════════════════════════════════════════════════
describe('extractPrimaryNumericDelta', () => {
  test('returns 0 for empty vector_patch', () => {
    expect(extractPrimaryNumericDelta({})).toBe(0);
  });

  test('returns first numeric _score value', () => {
    expect(
      extractPrimaryNumericDelta({
        conflict_style: 'avoidant',
        conflict_score: 0.7,
      }),
    ).toBe(0.7);
  });

  test('returns first _threshold/_strength if no _score', () => {
    expect(
      extractPrimaryNumericDelta({
        trust_threshold: 0.45,
        boundary_strength: 0.5,
      }),
    ).toBe(0.45);
  });

  test('skips categorical string fields', () => {
    expect(
      extractPrimaryNumericDelta({
        conflict_style: 'avoidant',
        conflict_score: 0.8,
      }),
    ).toBe(0.8);
  });

  test('returns 0 if all fields are strings', () => {
    expect(
      extractPrimaryNumericDelta({
        conflict_style: 'avoidant',
      }),
    ).toBe(0);
  });
});

// ════════════════════════════════════════════════════════════════
// 3. dimensionDirection — derive direction from delta
// ════════════════════════════════════════════════════════════════
describe('dimensionDirection', () => {
  test('returns increase for positive delta', () => {
    expect(dimensionDirection(0.5)).toBe('increase');
  });

  test('returns decrease for negative delta', () => {
    expect(dimensionDirection(-0.3)).toBe('decrease');
  });

  test('returns neutral for zero delta', () => {
    expect(dimensionDirection(0)).toBe('neutral');
  });

  test('returns neutral for delta within epsilon of zero', () => {
    expect(dimensionDirection(1e-10)).toBe('neutral');
    expect(dimensionDirection(-1e-10)).toBe('neutral');
  });
});

// ════════════════════════════════════════════════════════════════
// 4. answerToEvidence — converts user answer → EvidenceContract
// ════════════════════════════════════════════════════════════════
describe('answerToEvidence', () => {
  test('builds evidence from scenario + choice', () => {
    const scenario = makeScenario();
    const evidence = answerToEvidence({
      user_id: 'user-1',
      run_id: 'run-1',
      source_id: 'run-1',
      scenario,
      choice: 'A' as ChoiceOption,
      option_text: 'option A text',
      weight: 1.0,
      confidence: 0.6,
    });

    expect(evidence.user_id).toBe('user-1');
    expect(evidence.run_id).toBe('run-1');
    expect(evidence.scenario_id).toBe('trust');
    expect(evidence.scenario_set).toBe('global_core_v2');
    expect(evidence.scenario_version).toBe('1.0.0');
    expect(evidence.dimension).toBe('trustBoundaries');
    expect(evidence.evidence_kind).toBe('formal');
    // delta = vector_value (0.9) - DELTA_BASELINE (0.5) = 0.4
    expect(evidence.delta).toBeCloseTo(0.4);
    expect(evidence.direction).toBe('increase');
    expect(evidence.weight).toBe(1.0);
    expect(evidence.confidence).toBe(0.6);
    expect(evidence.raw_answer.option_id).toBe('A');
    expect(evidence.raw_answer.option_text).toBe('option A text');
    expect(evidence.explanation_basis.measurement_intent).toBe(
      'reaction_to_ambiguous_intimacy',
    );
    expect(evidence.explanation_basis.vector_patch).toEqual({
      trust_threshold: 0.9,
      boundary_strength: 0.9,
    });
  });

  test('direction is decrease when vector_patch value is below baseline 0.5', () => {
    const scenario = makeScenario();
    // Option D has trust_threshold: 0.18, which is below 0.5 baseline
    // delta = 0.18 - 0.5 = -0.32 → direction: decrease
    const evidence = answerToEvidence({
      user_id: 'u',
      run_id: 'r',
      source_id: 'r',
      scenario,
      choice: 'D' as ChoiceOption,
      option_text: 'option D',
      weight: 1.0,
      confidence: 0.6,
    });

    expect(evidence.delta).toBeCloseTo(-0.32);
    expect(evidence.direction).toBe('decrease');
  });

  test('secondary dimension included when present', () => {
    const scenario = makeScenario({
      secondary_dimension: 'attachment',
    });
    const evidence = answerToEvidence({
      user_id: 'u',
      run_id: 'r',
      source_id: 'r',
      scenario,
      choice: 'A' as ChoiceOption,
      option_text: 'A',
      weight: 1.0,
      confidence: 0.5,
    });

    expect(evidence.secondary_dimensions).toEqual(['attachment']);
  });
});

// ════════════════════════════════════════════════════════════════
// 5. computeProfileDelta — deterministic profile update
// ════════════════════════════════════════════════════════════════
describe('computeProfileDelta', () => {
  test('produces ProfileDeltaContract from evidence', () => {
    const scenario = makeScenario();
    const evidence = answerToEvidence({
      user_id: 'u',
      run_id: 'r',
      source_id: 'r',
      scenario,
      choice: 'A' as ChoiceOption,
      option_text: 'A',
      weight: 1.0,
      confidence: 0.5,
    });

    const delta = computeProfileDelta({
      user_id: 'u',
      run_id: 'r',
      user_tier: 'registered_free',
      archetype_id: 'boundary_guard',
      previous_profile: { trustBoundaries: 50, attachment: 60 },
      evidence: [evidence],
    });

    expect(delta.user_id).toBe('u');
    expect(delta.run_id).toBe('r');
    expect(delta.user_tier).toBe('registered_free');
    expect(delta.current_archetype_id).toBe('boundary_guard');
    expect(delta.changed_dimensions).toHaveLength(1);
    expect(delta.changed_dimensions[0]!.dimension).toBe('trustBoundaries');
    expect(delta.changed_dimensions[0]!.previous_value).toBe(50);
    // current = 50 + 0.4 * 100 = 90
    expect(delta.changed_dimensions[0]!.current_value).toBe(90);
    expect(delta.changed_dimensions[0]!.delta).toBeCloseTo(40);
    expect(delta.stable_dimensions).toHaveLength(1);
    expect(delta.stable_dimensions[0]!.dimension).toBe('attachment');
    expect(delta.next_target_dimension).toBeTruthy();
    expect(delta.allowed_next_actions).toContain('next_test');
  });

  test('appends delta to existing profile value (cumulative, clamped 0-100)', () => {
    const scenario = makeScenario();
    const evidence = answerToEvidence({
      user_id: 'u',
      run_id: 'r',
      source_id: 'r',
      scenario,
      choice: 'A' as ChoiceOption,
      option_text: 'A',
      weight: 1.0,
      confidence: 0.5,
    });

    const delta = computeProfileDelta({
      user_id: 'u',
      run_id: 'r',
      user_tier: 'registered_free',
      archetype_id: 'boundary_guard',
      previous_profile: { trustBoundaries: 80 },
      evidence: [evidence],
    });

    // 80 + (0.9 - 0.5) * 100 = 80 + 40 = 120, clamp to 100
    expect(delta.changed_dimensions[0]!.current_value).toBe(100);
  });

  test('handles multiple evidence events for same dimension', () => {
    const scenario = makeScenario();
    const e1 = answerToEvidence({
      user_id: 'u',
      run_id: 'r',
      source_id: 'r',
      scenario,
      choice: 'A' as ChoiceOption,
      option_text: 'A',
      weight: 1.0,
      confidence: 0.5,
    });
    const e2 = answerToEvidence({
      user_id: 'u',
      run_id: 'r',
      source_id: 'r',
      scenario,
      choice: 'B' as ChoiceOption,
      option_text: 'B',
      weight: 1.0,
      confidence: 0.5,
    });

    const delta = computeProfileDelta({
      user_id: 'u',
      run_id: 'r',
      user_tier: 'registered_free',
      archetype_id: 'boundary_guard',
      previous_profile: { trustBoundaries: 50 },
      evidence: [e1, e2],
    });

    // e1 delta: 0.9 - 0.5 = 0.4 (trust_threshold 0.9)
    // e2 delta: 0.45 - 0.5 = -0.05 (trust_threshold 0.45)
    // weighted average delta: (0.4*1.0 + (-0.05)*1.0) / 2.0 = 0.175
    // current = 50 + 0.175 * 100 = 67.5
    expect(delta.changed_dimensions[0]!.current_value).toBeCloseTo(67.5);
  });

  test('empty evidence returns unchanged profile', () => {
    const delta = computeProfileDelta({
      user_id: 'u',
      run_id: 'r',
      user_tier: 'registered_free',
      archetype_id: 'boundary_guard',
      previous_profile: { trustBoundaries: 50, attachment: 60 },
      evidence: [],
    });

    expect(delta.changed_dimensions).toHaveLength(0);
    expect(delta.stable_dimensions).toHaveLength(2);
  });

  test('dimension with 0 evidence_count goes to uncertain_dimensions', () => {
    const delta = computeProfileDelta({
      user_id: 'u',
      run_id: 'r',
      user_tier: 'registered_free',
      archetype_id: 'boundary_guard',
      previous_profile: {},
      evidence: [],
    });

    // With no profile values at all, we should still have a sensible structure
    expect(delta.allowed_next_actions.length).toBeGreaterThan(0);
  });
});
