// packages/core/src/assessment/auto-wrap-label.test.ts
// Regression test for ISSUE-002:
//   Micro-sandbox option buttons rendered "A. A: 直接逼近他..." — the choice
//   letter was duplicated. Root cause: auto-wrap fallback set `label = key`
//   while the frontend template is `{choice}. {option.label}`. When label
//   is the same as the choice key (A/B/C/D), the UI shows the letter twice.
//
// Contract: when the LLM returns a plain string for an option (auto-wrap path),
// the resulting label must NOT equal the option key, otherwise the frontend
// "{choice}. {label}" pattern produces "A. A".

import { describe, test, expect } from 'bun:test';
import { generateDynamicScenarios } from './script-engine.js';
import type { PersonalityVector } from '../shared/types.js';

function makeVector(): PersonalityVector {
  return {
    trust_threshold: 0.5, boundary_strength: 0.5,
    conflict_style: 'analytical', conflict_score: 0.5,
    attachment_pattern: 'secure', attachment_score: 0.6,
    emotional_regulation: 'rational',
    stress_response: 'mindfulness', stress_score: 0.3,
    achievement_drive: 'flow_state', perfectionism_score: 0.5,
    selfview_pattern: 'growth_minded', growth_mindset_score: 0.6,
    social_energy_style: 'adaptive', social_energy_score: 0.5,
    openness_score: 0.5, stability_score: 0.6, neuroticism_score: 0.4,
    confidence: {
      trust: 0.6, conflict: 0.6, attachment: 0.6, emotion: 0.6,
      stress: 0.6, achievement: 0.6, selfview: 0.6, socialenergy: 0.6,
    },
  };
}

describe('auto-wrap label quality (ISSUE-002)', () => {
  test('string option auto-wrap sets label NOT equal to choice key', async () => {
    const llmOutput = JSON.stringify([
      {
        id: 'dyn-lbl',
        title: 'Pressure Scene',
        setup: 'A concrete high-pressure setup.',
        prompt: 'What do you do now?',
        options: {
          A: 'Choice A text',
          B: 'Choice B text',
          C: 'Choice C text',
          D: 'Choice D text',
        },
        vector_patch: {
          A: { conflict_score: 0.8 },
          B: { trust_threshold: 0.7 },
          C: { attachment_pattern: 'secure' },
          D: { stress_score: 0.6 },
        },
      },
    ]);

    const out = await generateDynamicScenarios(
      makeVector(),
      [],
      async () => llmOutput,
      'zh-CN',
    );

    expect(out).toHaveLength(1);
    const options = out[0]!.options;
    for (const key of ['A', 'B', 'C', 'D'] as const) {
      const opt = options[key]!;
      // Contract: label must NOT equal the choice key, otherwise the
      // "{choice}. {label}" template renders "A. A".
      expect(opt.label).not.toBe(key);
      // Sanity: label should be a string (possibly empty), never the key.
      expect(typeof opt.label).toBe('string');
    }
  });
});
