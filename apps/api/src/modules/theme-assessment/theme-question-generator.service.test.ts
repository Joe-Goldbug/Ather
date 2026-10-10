import { ThemeQuestionGeneratorService } from './theme-question-generator.service.js';

const FOCUS_KEYS = ['trigger', 'expression', 'regulation', 'recovery', 'self_blame', 'help_seeking'];

const OPTIONS = [
  '先把感受说出来，再和对方确认一件事。',
  '先把情绪收住，观察一下现场的反应。',
  '先弄清这件事为什么会发生，再决定回应。',
  '先离开现场，等自己平静下来再说。',
];

function promptJson(entries: Array<{ focus_key: string; prompt: string; options?: string[] }>) {
  return JSON.stringify({ prompts: entries });
}

const fullValid = promptJson(FOCUS_KEYS.map((focus_key, i) => ({
  focus_key,
  prompt: `情境${i + 1}：你正在经历一件与「${focus_key}」有关的日常小事，需要决定接下来怎么做才符合你的习惯。`,
  options: OPTIONS,
})));

const partialValid = promptJson(FOCUS_KEYS.slice(0, 3).map((focus_key, i) => ({
  focus_key,
  prompt: `部分情境${i + 1}：你遇到一件与「${focus_key}」有关的突发小事，需要立刻决定怎么回应它。`,
  options: OPTIONS,
})));

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
    process.env.LLM_BASE_URL = 'https://api.example.com/v1';
    process.env.LLM_API_KEY = 'test-key';
    process.env.LLM_MODEL = 'test-model';
    process.env.THEME_AI_TIMEOUT_MS = '5000';
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
        dominant_approach: 'protect' as const,
        approach_counts: { approach: 1, protect: 3, analyze: 1, withdraw: 1 },
        observation_focuses: ['trigger', 'expression', 'regulation'],
      },
    ],
    diary_digest: [
      { entry_type: 'emotion_log', mood_label: '紧张', text: '今天被领导批评了方案。', captured_at: '2026-10-08T10:00:00Z' },
    ],
    used_focus_contexts: ['trigger.daily', 'expression.daily'],
  };

  it('returns null when provider configuration is incomplete', async () => {
    delete process.env.LLM_BASE_URL;
    delete process.env.LLM_API_KEY;
    delete process.env.LLM_MODEL;
    let calls = 0;
    global.fetch = vi.fn(async () => { calls++; return { ok: true, json: async () => ({ choices: [] }) } as Response; });
    const svc = new ThemeQuestionGeneratorService();
    await expect(svc.generateCoreQuestions(input)).resolves.toBeNull();
    expect(calls).toBe(0);
  });

  it('returns Map of focus_key → {prompt, options} on valid JSON response', async () => {
    global.fetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({ choices: [{ message: { content: '```json\n' + fullValid + '\n```' } }] }),
    }) as typeof fetch);

    const result = await new ThemeQuestionGeneratorService().generateCoreQuestions(input);
    expect(result).toBeInstanceOf(Map);
    expect(result!.size).toBe(6);
    const first = result!.get('trigger')!;
    expect(first.prompt).toContain('情境1');
    expect(first.options).toEqual(OPTIONS);
  });

  it('retries once and merges missing focus_keys when the first attempt is partial', async () => {
    let calls = 0;
    let secondSystem = '';
    global.fetch = vi.fn(async (_url, init) => {
      calls++;
      if (calls === 1) {
        return { ok: true, json: async () => ({ choices: [{ message: { content: partialValid } }] }) } as Response;
      }
      const body = JSON.parse(String(init?.body ?? '{}')) as { messages?: Array<{ content: string }> };
      secondSystem = body.messages?.[0]?.content ?? '';
      return { ok: true, json: async () => ({ choices: [{ message: { content: fullValid } }] }) } as Response;
    }) as typeof fetch;

    const result = await new ThemeQuestionGeneratorService().generateCoreQuestions(input);
    expect(calls).toBe(2);
    expect(secondSystem).toContain('焦虑');
    expect(result!.size).toBe(6);
    // First three came from attempt 1, last three filled by attempt 2.
    expect(result!.get('trigger')!.prompt).toContain('部分情境1');
    expect(result!.get('recovery')!.prompt).toContain('情境4');
  });

  it('retries once on hard failure (HTTP error) before giving up', async () => {
    let calls = 0;
    global.fetch = vi.fn(async () => {
      calls++;
      if (calls === 1) return { ok: false, status: 500, json: async () => ({}) } as Response;
      return { ok: true, json: async () => ({ choices: [{ message: { content: fullValid } }] }) } as Response;
    }) as typeof fetch;

    const result = await new ThemeQuestionGeneratorService().generateCoreQuestions(input);
    expect(calls).toBe(2);
    expect(result!.size).toBe(6);
  });

  it('returns null after both attempts fail', async () => {
    let calls = 0;
    global.fetch = vi.fn(async () => { calls++; return { ok: false, status: 500, json: async () => ({}) } as Response; }) as typeof fetch;

    await expect(new ThemeQuestionGeneratorService().generateCoreQuestions(input)).resolves.toBeNull();
    expect(calls).toBe(2);
  });

  it('keeps partial results when the retry also fails', async () => {
    let calls = 0;
    global.fetch = vi.fn(async () => {
      calls++;
      if (calls === 1) return { ok: true, json: async () => ({ choices: [{ message: { content: partialValid } }] }) } as Response;
      return { ok: false, status: 500, json: async () => ({}) } as Response;
    }) as typeof fetch;

    const result = await new ThemeQuestionGeneratorService().generateCoreQuestions(input);
    expect(calls).toBe(2);
    expect(result!.size).toBe(3);
  });

  it('drops options that are not exactly 4 usable strings, keeps the prompt', async () => {
    const badOptionsJson = promptJson([
      { focus_key: 'trigger', prompt: '你在会议上被当众指出方案里的一处数据错误，需要当场回应。', options: ['只有三个选项', '第二个', '第三个'] },
      { focus_key: 'expression', prompt: '讨论还在继续，你的观点和在场所有人都不同，需要表态。', options: OPTIONS },
    ]);
    global.fetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({ choices: [{ message: { content: badOptionsJson } }] }),
    }) as typeof fetch);

    const result = await new ThemeQuestionGeneratorService().generateCoreQuestions(input);
    expect(result!.get('trigger')!.prompt).toContain('数据错误');
    expect(result!.get('trigger')!.options).toBeUndefined();
    expect(result!.get('expression')!.options).toEqual(OPTIONS);
  });

  it('drops options containing forbidden language, keeps the prompt', async () => {
    const forbiddenOptions = promptJson([
      { focus_key: 'trigger', prompt: '你突然感到强烈的不适，需要决定接下来怎么处理它。', options: ['先承认自己焦虑发作了', '先压住情绪', '先分析原因', '先离开'] },
    ]);
    global.fetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({ choices: [{ message: { content: forbiddenOptions } }] }),
    }) as typeof fetch);

    const result = await new ThemeQuestionGeneratorService().generateCoreQuestions(input);
    expect(result!.get('trigger')!.prompt).toBeTruthy();
    expect(result!.get('trigger')!.options).toBeUndefined();
  });

  it('sends theme, focus_keys, diary digest and explicit max_tokens in the request body', async () => {
    let capturedBody = '';
    global.fetch = vi.fn(async (_url, init) => {
      capturedBody = String(init?.body ?? '');
      return { ok: true, json: async () => ({ choices: [{ message: { content: fullValid } }] }) } as Response;
    }) as typeof fetch;

    await new ThemeQuestionGeneratorService().generateCoreQuestions(input);

    const body = JSON.parse(capturedBody) as { max_tokens?: number; messages: Array<{ content: string }> };
    expect(body.max_tokens).toBeGreaterThanOrEqual(2000);
    const system = body.messages[0]!.content;
    expect(system).toContain('approach');
    expect(system).toContain('焦虑');
    expect(capturedBody).toContain('emotion');
    expect(capturedBody).toContain('protect');
    expect(capturedBody).toContain('紧张');
  });

  it('returns null on timeout', async () => {
    process.env.THEME_AI_TIMEOUT_MS = '100';
    global.fetch = vi.fn(async (_url, init) => {
      if (init?.signal) {
        const err = new Error('aborted');
        err.name = 'AbortError';
        throw err;
      }
      return { ok: true, json: async () => ({}) } as Response;
    }) as typeof fetch;

    await expect(new ThemeQuestionGeneratorService().generateCoreQuestions(input)).resolves.toBeNull();
  });
});
