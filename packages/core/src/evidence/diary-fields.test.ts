import { describe, expect, it } from 'vitest';

import { buildDiaryEntryFields, normalizeDiaryEventType } from './diary-fields.js';

describe('normalizeDiaryEventType', () => {
  it('识别合法标签', () => {
    expect(normalizeDiaryEventType('breakthrough')).toBe('breakthrough');
    expect(normalizeDiaryEventType('anger')).toBe('anger');
  });

  it('非法/空值回退 other', () => {
    expect(normalizeDiaryEventType('bogus')).toBe('other');
    expect(normalizeDiaryEventType(undefined)).toBe('other');
  });
});

describe('buildDiaryEntryFields（2-A 字段还原唯一实现）', () => {
  it('常规键映射', () => {
    const fields = buildDiaryEntryFields(
      { detail: '今天拖延了', high_point: '完成了提案', low_point: '睡过头', pattern: '发现我总赶 deadline', connection: '和朋友聊了' },
      'other',
    );
    expect(fields.detail).toBe('今天拖延了');
    expect(fields.highPoint).toBe('完成了提案');
    expect(fields.lowPoint).toBe('睡过头');
    expect(fields.patternNoticed).toBe('发现我总赶 deadline');
    expect(fields.connectionOrDistance).toBe('和朋友聊了');
  });

  it('breakthrough 标签下 highPoint 取 detail', () => {
    const fields = buildDiaryEntryFields({ detail: '拿下大单' }, 'breakthrough');
    expect(fields.highPoint).toBe('拿下大单');
  });

  it('compromise/anger/overwhelm 标签下 lowPoint 取 detail', () => {
    for (const eventType of ['compromise', 'anger', 'overwhelm'] as const) {
      const fields = buildDiaryEntryFields({ detail: '吵翻了' }, eventType);
      expect(fields.lowPoint).toBe('吵翻了');
    }
  });

  it('connection 标签下 connectionOrDistance 取 detail', () => {
    const fields = buildDiaryEntryFields({ detail: '跟她聊了很久' }, 'connection');
    expect(fields.connectionOrDistance).toBe('跟她聊了很久');
  });

  it('patternNoticed 缺失时回退 detail；detail 做 trim', () => {
    const fields = buildDiaryEntryFields({ detail: '  有 whitespace  ' }, 'other');
    expect(fields.detail).toBe('有 whitespace');
    expect(fields.patternNoticed).toBe('有 whitespace');
  });

  it('驼峰与替代键名兼容', () => {
    const fields = buildDiaryEntryFields(
      { highPoint: '驼峰高点', lowPoint: '驼峰低点', patternNoticed: '驼峰模式', highlight: '备用高点' },
      'other',
    );
    expect(fields.highPoint).toBe('驼峰高点');
    expect(fields.lowPoint).toBe('驼峰低点');
    expect(fields.patternNoticed).toBe('驼峰模式');
  });

  it('空 answers 不抛错', () => {
    const fields = buildDiaryEntryFields({}, 'other');
    expect(fields.detail).toBeUndefined();
    expect(fields.highPoint).toBeUndefined();
  });
});
