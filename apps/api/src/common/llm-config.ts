export interface LlmRuntimeConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
  explicitPath?: string;
}

function firstNonEmpty(...values: Array<string | undefined>): string | undefined {
  for (const value of values) {
    if (typeof value === 'string' && value.trim().length > 0) {
      return value.trim();
    }
  }
  return undefined;
}

export function resolveLlmRuntimeConfig(): LlmRuntimeConfig {
  return {
    baseUrl: firstNonEmpty(
      process.env.OPENAI_BASE_URL,
      process.env.LLM_BASE_URL,
      'https://api.openai.com/v1',
    )!,
    apiKey: firstNonEmpty(process.env.OPENAI_API_KEY, process.env.LLM_API_KEY, '') ?? '',
    model: firstNonEmpty(process.env.OPENAI_MODEL, process.env.LLM_MODEL, 'deepseek-v4-flash')!,
    explicitPath: firstNonEmpty(
      process.env.OPENAI_CHAT_COMPLETIONS_PATH,
      process.env.LLM_CHAT_COMPLETIONS_PATH,
    ),
  };
}
