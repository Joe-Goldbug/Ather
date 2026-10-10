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

/**
 * Provider chain for theme-assessment AI (question generation + insight).
 * Primary: THEME_AI_BASE_URL/API_KEY/MODEL (all three must be set).
 * Fallback: the global runtime config — so a primary outage degrades to the
 * previous provider instead of disabling personalization.
 */
export function resolveThemeLlmProviders(): LlmRuntimeConfig[] {
  const global = resolveLlmRuntimeConfig();
  const themeBase = process.env.THEME_AI_BASE_URL?.trim();
  const themeKey = process.env.THEME_AI_API_KEY?.trim();
  const themeModel = process.env.THEME_AI_MODEL?.trim();
  const providers: LlmRuntimeConfig[] = [];
  if (themeBase && themeKey && themeModel) {
    providers.push({
      baseUrl: themeBase,
      apiKey: themeKey,
      model: themeModel,
      explicitPath: process.env.THEME_AI_CHAT_COMPLETIONS_PATH?.trim() || undefined,
    });
  }
  const sameAsPrimary = providers.some(
    (p) => p.baseUrl === global.baseUrl && p.model === global.model,
  );
  if (!sameAsPrimary && global.apiKey) providers.push(global);
  return providers;
}
