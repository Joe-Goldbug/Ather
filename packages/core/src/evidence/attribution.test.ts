import { describe, expect, it } from 'vitest';

import { classifyAttribution } from './attribution.js';

/**
 * 分类器契约（2-B1）：
 * - 向后 12 字窗口内出现第三方主语 → about_other
 * - 假设标记 → hypothetical
 * - 其余默认 self
 * - "其他"不被当作代词"他"（否定回视守卫）
 * 策略：词典宁窄勿宽——错杀可被用户纠偏（1-2a 已通），漏杀是脏数据。
 */
describe('classifyAttribution（2-B1 主语归因）', () => {
  it('路线图验收句："我同事又拖延了" → about_other', () => {
    const text = '我同事又拖延了';
    expect(classifyAttribution(text, text.indexOf('拖延'))).toBe('about_other');
  });

  it('亲属称谓："我妈总说我不联系她" → about_other', () => {
    const text = '我妈总说我不联系她';
    expect(classifyAttribution(text, text.indexOf('联系'))).toBe('about_other');
  });

  it('裸代词：他/她们 → about_other', () => {
    const t1 = '他昨天又拖延了';
    expect(classifyAttribution(t1, t1.indexOf('拖延'))).toBe('about_other');
    const t2 = '她们集体迟到了';
    expect(classifyAttribution(t2, t2.indexOf('迟到'))).toBe('about_other');
  });

  it('"其他"不触发代词误判："其他事都拖延了" → self', () => {
    const text = '其他事都拖延了';
    expect(classifyAttribution(text, text.indexOf('拖延'))).toBe('self');
  });

  it('假设标记 → hypothetical', () => {
    const t1 = '如果我当时拖延了就完了';
    expect(classifyAttribution(t1, t1.indexOf('拖延'))).toBe('hypothetical');
    const t2 = '要是我没扛住压力就崩溃了';
    expect(classifyAttribution(t2, t2.indexOf('崩溃'))).toBe('hypothetical');
  });

  it('默认 self："我总是拖延"', () => {
    const text = '我总是拖延';
    expect(classifyAttribution(text, text.indexOf('拖延'))).toBe('self');
  });

  it('匹配在句首（matchStart=0，无窗口）→ self', () => {
    expect(classifyAttribution('拖延了', 0)).toBe('self');
  });

  it('主语超出 12 字窗口 → self（窗口宁窄勿宽）', () => {
    const text = '今天从早到晚都在开会而且特别累，同事反而拖延了';
    // "同事"距"拖延"只有 2 字——换成主语在 13 字外的句子：
    const far = '这一天从早忙到晚会议排满还临时加了两个紧急需求拖延了';
    expect(classifyAttribution(far, far.indexOf('拖延'))).toBe('self');
    expect(classifyAttribution(text, text.indexOf('拖延'))).toBe('about_other');
  });

  it('假设标记与主语同现时，主语优先（都排除，分类仅作标注）', () => {
    const text = '如果我同事拖延了';
    expect(classifyAttribution(text, text.indexOf('拖延'))).toBe('about_other');
  });
});
