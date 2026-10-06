import { describe, expect, it } from 'vitest';

import { computeDiaryEvidenceEvents } from './diary-evidence.js';

// 4 句：[0]今天开会还行。[1]她说我最近状态不错，我也觉得有进步。[2]晚上拖延了，没做该做的事。[3]明天再赶。
const DETAIL = '今天开会还行。她说我最近状态不错，我也觉得有进步。晚上拖延了，没做该做的事。明天再赶。';

describe('diary-evidence 片段定位（2-A1/2-A2）', () => {
  it('quote = 触发词所在句，而非前 200 字；locator 可对原文重算', () => {
    const events = computeDiaryEvidenceEvents('u1', 'd1', { detail: DETAIL }, 'zh-CN');
    const ach = events.filter((e) => e.dimension === 'achievementMotivation');

    // "进步"(+1) 与 "拖延"(-1) 同维度：信号叠加为一条事件，quote 取首个命中句
    expect(ach).toHaveLength(1);
    expect(ach[0].quote).toBe('她说我最近状态不错，我也觉得有进步。');
    expect(ach[0].fragment).toBeDefined();
    expect(ach[0].fragment!.field).toBe('detail');
    expect(DETAIL.slice(ach[0].fragment!.start, ach[0].fragment!.end)).toBe(ach[0].quote);
    expect(ach[0].fragment!.locator).toBe(
      `detail:${ach[0].fragment!.start}-${ach[0].fragment!.end}`,
    );
  });

  it('触发词在句首（start=0）也能定位', () => {
    const events = computeDiaryEvidenceEvents('u1', 'd2', { detail: '拖延了。其他没事。' }, 'zh-CN');
    const ach = events.filter((e) => e.dimension === 'achievementMotivation');
    expect(ach).toHaveLength(1);
    expect(ach[0].quote).toBe('拖延了。');
    expect(ach[0].fragment!.start).toBe(0);
  });

  it('命中发生在 patternNoticed 字段时，fragment.field 正确', () => {
    const events = computeDiaryEvidenceEvents(
      'u1',
      'd3',
      { detail: '没什么特别的', patternNoticed: '发现我又在回避社交场合。' },
      'zh-CN',
    );
    const att = events.filter((e) => e.dimension === 'attachment');
    expect(att).toHaveLength(1);
    expect(att[0].quote).toBe('发现我又在回避社交场合。');
    expect(att[0].fragment!.field).toBe('patternNoticed');
  });

  it('eventType 标签路径：quote 取首句且无 fragment', () => {
    const long = `${'很长的铺垫。'.repeat(60)}结尾。`;
    const events = computeDiaryEvidenceEvents(
      'u1',
      'd4',
      { detail: long, eventType: 'breakthrough' },
      'zh-CN',
    );
    const ev = events.filter((e) => e.dimension === 'achievementMotivation');
    expect(ev).toHaveLength(1);
    expect(ev[0].quote).toBe('很长的铺垫。');
    expect(ev[0].fragment).toBeUndefined();
  });

  it('回归：信号强度语义不变（同维度跨字段叠加 0.6→0.8）', () => {
    const events = computeDiaryEvidenceEvents(
      'u1',
      'd5',
      { detail: '和朋友聊了很久。', highPoint: '跟朋友散步。' },
      'zh-CN',
    );
    const se = events.filter((e) => e.dimension === 'socialEnergy');
    expect(se).toHaveLength(1);
    // 两个命中各记 0.6 与 +0.2 → delta = round(0.8 * 12) = 10
    expect(se[0].delta).toBe(10);
    // quote 取 detail（字段顺序中的第一个命中）
    expect(se[0].quote).toBe('和朋友聊了很久。');
  });

  it('超长句截断：quote ≤ 200 字且 fragment.text 保留原句', () => {
    const longSentence = `拖延了${'很'.repeat(260)}。`;
    const events = computeDiaryEvidenceEvents('u1', 'd6', { detail: longSentence }, 'zh-CN');
    const ach = events.filter((e) => e.dimension === 'achievementMotivation');
    expect(ach[0].quote!.length).toBeLessThanOrEqual(200);
    expect(ach[0].fragment!.text).toBe('拖延了' + '很'.repeat(260) + '。');
  });
});

describe('diary-evidence 主语归因（2-B1/2-B2）', () => {
  it('S3 验收："我同事又拖延了" → 零 self 成就动机证据 + 1 条 about_other', () => {
    const events = computeDiaryEvidenceEvents('u1', 'd7', { detail: '我同事又拖延了' }, 'zh-CN');
    const selfAch = events.filter(
      (e) => e.dimension === 'achievementMotivation' && (!e.attribution || e.attribution === 'self'),
    );
    expect(selfAch).toHaveLength(0);

    const other = events.filter((e) => e.attribution === 'about_other');
    expect(other).toHaveLength(1);
    expect(other[0].dimension).toBe('achievementMotivation');
    expect(other[0].quote).toBe('我同事又拖延了');
    expect(other[0].fragment).toBeDefined();
    expect(other[0].fragment!.text).toBe('我同事又拖延了');
  });

  it('假设句 → hypothetical，同样不进 self 信号', () => {
    const events = computeDiaryEvidenceEvents(
      'u1',
      'd8',
      { detail: '如果我当时拖延了就完了' },
      'zh-CN',
    );
    const selfAch = events.filter(
      (e) => e.dimension === 'achievementMotivation' && (!e.attribution || e.attribution === 'self'),
    );
    expect(selfAch).toHaveLength(0);
    expect(events.filter((e) => e.attribution === 'hypothetical')).toHaveLength(1);
  });

  it('self 命中带 attribution="self"，信号与 delta 不变', () => {
    const events = computeDiaryEvidenceEvents('u1', 'd9', { detail: '我总是拖延。' }, 'zh-CN');
    const ach = events.filter((e) => e.dimension === 'achievementMotivation');
    expect(ach).toHaveLength(1);
    expect(ach[0].attribution).toBe('self');
    expect(ach[0].delta).toBe(-7); // round(0.6 * -12) = -7，与既有规则一致
  });

  it('"其他"守卫在完整抽取链路中生效："其他事都拖延了" → self', () => {
    const events = computeDiaryEvidenceEvents('u1', 'd10', { detail: '其他事都拖延了' }, 'zh-CN');
    const ach = events.filter((e) => e.dimension === 'achievementMotivation');
    expect(ach).toHaveLength(1);
    expect(ach[0].attribution).toBe('self');
  });

  it('self 与 about_other 同篇并存：互不污染', () => {
    const events = computeDiaryEvidenceEvents(
      'u1',
      'd11',
      { detail: '我自己拖延了。同事倒是没拖延。' },
      'zh-CN',
    );
    const selfEv = events.filter((e) => e.attribution === 'self');
    const otherEv = events.filter((e) => e.attribution === 'about_other');
    expect(selfEv.length).toBeGreaterThanOrEqual(1);
    expect(otherEv.length).toBeGreaterThanOrEqual(1);
    // 两类事件的 quote 不相同
    expect(selfEv[0].quote).not.toBe(otherEv[0].quote);
  });
});
