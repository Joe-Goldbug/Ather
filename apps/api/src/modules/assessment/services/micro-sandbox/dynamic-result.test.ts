import { describe, expect, test } from 'vitest';
import { buildDynamicResult } from './dynamic-result';

const scenes = [1, 2].map((n) => ({ scene_id: `s${n}`, scene_number: n, narrative: `情境 ${n}`,
  choices: [{ choice_id: 'a', text: '说明我的顾虑' }, { choice_id: 'b', text: '先离开现场' }] }));

describe('completed dynamic observations', () => {
  test('uses only selected branches and preserves situation and action evidence', () => {
    const result = buildDynamicResult(scenes, [{ scene_id: 's2', choice_id: 'b' }]);
    expect(result.observations).toHaveLength(1);
    expect(result.observations[0].evidence).toEqual({ scene_id: 's2', choice_id: 'b', situation: '情境 2', choice_text: '先离开现场' });
    expect(result.observations[0].text).not.toContain('说明我的顾虑');
    expect(result.psychological_narrative).not.toMatch(/更冷静|成熟|逃避|人格/);
  });
  test('does not manufacture observations before playback', () => {
    expect(buildDynamicResult(scenes, [])).toEqual({ psychological_narrative: '', observations: [] });
  });
  test('rejects unknown choices instead of substituting a plausible observation', () => {
    expect(() => buildDynamicResult(scenes, [{ scene_id: 's2', choice_id: 'missing' }])).toThrow();
  });
});
