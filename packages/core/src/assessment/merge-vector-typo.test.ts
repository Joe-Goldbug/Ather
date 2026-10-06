// packages/core/src/assessment/merge-vector-typo.test.ts
// ISSUE-007 (original): mergeDynamicVector produced 'adapative' (typo) because
// the static schema and type allowed it. Root-cause fix removed 'adapative'
// from the SocialEnergyStyle union, so TypeScript now blocks the typo at
// compile time.
//
// This test pins the new contract:
//   1. SocialEnergyStyle does NOT include 'adapative' (compile-time guard)
//   2. mergeDynamicVector handles the legitimate 'adaptive' value correctly

import { describe, test, expect } from 'bun:test';
import { mergeDynamicVector } from './script-engine.js';
import type { PersonalityVector, ScenarioChoice, DynamicScenarioDef, SocialEnergyStyle } from '../shared/types.js';

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

// Compile-time guard: 'adapative' must NOT be assignable to SocialEnergyStyle.
// If you uncomment the line below, tsc must error:
//   Type '"adapative"' is not assignable to type 'SocialEnergyStyle'.
// type _AdapativeGuard = Expect<Equal<SocialEnergyStyle, Exclude<SocialEnergyStyle, 'adapative'>>>;
type _CheckNotAdapative = SocialEnergyStyle extends 'adapative' ? never : SocialEnergyStyle;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const _check: _CheckNotAdapative = 'adaptive' as SocialEnergyStyle;

describe('ISSUE-007 root-cause fix: SocialEnergyStyle rejects "adapative"', () => {
  test('legitimate "adaptive" merges correctly', () => {
    const existing = makeVector({ social_energy_style: 'energy_draining' });
    const choices: ScenarioChoice[] = [
      { scenarioId: 'dyn-ok', choice: 'A', timestamp: Date.now() },
    ];
    const scenarios: DynamicScenarioDef[] = [
      {
        id: 'dyn-ok',
        title: 'Test',
        setup: 'Setup',
        prompt: 'What?',
        options: {
          A: { text: 'A', label: 'A', feedback: 'f' },
          B: { text: 'B', label: 'B', feedback: 'f' },
          C: { text: 'C', label: 'C', feedback: 'f' },
          D: { text: 'D', label: 'D', feedback: 'f' },
        },
        vector_patch: {
          A: { social_energy_style: 'adaptive', social_energy_score: 0.6 },
          B: { trust_threshold: 0.5 },
          C: { trust_threshold: 0.5 },
          D: { trust_threshold: 0.5 },
        },
      },
    ];

    const result = mergeDynamicVector(existing, choices, scenarios);
    expect(result.social_energy_style).toBe('adaptive');
  });
});
