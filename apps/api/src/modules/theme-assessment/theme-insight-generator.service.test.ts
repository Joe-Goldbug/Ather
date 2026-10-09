import { ThemeInsightGeneratorService } from './theme-insight-generator.service.js';
import { selectThemeRoundCore, buildThemeRoundResult, type ThemeRoundAnswer, type ThemeRoundResult } from '@eva/core';

function makeResult(): ThemeRoundResult {
  const questions = selectThemeRoundCore('emotion', 0);
  const answers: ThemeRoundAnswer[] = questions.map((q, i) => ({
    question_id: q.question_id,
    choice_id: (['A', 'B', 'C', 'D'] as const)[i % 4]!,
  }));
  return buildThemeRoundResult('emotion', questions, answers)!;
}

const sharedResult = makeResult();
const evIds = sharedResult.evidence.map((e) => e.question_id);
const eid = (i: number) => evIds[i] ?? evIds[0]!;

const validInsightJson = JSON.stringify({
  paragraphs: [
    { text: '你在多数情境中选择了先保护自己的边界，但在对方是你信任的人时更愿意靠近。', evidence_question_ids: [eid(0), eid(1)] },
    { text: '与上一轮相比，你在情绪恢复环节展现出了更多主动靠近的倾向。', evidence_question_ids: [eid(2)] },
    { text: '当前线索有限，建议下一轮关注你在权力差异情境下的反应模式。', evidence_question_ids: [eid(3)] },
  ],
});

const validSingleParagraphJson = JSON.stringify({
  paragraphs: [
    { text: '你在不同情境中保留了多种回应方式。', evidence_question_ids: [eid(0)] },
  ],
});

