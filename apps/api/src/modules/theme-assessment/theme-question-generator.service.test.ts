import { ThemeQuestionGeneratorService } from './theme-question-generator.service.js';

const validPromptsJson = JSON.stringify({
  prompts: [
    { focus_key: 'trigger', prompt: '你正在埋头赶一个重要的方案，同事突然走过来说了句让你不舒服的话。' },
    { focus_key: 'expression', prompt: '开会时你发现领导误解了你的意思，会议还在继续。' },
    { focus_key: 'regulation', prompt: '你期待很久的旅行因为天气临时取消，今晚原本要出发。' },
    { focus_key: 'recovery', prompt: '一场激烈的争论结束后，你独自回到工位坐下。' },
    { focus_key: 'self_blame', prompt: '你发现一个团队失误其实和你上周的一个小决定有关。' },
    { focus_key: 'help_seeking', prompt: '你状态很差已经好几天了，一个你信任的人恰好问起你。' },
  ],
});

describe('ThemeQuestionGeneratorService', () => {
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

  const input = {
    theme_lens: 'emotion' as const,
    prior_rounds: [
      {
        dominant_approach: 'protect',
        approach_counts: { approach: 1, protect: 3, analyze: 1, withdraw: 1 },
        observation_focuses: ['trigger', 'expression', 'regulation'],
      },
    ],
    diary_digest: [
      { entry_type: 'emotion_log', mood_label: '焦虑', text: '今天被领导批评了方案。', captured_at: '2026-10-08T10:00:00Z' },
    ],
    used_focus_contexts: ['trigger.daily', 'expression.daily'],
  };

  it('returns null when provider configuration is incomplete', async () => {
    delete process.env.LLM_BASE_URL;
    delete process.env.LLM_API_KEY;
    delete process.env.LLM_MODEL;
    const svc = new ThemeQuestionGeneratorService();
    await expect(svc.generateCoreQuestions(input)).resolves.toBeNull();
  });

  it('returns a Map of focus_key → prompt on valid JSON response', async () => {
    process.env.LLM_BASE_URL = 'https://api.example.com/v1';
    process.env.LLM_API_KEY = 'test-key';
    process.env.LLM_MODEL = 'test-model';
    process.env.THEME_AI_TIMEOUT_MS = '5000';
    global.fetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: '```json\n' + validPromptsJson + '\n```' } }],
      }),
    }) as typeof fetch);

    const result = await new ThemeQuestionGeneratorService().generateCoreQuestions(input);
    expect(result).toBeInstanceOf(Map);
    expect(result!.size).toBe(6);
    expect(result!.get('trigger')).toContain('不舒服的话');
    // Each prompt should be a non-empty string
    for (const [, prompt] of result!) {
      expect(typeof prompt).toBe('string');
      expect(prompt.length).toBeGreaterThan(10);
      expect(prompt.length).toBeLessThan(300);
    }
  });

  it('strips ```json fence before parsing', async () => {
    process.env.LLM_BASE_URL = 'https://api.example.com/v1';
    process.env.LLM_API_KEY = 'test-key';
    process.env.LLM_MODEL = 'test-model';
    process.env.THEME_AI_TIMEOUT_MS = '5000';
    global.fetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: validPromptsJson } }],
      }),
    }) as typeof fetch);

    const result = await new ThemeQuestionGeneratorService().generateCoreQuestions(input);
    expect(result).not.toBeNull();
    expect(result!.size).toBe(6);
  });

  it('returns null when HTTP response is not ok', async () => {
    process.env.LLM_BASE_URL = 'https://api.example.com/v1';
    process.env.LLM_API_KEY = 'test-key';
    process.env.LLM_MODEL = 'test-model';
    process.env.THEME_AI_TIMEOUT_MS = '5000';
    global.fetch = vi.fn(async () => ({
      ok: false,
      status: 500,
      json: async () => ({}),
    }) as typeof fetch);

    await expect(new ThemeQuestionGeneratorService().generateCoreQuestions(input)).resolves.toBeNull();
  });

  it('returns null when response has no parseable JSON', async () => {
    process.env.LLM_BASE_URL = 'https://api.example.com/v1';
    process.env.LLM_API_KEY = 'test-key';
    process.env.LLM_MODEL = 'test-model';
    process.env.THEME_AI_TIMEOUT_MS = '5000';
    global.fetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: '抱歉，我无法生成题目。' } }],
      }),
    }) as typeof fetch);

    await expect(new ThemeQuestionGeneratorService().generateCoreQuestions(input)).resolves.toBeNull();
  });

  it('skips prompts that contain forbidden language', async () => {
    process.env.LLM_BASE_URL = 'https://api.example.com/v1';
    process.env.LLM_API_KEY = 'test-key';
    process.env.LLM_MODEL = 'test-model';
    process.env.THEME_AI_TIMEOUT_MS = '5000';
    global.fetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: JSON.stringify({
          prompts: [
            { focus_key: 'trigger', prompt: '这可能是焦虑症的表现，你突然感到不舒服。' },
            { focus_key: 'expression', prompt: '开会时你发现领导误解了你的意思。' },
            { focus_key: 'regulation', prompt: '你期待很久的旅行临时取消。' },
            { focus_key: 'recovery', prompt: '一场争论结束后你独自坐下。' },
            { focus_key: 'self_blame', prompt: '你发现一个团队失误和你有关。' },
            { focus_key: 'help_seeking', prompt: '你状态很差，有人问起你。' },
          ],
        }) }}],
      }),
    }) as typeof fetch);

    const result = await new ThemeQuestionGeneratorService().generateCoreQuestions(input);
    expect(result).not.toBeNull();
    // 'trigger' had forbidden word '焦虑' → excluded
    expect(result!.has('trigger')).toBe(false);
    expect(result!.size).toBe(5);
  });

  it('skips prompts that are too short or too long', async () => {
    process.env.LLM_BASE_URL = 'https://api.example.com/v1';
    process.env.LLM_API_KEY = 'test-key';
    process.env.LLM_MODEL = 'test-model';
    process.env.THEME_AI_TIMEOUT_MS = '5000';
    global.fetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: JSON.stringify({
          prompts: [
            { focus_key: 'trigger', prompt: '太短' },
            { focus_key: 'expression', prompt: '开会时你发现领导误解了你的意思。' },
            { focus_key: 'regulation', prompt: '你期待很久的旅行临时取消。' },
            { focus_key: 'recovery', prompt: '一场争论结束后你独自坐下。' },
            { focus_key: 'self_blame', prompt: '你发现一个团队失误和你有关。' },
            { focus_key: 'help_seeking', prompt: '你状态很差，有人问起你。' },
          ],
        }) }}],
      }),
    }) as typeof fetch);

    const result = await new ThemeQuestionGeneratorService().generateCoreQuestions(input);
    expect(result).not.toBeNull();
    expect(result!.has('trigger')).toBe(false);
    expect(result!.size).toBe(5);
  });

  it('sends theme, prior rounds and diary digest in the request body', async () => {
    process.env.LLM_BASE_URL = 'https://api.example.com/v1';
    process.env.LLM_API_KEY = 'test-key';
    process.env.LLM_MODEL = 'test-model';
    process.env.THEME_AI_TIMEOUT_MS = '5000';
    let capturedBody = '';
    global.fetch = vi.fn(async (_url, init) => {
      capturedBody = String(init?.body ?? '');
      return {
        ok: true,
        json: async () => ({
          choices: [{ message: { content: validPromptsJson } }],
        }),
      } as Response;
    }) as typeof fetch;

    await new ThemeQuestionGeneratorService().generateCoreQuestions(input);

    expect(capturedBody).toContain('emotion');
    expect(capturedBody).toContain('protect');
    expect(capturedBody).toContain('焦虑');
  });

  it('returns null on abort/timeout', async () => {
    process.env.LLM_BASE_URL = 'https://api.example.com/v1';
    process.env.LLM_API_KEY = 'test-key';
    process.env.LLM_MODEL = 'test-model';
    process.env.THEME_AI_TIMEOUT_MS = '100';
    global.fetch = vi.fn(async (_url, init) => {
      const signal = init?.signal;
      if (signal) {
        const err = new Error('The operation was aborted');
        err.name = 'AbortError';
        throw err;
      }
      return { ok: true, json: async () => ({}) } as Response;
    }) as typeof fetch;

    await expect(new ThemeQuestionGeneratorService().generateCoreQuestions(input)).resolves.toBeNull();
  });
});