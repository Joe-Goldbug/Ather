import { describe, expect, test } from 'bun:test';
import { getReportSystemPrompt } from './report-prompts.js';

describe('getReportSystemPrompt', () => {
  test('uses the evidence-first policy at runtime', () => {
    const prompt = getReportSystemPrompt('zh-CN');

    expect(prompt).toContain('证据报告生成器');
    expect(prompt).toContain('目前无法判断长期模式');
    expect(prompt).toContain('不能给用户固定类型');
    expect(prompt).not.toContain('archetypeName 必须是');
  });
});