describe('ThemeInsightGeneratorService', () => {
  let originalFetch: typeof fetch;
  let originalEnv: Record<string, string | undefined>;

  beforeEach(() => {
    originalFetch = global.fetch;
    originalEnv = {
      LLM_BASE_URL: process.env.LLM_BASE_URL,
      LLM_API_KEY: process.env.LLM_API_KEY,
      LLM_MODEL: process.env.LLM_MODEL,
      THEME_AI_TIMEOUT_MS: process.env.THEME_AI_TIMEOUT_MS,
    };
  });

  afterEach(() => {
    global.fetch = originalFetch;
    for (const [key, value] of Object.entries(originalEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  const result = sharedResult;

  it('returns null when provider configuration is incomplete', async () => {
    delete process.env.LLM_BASE_URL;
    delete process.env.LLM_API_KEY;
    delete process.env.LLM_MODEL;
    await expect(new ThemeInsightGeneratorService().generateInsight('emotion', result, [], [])).resolves.toBeNull();
  });

  it('returns ai_insight object on valid JSON response', async () => {
    process.env.LLM_BASE_URL = 'https://api.example.com/v1';
    process.env.LLM_API_KEY = 'test-key';
    process.env.LLM_MODEL = 'test-model';
    process.env.THEME_AI_TIMEOUT_MS = '5000';
    global.fetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: '```json\n' + validInsightJson + '\n```' } }],
      }),
    }) as typeof fetch);

    const insight = await new ThemeInsightGeneratorService().generateInsight('emotion', result, [], []);
    expect(insight).not.toBeNull();
    expect(insight!.source).toBe('ai');
    expect(insight!.model).toBe('test-model');
    expect(insight!.disclaimer).toBeTruthy();
    expect(insight!.paragraphs).toHaveLength(3);
    expect(insight!.paragraphs[0].text.length).toBeLessThanOrEqual(200);
    expect(insight!.paragraphs[0].evidence_question_ids.length).toBeGreaterThan(0);
  });

  it('parses JSON without code fence', async () => {
    process.env.LLM_BASE_URL = 'https://api.example.com/v1';
    process.env.LLM_API_KEY = 'test-key';
    process.env.LLM_MODEL = 'test-model';
    process.env.THEME_AI_TIMEOUT_MS = '5000';
    global.fetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: validInsightJson } }],
      }),
    }) as typeof fetch);

    const insight = await new ThemeInsightGeneratorService().generateInsight('emotion', result, [], []);
    expect(insight).not.toBeNull();
    expect(insight!.paragraphs).toHaveLength(3);
  });

  it('returns null on HTTP error', async () => {
    process.env.LLM_BASE_URL = 'https://api.example.com/v1';
    process.env.LLM_API_KEY = 'test-key';
    process.env.LLM_MODEL = 'test-model';
    process.env.THEME_AI_TIMEOUT_MS = '5000';
    global.fetch = vi.fn(async () => ({
      ok: false,
      status: 500,
      json: async () => ({}),
    }) as typeof fetch);

    await expect(new ThemeInsightGeneratorService().generateInsight('emotion', result, [], [])).resolves.toBeNull();
  });

  it('returns null when response has no parseable JSON', async () => {
    process.env.LLM_BASE_URL = 'https://api.example.com/v1';
    process.env.LLM_API_KEY = 'test-key';
    process.env.LLM_MODEL = 'test-model';
    process.env.THEME_AI_TIMEOUT_MS = '5000';
    global.fetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: '抱歉，无法生成分析。' } }],
      }),
    }) as typeof fetch);

    await expect(new ThemeInsightGeneratorService().generateInsight('emotion', result, [], [])).resolves.toBeNull();
  });

  it('rejects paragraphs containing forbidden language', async () => {
    process.env.LLM_BASE_URL = 'https://api.example.com/v1';
    process.env.LLM_API_KEY = 'test-key';
    process.env.LLM_MODEL = 'test-model';
    process.env.THEME_AI_TIMEOUT_MS = '5000';
    global.fetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: JSON.stringify({
          paragraphs: [
            { text: '这可能是焦虑的表现。', evidence_question_ids: [eid(0)] },
            { text: '你在不同情境中保留了多种回应方式。', evidence_question_ids: [eid(1)] },
          ],
        }) }}],
      }),
    }) as typeof fetch);

    const insight = await new ThemeInsightGeneratorService().generateInsight('emotion', result, [], []);
    expect(insight).not.toBeNull();
    expect(insight!.paragraphs).toHaveLength(1);
    expect(insight!.paragraphs[0].text).not.toContain('焦虑');
  });

  it('rejects paragraphs referencing non-existent evidence_question_ids', async () => {
    process.env.LLM_BASE_URL = 'https://api.example.com/v1';
    process.env.LLM_API_KEY = 'test-key';
    process.env.LLM_MODEL = 'test-model';
    process.env.THEME_AI_TIMEOUT_MS = '5000';
    global.fetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: JSON.stringify({
          paragraphs: [
            { text: '你的反应模式很独特。', evidence_question_ids: ['fake.id.v1'] },
          ],
        }) }}],
      }),
    }) as typeof fetch);

    const insight = await new ThemeInsightGeneratorService().generateInsight('emotion', result, [], []);
    // Paragraph references non-existent evidence → rejected → null (no valid paragraphs)
    expect(insight).toBeNull();
  });

  it('rejects paragraphs longer than 200 chars', async () => {
    process.env.LLM_BASE_URL = 'https://api.example.com/v1';
    process.env.LLM_API_KEY = 'test-key';
    process.env.LLM_MODEL = 'test-model';
    process.env.THEME_AI_TIMEOUT_MS = '5000';
    const longText = '这'.repeat(201);
    global.fetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: JSON.stringify({
          paragraphs: [
            { text: longText, evidence_question_ids: [eid(0)] },
            { text: '你在不同情境中保留了多种回应方式。', evidence_question_ids: [eid(1)] },
          ],
        }) }}],
      }),
    }) as typeof fetch);

    const insight = await new ThemeInsightGeneratorService().generateInsight('emotion', result, [], []);
    expect(insight).not.toBeNull();
    expect(insight!.paragraphs).toHaveLength(1);
  });

  it('retries once with an explicit banned-word reminder when every paragraph is rejected', async () => {
    process.env.LLM_BASE_URL = 'https://api.example.com/v1';
    process.env.LLM_API_KEY = 'test-key';
    process.env.LLM_MODEL = 'test-model';
    process.env.THEME_AI_TIMEOUT_MS = '5000';
    let callCount = 0;
    let secondSystemPrompt = '';
    global.fetch = vi.fn(async (_url, init) => {
      callCount++;
      if (callCount === 1) {
        return {
          ok: true,
          json: async () => ({
            choices: [{ message: { content: JSON.stringify({
              paragraphs: [
                { text: '你在压力下可能产生焦虑反应。', evidence_question_ids: [eid(0)] },
              ],
            }) } }],
          }),
        } as Response;
      }
      const body = JSON.parse(String(init?.body ?? '{}')) as { messages?: Array<{ role: string; content: string }> };
      secondSystemPrompt = body.messages?.[0]?.content ?? '';
      return {
        ok: true,
        json: async () => ({
          choices: [{ message: { content: JSON.stringify({
            paragraphs: [
              { text: '你在压力下会先自我调节，再决定如何回应。', evidence_question_ids: [eid(0)] },
            ],
          }) } }],
        }),
      } as Response;
    }) as typeof fetch;

    const insight = await new ThemeInsightGeneratorService().generateInsight('emotion', result, [], []);
    expect(callCount).toBe(2);
    expect(secondSystemPrompt).toContain('焦虑');
    expect(insight).not.toBeNull();
    expect(insight!.paragraphs).toHaveLength(1);
  });

  it('does not retry when at least one paragraph passes validation', async () => {
    process.env.LLM_BASE_URL = 'https://api.example.com/v1';
    process.env.LLM_API_KEY = 'test-key';
    process.env.LLM_MODEL = 'test-model';
    process.env.THEME_AI_TIMEOUT_MS = '5000';
    let callCount = 0;
    global.fetch = vi.fn(async () => {
      callCount++;
      return {
        ok: true,
        json: async () => ({
          choices: [{ message: { content: JSON.stringify({
            paragraphs: [
              { text: '这可能是焦虑的表现。', evidence_question_ids: [eid(0)] },
              { text: '你在不同情境中保留了多种回应方式。', evidence_question_ids: [eid(1)] },
            ],
          }) } }],
        }),
      } as Response;
    }) as typeof fetch;

    const insight = await new ThemeInsightGeneratorService().generateInsight('emotion', result, [], []);
    expect(callCount).toBe(1);
    expect(insight).not.toBeNull();
    expect(insight!.paragraphs).toHaveLength(1);
  });

  it('returns null on timeout', async () => {
    process.env.LLM_BASE_URL = 'https://api.example.com/v1';
    process.env.LLM_API_KEY = 'test-key';
    process.env.LLM_MODEL = 'test-model';
    process.env.THEME_AI_TIMEOUT_MS = '100';
    global.fetch = vi.fn(async (_url, init) => {
      const signal = init?.signal;
      if (signal) {
        const err = new Error('aborted');
        err.name = 'AbortError';
        throw err;
      }
      return { ok: true, json: async () => ({}) } as Response;
    }) as typeof fetch;

    await expect(new ThemeInsightGeneratorService().generateInsight('emotion', result, [], [])).resolves.toBeNull();
  });

  it('sends result evidence and prior round summaries in request body', async () => {
    process.env.LLM_BASE_URL = 'https://api.example.com/v1';
    process.env.LLM_API_KEY = 'test-key';
    process.env.LLM_MODEL = 'test-model';
    process.env.THEME_AI_TIMEOUT_MS = '5000';
    let capturedBody = '';
    global.fetch = vi.fn(async (_url, init) => {
      capturedBody = String(init?.body ?? '');
      return { ok: true, json: async () => ({ choices: [{ message: { content: validInsightJson } }] }) } as Response;
    }) as typeof fetch;

    const prior = [{ dominant_approach: 'protect' as const, approach_counts: { approach: 1, protect: 3, analyze: 1, withdraw: 1 }, observation_focuses: ['trigger'] }];
    await new ThemeInsightGeneratorService().generateInsight('emotion', result, prior, []);

    expect(capturedBody).toContain('emotion');
    expect(capturedBody).toContain('protect');
    expect(capturedBody).toContain('evidence');
  });
});