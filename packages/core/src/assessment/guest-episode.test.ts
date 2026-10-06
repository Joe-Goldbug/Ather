import { describe, expect, test } from 'bun:test';
import {
  GUEST_EPISODE_ID,
  GUEST_EPISODE_VERSION,
  RAIN_BEFORE_STOP_NODES,
  buildGuestEpisodeResult,
  validateGuestEpisodeAnswers,
  type GuestEpisodeAnswer,
} from './guest-episode';

function answers(choiceIds: Array<'A' | 'B' | 'C' | 'D'>): GuestEpisodeAnswer[] {
  return RAIN_BEFORE_STOP_NODES.map((node, index) => ({
    node_id: node.id,
    choice_id: choiceIds[index]!,
  }));
}

describe('guest opening acceptance contract', () => {
  test('freezes one six-node chapter with four balanced action directions per node', () => {
    expect(GUEST_EPISODE_ID).toBe('rain-before-stop');
    expect(GUEST_EPISODE_VERSION).toBe('v1');
    expect(RAIN_BEFORE_STOP_NODES).toHaveLength(6);

    for (const node of RAIN_BEFORE_STOP_NODES) {
      expect(node.options).toHaveLength(4);
      expect(node.options.every((option) => option.consequence.trim().length > 0)).toBe(true);
      expect(new Set(node.options.map((option) => option.id))).toEqual(new Set(['A', 'B', 'C', 'D']));
      expect(new Set(node.options.map((option) => option.approach))).toEqual(
        new Set(['approach', 'protect', 'analyze', 'withdraw'])
      );
    }
  });

  test('rejects duplicate, missing, unknown, and invalid choices', () => {
    const invalid: GuestEpisodeAnswer[] = [
      { node_id: 'node-1', choice_id: 'A' },
      { node_id: 'node-1', choice_id: 'B' },
      { node_id: 'node-2', choice_id: 'C' },
      { node_id: 'node-3', choice_id: 'D' },
      { node_id: 'node-4', choice_id: 'A' },
      { node_id: 'unknown', choice_id: 'A' },
    ];

    expect(validateGuestEpisodeAnswers(invalid)).toEqual(
      expect.arrayContaining(['duplicate_answer:node-1', 'missing_answer:node-5', 'missing_answer:node-6', 'unknown_node:unknown'])
    );
  });

  test('produces choice-dependent, traceable candidate evidence without labels or scores', () => {
    const connecting = buildGuestEpisodeResult(answers(['A', 'A', 'A', 'A', 'A', 'A']));
    const protecting = buildGuestEpisodeResult(answers(['B', 'B', 'B', 'B', 'B', 'B']));

    expect(connecting).not.toBeNull();
    expect(protecting).not.toBeNull();
    expect(connecting!.pattern).not.toBe(protecting!.pattern);
    expect(connecting).toMatchObject({
      episode_id: GUEST_EPISODE_ID,
      episode_version: GUEST_EPISODE_VERSION,
      evidence_kind: 'simulation',
      science_status: 'candidate_only',
      source_independence_group: `simulation:${GUEST_EPISODE_ID}:${GUEST_EPISODE_VERSION}`,
    });

    const visibleCopy = JSON.stringify([connecting, protecting]);
    expect(visibleCopy).not.toMatch(/人格类型|型格|MBTI|诊断|百分比|总分/);
  });

  test('names a context difference when the chapter contains an exception', () => {
    const result = buildGuestEpisodeResult(answers(['C', 'C', 'A', 'C', 'B', 'C']));
    expect(result).not.toBeNull();
    expect(result!.exceptions).toContain('当众的分歧');
    expect(result!.exceptions).toContain('短暂的破裂');
  });
});
