// packages/core/src/assessment/merge-vector-nan-guard.test.ts
// Regression test for the NaN bug surfaced by 2026-06-15 dogfood:
//   When the LLM returns a NUMBER for a string-enum field (e.g.:
//     vector_patch: { A: { conflict_style: 0.9 } }
//   instead of the spec'd string:
//     vector_patch: { A: { conflict_style: 'confrontational' }
//   mergeDynamicVector treated it as a number blend:
//     old = 'analytical' (the existing string) -> 'analytical' * 0.7 = NaN
//     NaN * 0.7 + 0.9 * 0.3 = NaN
//   Then the vector gets NaN for confidence and downstream effects cascade.
//
// Contract: mergeDynamicVector must IGNORE non-string values for
// string-enum keys (skip the field silently). It must NEVER treat a
// string-enum value as a number.

import { describe, test, expect } from 'bun:test';
import { mergeDynamicVector } from './script-engine.js';
import type { PersonalityVector, ScenarioChoice, DynamicScenarioDef } from '../shared/types.js';

function makeVector(overrides: Partial<PersonalityVector> = {}): PersonalityVector {
  return {
    trust_threshold: 0.3,
    boundary_strength: 0.4,
    conflict_style: 'analytical',
    conflict_score: 0.6,
    attachment_pattern: 'secure',
    attachment_score: 0.7,
    emotional_regulation: 'rational',
    stress_response: 'mindfulness',
    stress_score: 0.2,
    achievement_drive: 'flow_state',
    perfectionism_score: 0.5,
    selfview_pattern: 'growth_minded',
    growth_mindset_score: 0.7,
    social_energy_style: 'adaptive',
    social_energy_score: 0.8,
    openness_score: 0.78,
    stability_score: 0.67,
    neuroticism_score: 0.15,
    confidence: {
      trust: 0.6, conflict: 0.6, attachment: 0.6, emotion: 0.6,
      stress: 0.6, achievement: 0.6, selfview: 0.6, socialenergy: 0.6,
    },
    ...overrides,
  };
}

describe('mergeDynamicVector number→string-enum guard', () => {
  test('number value for conflict_style is skipped, vector stays valid', () => {
    const existing = makeVector({ conflict_style: 'analytical', conflict_score: 0.6 });
    const choices: ScenarioChoice[] = [
      { scenarioId: 'dyn-nan', choice: 'A', timestamp: Date.now() },
    ];
    const scenarios: DynamicScenarioDef[] = [
      {
        id: 'dyn-nan',
        title: 'T',
        setup: 'S',
        prompt: '?',
        options: {
          A: { text: 'A', label: 'A', feedback: 'f' },
          B: { text: 'B', label: 'B', feedback: 'f' },
          C: { text: 'C', label: 'C', feedback: 'f' },
          D: { text: 'D', label: 'D', feedback: 'f' },
        },
        // LLM returned a number for a string-enum field
        vector_patch: {
          A: { conflict_style: 0.9 as unknown as 'analytical', trust_threshold: 0.4 },
          B: { trust_threshold: 0.4 },
          C: { trust_threshold: 0.4 },
          D: { trust_threshold: 0.4 },
        },
      },
    ];

    const result = mergeDynamicVector(existing, choices, scenarios);

    // conflict_style must remain 'analytical' (not 'NaN' or corrupted)
    expect(result.conflict_style).toBe('analytical');
    expect(typeof result.conflict_style).toBe('string');

    // No NaN leaked into any numeric field
    const numericFields: Array<keyof PersonalityVector> = [
      'trust_threshold', 'boundary_strength', 'conflict_score',
      'attachment_score', 'stress_score', 'perfectionism_score',
      'growth_mindset_score', 'social_energy_score',
      'openness_score', 'stability_score', 'neuroticism_score',
    ];
    for (const field of numericFields) {
      expect(Number.isNaN(result[field] as number)).toBe(false);
    }

    // trust_threshold was a number, so it should blend normally
    expect(typeof result.trust_threshold).toBe('number');
  });
});
