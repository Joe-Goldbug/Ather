// apps/api/src/modules/assessment/services/micro-sandbox/inquiry-agent.service.spec.ts
//
// Hermetic tests for InquiryAgentService.
//
// The 3 spec tests from the plan mock the underlying funnel() to assert that:
//   1. askFirstQuestion returns a non-empty question with non-zero progress
//   2. askNextQuestion advances at least one of the four dimensions
//   3. extractVariables returns all required fields at the right temperatures
//
// We mock funnel() (not the higher-level wrapper) so we can verify each call
// gets the right temperature, model, and JSON contract.

import { describe, test, expect, jest, beforeEach } from '@jest/globals';
import { InquiryAgentService } from './inquiry-agent.service.js';
import { DynamicScriptFunnelConfig } from '../../../../common/minimax/dynamic-script-funnel.config.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const funnelMock: any = jest.fn();

jest.mock('../../../../common/llm-funnel.js', () => ({
  funnel: (...args: unknown[]) => funnelMock(...args),
}));

describe('InquiryAgentService', () => {
  let service: InquiryAgentService;
  let config: DynamicScriptFunnelConfig;

  beforeEach(() => {
    process.env.DYNAMIC_SCRIPT_API_KEY = 'sk-test';
    process.env.DYNAMIC_SCRIPT_API_BASE = 'https://api.minimaxi.com';
    funnelMock.mockReset();
    config = new DynamicScriptFunnelConfig();
    service = new InquiryAgentService(config);
  });

  test('askFirstQuestion returns a non-empty question with progress', async () => {
    funnelMock.mockResolvedValueOnce({
      content: JSON.stringify({
        question: '当时会议上具体发生了什么？',
        progress: { scenario: 0.5, emotion: 0.0, background: 0.0, relationship: 0.0 },
      }),
    });

    const result = await service.askFirstQuestion(
      '今天我和李明因为项目方案吵了一架，他否定了我的市场分析',
      'zh-CN',
    );

    expect(result.question.length).toBeGreaterThan(0);
    expect(result.progress.scenario).toBeGreaterThan(0);

    // Verify funnel was called with the M2.7 conversational tier and the correct system prompt.
    // [user decision 2026-07-26] dialogue = M2.7 (cheaper/faster), script generation = M3.
    // 断言对照 config 的两个档位而不是硬编码模型名，避免模型版本升级后此处再次腐烂。
    expect(funnelMock).toHaveBeenCalledTimes(1);
    const [req, ctx] = funnelMock.mock.calls[0] as [any, any];
    expect(ctx.config.model).toBe(config.M27.model);
    expect(ctx.config.model).not.toBe(config.M3.model);
    expect(ctx.config.baseUrl).toBe('https://api.minimaxi.com');
    expect(req.system).toContain('追问 Agent');
    expect(req.temperature).toBe(0.7);
    expect(req.messages[0].content).toContain('李明');
  });

  test('askNextQuestion advances at least one dimension of progress', async () => {
    funnelMock.mockResolvedValueOnce({
      content: JSON.stringify({
        question: '你当时的感受是什么？',
        progress: { scenario: 0.5, emotion: 0.6, background: 0.0, relationship: 0.0 },
      }),
    });

    const conversation = [
      { role: 'ai' as const, content: '你能具体说说当时发生了什么吗？', timestamp: 1 },
      { role: 'user' as const, content: '我们在周会上，他公开质疑我做的数据。', timestamp: 2 },
    ];

    const result = await service.askNextQuestion(conversation, 'zh-CN');

    expect(result.question.length).toBeGreaterThan(0);
    // At least one dimension should have been advanced by the model
    const dims = [
      result.progress.scenario,
      result.progress.emotion,
      result.progress.background,
      result.progress.relationship,
    ];
    expect(Math.max(...dims)).toBeGreaterThan(0);

    // The conversation history should be in the prompt
    const [req] = funnelMock.mock.calls[0] as [any, any];
    expect(req.messages[0].content).toContain('公开质疑');
  });

  test('extractVariables returns all required fields at temperature 0.3', async () => {
    funnelMock.mockResolvedValueOnce({
      content: JSON.stringify({
        scenario_type: 'work',
        trigger_event: '和李明因为项目方案吵架',
        primary_emotion: '愤怒',
        emotion_intensity: 0.7,
        emotional_response: '觉得不被尊重',
        key_persons: [{ name: '李明', relationship: '5年同事', relationship_quality: 0.3 }],
        coping_strategy: '沉默离开会议室',
      }),
    });

    const conversation = [
      { role: 'ai' as const, content: '发生了什么？', timestamp: 1 },
      { role: 'user' as const, content: '我和李明因为项目方案吵了一架。', timestamp: 2 },
      { role: 'ai' as const, content: '你的感受是？', timestamp: 3 },
      { role: 'user' as const, content: '愤怒，觉得不被尊重。我默默离开了会议室。', timestamp: 4 },
      { role: 'ai' as const, content: '最近工作压力大吗？', timestamp: 5 },
      { role: 'user' as const, content: '是的，连续加班两周了。今天就爆发了。', timestamp: 6 },
      { role: 'ai' as const, content: '李明和你平时关系如何？', timestamp: 7 },
      { role: 'user' as const, content: '5年同事，平时还算配合。这次出乎意料。', timestamp: 8 },
    ];

    const vars = await service.extractVariables(conversation);

    expect(vars.scenario_type).toBe('work');
    expect(vars.trigger_event.length).toBeGreaterThan(0);
    expect(vars.primary_emotion.length).toBeGreaterThan(0);
    expect(vars.emotion_intensity).toBeGreaterThan(0);
    expect(vars.coping_strategy.length).toBeGreaterThan(0);
    expect(vars.key_persons.length).toBeGreaterThan(0);
    expect(vars.key_persons[0].name).toContain('李');

    // Extraction must use lower temperature for JSON stability
    const [req] = funnelMock.mock.calls[0] as [any, any];
    expect(req.temperature).toBe(0.3);
    expect(req.system).toContain('变量提取器');
  });
});