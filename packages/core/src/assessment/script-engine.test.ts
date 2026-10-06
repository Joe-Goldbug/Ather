import { describe, expect, test } from 'bun:test';
import { generateScriptResult } from './script-engine.js';

describe('generateScriptResult', () => {
  test('aggregates repeated dimension signals instead of last-write-wins', () => {
    const result = generateScriptResult([
      { scenarioId: 'trust', choice: 'B', timestamp: 1 },
      { scenarioId: 'conflict', choice: 'B', timestamp: 2 },
      { scenarioId: 'attachment', choice: 'A', timestamp: 3 },
      { scenarioId: 'emotion', choice: 'C', timestamp: 4 },
      { scenarioId: 'stress', choice: 'D', timestamp: 5 },
      { scenarioId: 'achievement', choice: 'A', timestamp: 6 },
      { scenarioId: 'selfview', choice: 'A', timestamp: 7 },
      { scenarioId: 'socialenergy', choice: 'D', timestamp: 8 },
      { scenarioId: 'conflict_friend', choice: 'A', timestamp: 9 },
      { scenarioId: 'stress_chronic', choice: 'C', timestamp: 10 },
      { scenarioId: 'social_lowenergy', choice: 'D', timestamp: 11 },
      { scenarioId: 'motive_silence', choice: 'A', timestamp: 12 },
      { scenarioId: 'motive_social', choice: 'C', timestamp: 13 },
    ]);

    expect(result.vector.conflict_score).toBe(0.583);
    expect(result.vector.conflict_style).toBe('analytical');
  });

  test('accepts a scored baseline without the free-text-only reality item', () => {
    expect(() =>
      generateScriptResult([
        { scenarioId: 'trust', choice: 'B', timestamp: 1 },
        { scenarioId: 'conflict', choice: 'C', timestamp: 2 },
        { scenarioId: 'attachment', choice: 'A', timestamp: 3 },
        { scenarioId: 'emotion', choice: 'C', timestamp: 4 },
        { scenarioId: 'stress', choice: 'D', timestamp: 5 },
        { scenarioId: 'achievement', choice: 'A', timestamp: 6 },
        { scenarioId: 'selfview', choice: 'A', timestamp: 7 },
        { scenarioId: 'socialenergy', choice: 'D', timestamp: 8 },
        { scenarioId: 'conflict_friend', choice: 'B', timestamp: 9 },
        { scenarioId: 'stress_chronic', choice: 'C', timestamp: 10 },
        { scenarioId: 'social_lowenergy', choice: 'D', timestamp: 11 },
        { scenarioId: 'motive_silence', choice: 'A', timestamp: 12 },
        { scenarioId: 'motive_social', choice: 'C', timestamp: 13 },
      ]),
    ).not.toThrow();
  });

  test('does not turn the baseline into a fixed archetype label', () => {
    const result = generateScriptResult([
      { scenarioId: 'trust', choice: 'B', timestamp: 1 },
      { scenarioId: 'conflict', choice: 'C', timestamp: 2 },
      { scenarioId: 'attachment', choice: 'A', timestamp: 3 },
      { scenarioId: 'emotion', choice: 'C', timestamp: 4 },
      { scenarioId: 'stress', choice: 'D', timestamp: 5 },
      { scenarioId: 'achievement', choice: 'A', timestamp: 6 },
      { scenarioId: 'selfview', choice: 'A', timestamp: 7 },
      { scenarioId: 'socialenergy', choice: 'D', timestamp: 8 },
      { scenarioId: 'conflict_friend', choice: 'B', timestamp: 9 },
      { scenarioId: 'stress_chronic', choice: 'C', timestamp: 10 },
      { scenarioId: 'social_lowenergy', choice: 'D', timestamp: 11 },
      { scenarioId: 'motive_silence', choice: 'A', timestamp: 12 },
      { scenarioId: 'motive_social', choice: 'C', timestamp: 13 },
    ]);

    expect(result.share_card.archetype).toBe('本轮选择记录');
    expect(result.archetype_id).toBe('continuous_observation');
  });

  test('carries free-text reality input into result and follow-up prompts', () => {
    const result = generateScriptResult(
      [
        { scenarioId: 'trust', choice: 'B', timestamp: 1 },
        { scenarioId: 'conflict', choice: 'C', timestamp: 2 },
        { scenarioId: 'attachment', choice: 'B', timestamp: 3 },
        { scenarioId: 'emotion', choice: 'A', timestamp: 4 },
        { scenarioId: 'stress', choice: 'A', timestamp: 5 },
        { scenarioId: 'achievement', choice: 'A', timestamp: 6 },
        { scenarioId: 'selfview', choice: 'D', timestamp: 7 },
        { scenarioId: 'socialenergy', choice: 'C', timestamp: 8 },
        { scenarioId: 'conflict_friend', choice: 'A', timestamp: 9 },
        { scenarioId: 'stress_chronic', choice: 'A', timestamp: 10 },
        { scenarioId: 'social_lowenergy', choice: 'C', timestamp: 11 },
        { scenarioId: 'motive_silence', choice: 'A', timestamp: 12 },
        { scenarioId: 'motive_social', choice: 'A', timestamp: 13 },
      ],
      'zh-CN',
      { reality_refuse: '同事临时把额外任务塞给我，我想拒绝，但怕显得不配合。' },
    );

    expect(result.free_text_answers?.reality_refuse).toContain('额外任务');
    expect(result.eva_wants_to_confirm?.length).toBeGreaterThan(0);
  });
});
