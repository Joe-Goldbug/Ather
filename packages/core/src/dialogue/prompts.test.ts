import { describe, expect, test } from 'bun:test';
import { buildDynamicScriptPrompt } from './prompts.js';

const vector = {
  trust_threshold: 0.5,
  boundary_strength: 0.5,
  conflict_style: 'balanced',
  conflict_score: 0.5,
  attachment_pattern: 'balanced',
  attachment_score: 0.5,
  emotional_regulation: 'balanced',
  stress_response: 'balanced',
  stress_score: 0.5,
  achievement_drive: 'balanced',
  perfectionism_score: 0.5,
  selfview_pattern: 'balanced',
  growth_mindset_score: 0.5,
  social_energy_style: 'balanced',
  social_energy_score: 0.5,
} as Parameters<typeof buildDynamicScriptPrompt>[0];

describe('dynamic micro-sandbox prompt', () => {
  test('does not mistake omitted unauthorized diary context for an empty account', () => {
    const { system } = buildDynamicScriptPrompt(vector, [], 'zh-CN', 'trustBoundaries');
    expect(system).toContain('【Authorized Recent Diaries】');
    expect(system).toContain('未提供获授权的日记记录');
    expect(system).not.toContain('暂无日记记录');
  });
});
