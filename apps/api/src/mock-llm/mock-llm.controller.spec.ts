import { MockLlmController } from './mock-llm.controller.js';
import { detectMockRoute } from './mock-llm.router.js';

describe('MockLlmController', () => {
  it('routes current dynamic micro-sandbox prompts by stable schema markers, not fragile prose only', () => {
    expect(
      detectMockRoute(
        'You are a psychological scenario designer for the EVA personality system. Output strict JSON array with vector_patch and options.',
        'Generate exactly 1 new scenario question. Output JSON only, no explanation.',
      ),
    ).toBe('scenario');
  });

  it('returns a valid dynamic micro-sandbox scenario for the current prompt shape', () => {
    const controller = new MockLlmController();

    const response = controller.chatCompletions({
      messages: [
        {
          content:
            'You are a psychological scenario designer for the EVA personality system. Generate one micro-sandbox scenario for a returning user.',
        },
        {
          content: 'Generate exactly 1 new scenario question. Output JSON only, no explanation.',
        },
      ],
    });

    const content = response.choices[0]?.message?.content;
    expect(typeof content).toBe('string');

    const parsed = JSON.parse(String(content));
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed).toHaveLength(1);

    const scenario = parsed[0];
    expect(scenario.id).toBe('mock-micro-1');
    expect(Object.keys(scenario.options)).toEqual(['A', 'B', 'C', 'D']);
    expect(Object.keys(scenario.vector_patch)).toEqual(['A', 'B', 'C', 'D']);
    expect(scenario.vector_patch.A).toMatchObject({
      stress_score: expect.any(Number),
      boundary_strength: expect.any(Number),
    });
  });

  it('routes report prompts to report fixture', () => {
    const controller = new MockLlmController();
    const response = controller.chatCompletions({
      messages: [
        { content: 'Please return JSON that strictly follows ReportSchema.' },
        { content: 'Use reportVersion evidence-v1 and evidenceHighlights.' },
      ],
    });

    const parsed = JSON.parse(String(response.choices[0]?.message?.content));
    expect(parsed).toMatchObject({
      reportVersion: 'evidence-v1',
      evidenceHighlights: expect.any(Array),
    });
  });

  it('routes entity extraction prompts to entity fixture', () => {
    const controller = new MockLlmController();
    const response = controller.chatCompletions({
      messages: [
        { content: 'You are an entity extraction assistant. 严格输出 JSON。' },
        { content: 'Extract persons and value_conflicts.' },
      ],
    });

    const parsed = JSON.parse(String(response.choices[0]?.message?.content));
    expect(parsed).toEqual({
      persons: [],
      value_conflicts: [],
    });
  });

  it('routes weekly review prompts to weekly fixture text', () => {
    const controller = new MockLlmController();
    const response = controller.chatCompletions({
      messages: [
        { content: 'You are generating a personalized weekly review.' },
        { content: 'Generate weekly review with 本周主导情绪 and 情绪趋势.' },
      ],
    });

    const content = String(response.choices[0]?.message?.content);
    expect(content).toContain('## 本周主导情绪');
    expect(content).toContain('## 下周建议');
  });

  it('falls back to default text for unknown prompts', () => {
    const controller = new MockLlmController();
    const response = controller.chatCompletions({
      messages: [
        { content: 'This is some unrelated prompt.' },
        { content: 'Return anything.' },
      ],
    });

    expect(response.choices[0]?.message?.content).toBe(
      '收到。你的输入已经记录，我会继续跟进。',
    );
  });
});
