import { describe, expect, it } from 'vitest';

import { locateSentences } from './text-locate.js';

describe('locateSentences（2-A 句子切分器）', () => {
  it('中文句终符切分，偏移可通过 slice 重算', () => {
    const text = '今天开会还行。她说我状态不错。晚上拖延了。';
    const spans = locateSentences(text);
    expect(spans.map((s) => s.text)).toEqual(['今天开会还行。', '她说我状态不错。', '晚上拖延了。']);
    for (const s of spans) {
      expect(text.slice(s.start, s.end)).toBe(s.text);
    }
  });

  it('英文句号切分', () => {
    const text = 'I did fine. She said hi. I procrastinated today.';
    const spans = locateSentences(text);
    expect(spans.map((s) => s.text)).toEqual(['I did fine.', 'She said hi.', 'I procrastinated today.']);
  });

  it('中英混合与问号叹号', () => {
    const text = '真的吗？是的!ok then.好';
    const spans = locateSentences(text);
    expect(spans.map((s) => s.text)).toEqual(['真的吗？', '是的!', 'ok then.', '好']);
  });

  it('连续句终符与省略号折叠为一个边界', () => {
    const text = '第一句。。……第二句';
    const spans = locateSentences(text);
    expect(spans.map((s) => s.text)).toEqual(['第一句。。……', '第二句']);
  });

  it('无句终符时整段为一句', () => {
    const text = '一段没有结尾的话';
    const spans = locateSentences(text);
    expect(spans).toHaveLength(1);
    expect(spans[0]).toEqual({ start: 0, end: text.length, text });
  });

  it('触发词在句首（start=0）', () => {
    const spans = locateSentences('拖延了。其他没事。');
    expect(spans[0]).toEqual({ start: 0, end: 4, text: '拖延了。' });
  });

  it('空串返回空数组', () => {
    expect(locateSentences('')).toEqual([]);
  });

  it('换行视为句边界', () => {
    const text = '第一行\n第二行\n';
    const spans = locateSentences(text);
    expect(spans.map((s) => s.text)).toEqual(['第一行\n', '第二行\n']);
  });
});
