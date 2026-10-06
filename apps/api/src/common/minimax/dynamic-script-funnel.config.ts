// apps/api/src/common/minimax/dynamic-script-funnel.config.ts
//
// Dynamic-Script Funnel Config Builder
//
// [Fix review-9] Reuses the existing `apps/api/src/common/llm-funnel.ts` rather
// than building a parallel MiniMax client. The funnel already supports the
// MiniMax model family (detectModelFamily returns 'minimax' for MiniMax-*
// model names), provides retry/timeout/postprocessing layers, and matches
// the rest of EVA's LLM plumbing.
//
// What this module adds:
//   - Reads DYNAMIC_SCRIPT_* env vars and returns a FunnelConfig for the
//     dynamic-script feature to pass to funnel().
//   - Exposes callM3Json / callM27Json wrappers that funnel() once and
//     decode JSON, handling code-fenced bodies.
//
// Runtime uses the real MiniMax-M3 / MiniMax-M2.7 endpoints. Tests stay
// hermetic by mocking funnel() or injecting env via the constructor's
// `env` parameter.

import type { FunnelConfig } from '../llm-funnel.js';

function firstNonEmpty(...values: Array<string | undefined>): string | undefined {
  for (const v of values) if (typeof v === 'string' && v.trim()) return v.trim();
  return undefined;
}

/**
 * Reads DYNAMIC_SCRIPT_* env vars and exposes two FunnelConfig objects:
 *   - M3  → used for empathic inquiry + script generation (higher quality)
 *   - M27 → used for parallel validation agents (cheaper / faster)
 *
 * Both configs share the same baseUrl / apiKey / timeoutMs / maxRetries /
 * maxOutputChars settings and differ only in `.model`. Throws on construction
 * if DYNAMIC_SCRIPT_API_KEY is missing — fail fast rather than discovering
 * the missing key inside a queued job.
 */
export class DynamicScriptFunnelConfig {
  readonly M3: FunnelConfig;
  readonly M27: FunnelConfig;

  constructor(env: NodeJS.ProcessEnv = process.env) {
    const apiKey = firstNonEmpty(env.DYNAMIC_SCRIPT_API_KEY);
    if (!apiKey) {
      throw new Error(
        'DYNAMIC_SCRIPT_API_KEY is not configured (required for dynamic-script feature)',
      );
    }
    const apiBase = firstNonEmpty(env.DYNAMIC_SCRIPT_API_BASE, 'https://api.minimaxi.com')!;
    const timeoutMs = parseInt(
      firstNonEmpty(env.DYNAMIC_SCRIPT_GENERATION_TIMEOUT_MS, '30000')!,
      10,
    );
    const m3Model = firstNonEmpty(env.DYNAMIC_SCRIPT_MINIMAX_M3_MODEL, 'MiniMax-M3')!;
    const m27Model = firstNonEmpty(env.DYNAMIC_SCRIPT_MINIMAX_M27_MODEL, 'MiniMax-M2.7')!;

    const baseConfig: Omit<FunnelConfig, 'model'> = {
      baseUrl: apiBase,
      apiKey,
      timeoutMs,
      maxRetries: 2,
      maxOutputChars: 4096,
      // MiniMax exposes an OpenAI-compatible chat-completions endpoint at
      // `/v1/chat/completions` per their 2026 docs. Read it from the same
      // env var the rest of the project uses so config stays in one place.
      explicitPath: firstNonEmpty(env.OPENAI_CHAT_COMPLETIONS_PATH, '/v1/chat/completions'),
    };

    this.M3 = { ...baseConfig, model: m3Model };
    this.M27 = { ...baseConfig, model: m27Model };
  }
}

/**
 * Convenience: call funnel() for an M3 turn and return the parsed JSON.
 * The dynamic-script feature owns the JSON contract; this wrapper only
 * handles funnel plumbing. Throws on empty or non-JSON content with a
 * helpful error (including a 200-char preview of what came back).
 */
export async function callM3Json<T>(
  config: DynamicScriptFunnelConfig,
  system: string,
  userMessage: string,
): Promise<T> {
  const { funnel } = await import('../llm-funnel.js');
  const result = await funnel(
    {
      system,
      messages: [{ role: 'user', content: userMessage }],
      temperature: 0.7,
      max_tokens: 1024,
    },
    { config: config.M3, locale: 'zh-CN' },
  );
  return parseJsonContent<T>('M3', result.content);
}

/**
 * Convenience: call funnel() for an M2.7 turn and return the parsed JSON.
 * Used by the 4 parallel validation agents (cheaper/faster model).
 */
export async function callM27Json<T>(
  config: DynamicScriptFunnelConfig,
  system: string,
  userMessage: string,
): Promise<T> {
  const { funnel } = await import('../llm-funnel.js');
  const result = await funnel(
    {
      system,
      messages: [{ role: 'user', content: userMessage }],
      temperature: 0.2,
      max_tokens: 512,
    },
    { config: config.M27, locale: 'zh-CN' },
  );
  return parseJsonContent<T>('M2.7', result.content);
}

/**
 * Convenience: call funnel() for an M2.7 turn with conversational settings
 * (higher temperature, more tokens) for the multi-turn inquiry dialogue.
 * [user decision 2026-07-26] Dialogue = M2.7 (cheaper/faster), script
 * generation = M3. Validation = callM27Json (cheaper deterministic).
 */
export async function callM27Conversational<T>(
  config: DynamicScriptFunnelConfig,
  system: string,
  userMessage: string,
): Promise<T> {
  const { funnel } = await import('../llm-funnel.js');
  const result = await funnel(
    {
      system,
      messages: [{ role: 'user', content: userMessage }],
      temperature: 0.7,
      max_tokens: 1024,
    },
    { config: config.M27, locale: 'zh-CN' },
  );
  return parseJsonContent<T>('M2.7', result.content);
}

/**
 * Parse JSON from a funnel result, tolerating code-fenced bodies
 * (```json ... ``` or ``` ... ```). Throws a clear error on empty or
 * non-JSON content so callers don't silently swallow malformed LLM output.
 */
function parseJsonContent<T>(modelLabel: string, content: string | undefined): T {
  if (!content) {
    throw new Error(`${modelLabel} returned empty content`);
  }
  // Fast path: raw JSON
  try {
    return JSON.parse(content) as T;
  } catch {
    // Code-fenced fallback: ```json\n{...}\n``` or ```\n{...}\n```
    const m = content.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (m) {
      try {
        return JSON.parse(m[1]) as T;
      } catch (err) {
        throw new Error(
          `${modelLabel} returned malformed code-fenced JSON: ${(err as Error).message} — body preview: ${content.slice(0, 200)}`,
        );
      }
    }
    throw new Error(
      `${modelLabel} returned non-JSON content: ${content.slice(0, 200)}`,
    );
  }
}