// packages/core/src/assessment/auto-wrap-feedback.test.ts
// Regression test for ISSUE-003:
//   When DeepSeek returns string options instead of {text,label,feedback} objects,
//   the auto-wrap fallback emitted `feedback: "[auto] ${option}"` and this prefix
//   leaked all the way to the user UI (assessment.service.ts:365/471/537 passes
//   option.feedback unchanged).
//
// Contract: feedback of auto-wrapped options must equal the option text exactly —
// no debug markers, no [auto] prefixes, no implementation leakage.

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

describe('auto-wrap feedback quality (ISSUE-003)', () => {
  test('LLM returning string options produces feedback equal to option text (no [auto] prefix)', async () => {
    const llmOutput = JSON.stringify([
      {
        id: 'dyn-fb',
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
      // The contract: feedback must equal the option text exactly.
      // Before fix: opt.feedback === '[auto] Choice A text'
      expect(opt.feedback).toBe(opt.text);
      expect(opt.feedback.startsWith('[auto]')).toBe(false);
      expect(opt.feedback.startsWith('[')).toBe(false);
    }
  });
});
