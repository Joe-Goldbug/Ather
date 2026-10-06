import { resolveLlmRuntimeConfig } from './llm-config.js';

const ENV_KEYS = [
  'OPENAI_BASE_URL',
  'OPENAI_API_KEY',
  'OPENAI_MODEL',
  'OPENAI_CHAT_COMPLETIONS_PATH',
  'LLM_BASE_URL',
  'LLM_API_KEY',
  'LLM_MODEL',
  'LLM_CHAT_COMPLETIONS_PATH',
] as const;

describe('resolveLlmRuntimeConfig', () => {
  const originalEnv = new Map<string, string | undefined>();

  beforeEach(() => {
    for (const key of ENV_KEYS) {
      originalEnv.set(key, process.env[key]);
      delete process.env[key];
    }
  });

  afterEach(() => {
    for (const key of ENV_KEYS) {
      const original = originalEnv.get(key);
      if (original === undefined) delete process.env[key];
      else process.env[key] = original;
    }
    originalEnv.clear();
  });

  it('uses OPENAI variables for an OpenAI-compatible provider', () => {
    process.env.OPENAI_BASE_URL = 'https://api.deepseek.com/v1';
    process.env.OPENAI_API_KEY = 'test-key';
    process.env.OPENAI_MODEL = 'deepseek-v4-flash';

    expect(resolveLlmRuntimeConfig()).toEqual({
      baseUrl: 'https://api.deepseek.com/v1',
      apiKey: 'test-key',
      model: 'deepseek-v4-flash',
      explicitPath: undefined,
    });
  });

  it('prefers OPENAI variables when both naming schemes exist', () => {
    process.env.OPENAI_BASE_URL = 'https://new.example/v1';
    process.env.OPENAI_API_KEY = 'new-key';
    process.env.OPENAI_MODEL = 'new-model';
    process.env.LLM_BASE_URL = 'https://old.example/v1';
    process.env.LLM_API_KEY = 'old-key';
    process.env.LLM_MODEL = 'old-model';

    expect(resolveLlmRuntimeConfig()).toMatchObject({
      baseUrl: 'https://new.example/v1',
      apiKey: 'new-key',
      model: 'new-model',
    });
  });

  it('keeps LLM variables as backward-compatible fallbacks', () => {
    process.env.LLM_BASE_URL = 'https://legacy.example/v1';
    process.env.LLM_API_KEY = 'legacy-key';
    process.env.LLM_MODEL = 'legacy-model';

    expect(resolveLlmRuntimeConfig()).toMatchObject({
      baseUrl: 'https://legacy.example/v1',
      apiKey: 'legacy-key',
      model: 'legacy-model',
    });
  });
});
