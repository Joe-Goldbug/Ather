import { describe, expect, test } from 'bun:test';
import {
  GUEST_EPISODE_ID,
  GUEST_EPISODE_VERSION,
  GUEST_EPISODE_TITLE,
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
    expect(GUEST_EPISODE_TITLE).toBe('突发压力与协作应对');
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

  test('describes the user’s different responses instead of only repeating category counts', () => {
    const result = buildGuestEpisodeResult(answers(['C', 'C', 'D', 'D', 'B', 'C']));
    expect(result?.summary).toContain('先把事情弄清楚');
    expect(result?.observations.map((item) => item.title)).toEqual(expect.arrayContaining([
      expect.stringContaining('你更常'),
      expect.stringContaining('你换了一种做法'),
    ]));
    expect(JSON.stringify(result)).not.toContain('系统原本的问题压到你身上');
  });

  test('keeps an ordered story replay and separately correctable observations', () => {
    const result = buildGuestEpisodeResult(answers(['A', 'A', 'A', 'A', 'B', 'B']));
    expect(result).not.toBeNull();
    expect(result!.story_replay).toContain('迟到的消息');
    expect(result!.story_replay).toContain('短暂的破裂');
    expect(result!.observations[0]).toMatchObject({
      id: 'guest:approach:primary',
      evidence_node_ids: ['node-1', 'node-2', 'node-3', 'node-4'],
    });
    expect(result!.observations).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'guest:transition:first-change', evidence_node_ids: ['node-4', 'node-5'] }),
    ]));
    expect(JSON.stringify(result)).not.toMatch(/导致|说明你害怕|本能地/);
  });

  test('exhausts all 4,096 response combinations without logical contradiction or buzzwords', () => {
    const choiceIds: Array<'A' | 'B' | 'C' | 'D'> = ['A', 'B', 'C', 'D'];
    let count = 0;
    const uniqueSummaries = new Set<string>();

    for (const c1 of choiceIds) {
      for (const c2 of choiceIds) {
        for (const c3 of choiceIds) {
          for (const c4 of choiceIds) {
            for (const c5 of choiceIds) {
              for (const c6 of choiceIds) {
                count++;
                const choices = [c1, c2, c3, c4, c5, c6];
                const res = buildGuestEpisodeResult(answers(choices));
                expect(res).not.toBeNull();
                uniqueSummaries.add(res!.summary);

                // 0. A complete report must carry enough concrete material to be useful,
                // while still staying bounded as a short first chapter.
                const reportLength = [
                  res!.story_replay,
                  res!.summary,
                  res!.pattern,
                  res!.benefits,
                  res!.costs,
                  res!.exceptions,
                  ...res!.observations.map((observation) => observation.text),
                ].join('').length;
                expect(reportLength).toBeGreaterThanOrEqual(300);
                expect(reportLength).toBeLessThanOrEqual(1_500);

                // 1. Forbidden buzzwords & sycophancy check
                const fullText = JSON.stringify(res);
                expect(fullText).not.toMatch(
                  /潜意识|核心铠甲|针对性调频|极高的边界清醒度|敏锐的止损直觉|心智如流水|过度功能化|平衡且灵活/
                );

                // 2. Boundary notice check
                expect(res!.unknowns).toBe('这是根据单次模拟故事作出的初步观察，不是对你的永久定性。');

                // 3. Logic contradiction check
                // A report must never claim all 6 nodes were consistent when choices were mixed
                const isUniform = c1 === c2 && c2 === c3 && c3 === c4 && c4 === c5 && c5 === c6;
                if (!isUniform) {
                  expect(res!.exceptions).not.toContain('没有出现反向的例外选择');
                  expect(res!.exceptions).not.toContain('保持了一致的应对姿态');
                  expect(res!.pattern).not.toContain('完全一致');
                  expect(res!.summary).not.toContain('六次都选择');
                } else {
                  expect(res!.exceptions).toContain('六个节点里');
                }

                // 4. Every visible observation remains tied to an actual node.
                for (const observation of res!.observations) {
                  expect(observation.evidence_node_ids.length).toBeGreaterThan(0);
                  for (const nodeId of observation.evidence_node_ids) {
                    expect(RAIN_BEFORE_STOP_NODES.some((node) => node.id === nodeId)).toBe(true);
                  }
                }
              }
            }
          }
        }
      }
    }
    expect(count).toBe(4096);
    expect(uniqueSummaries.size).toBeGreaterThanOrEqual(5);
  });
});
