// [S1-active] Feature flags for gradual rollout and backward compatibility

/**
 * [S1] When enabled, uses the new four-factor confidence engine.
 * When disabled, falls back to the old weighted-average aggregator.
 *
 * Env var: EVA_STRUCTURED_REFLECTION_V1
 * Default: disabled (false) — must be explicitly set to '1' to enable
 */
export const EVA_STRUCTURED_REFLECTION_V1: boolean =
  process.env.EVA_STRUCTURED_REFLECTION_V1 === '1';

/**
 * [S1] When enabled, the /chat/send endpoint is active.
 * When disabled, /chat/send returns 410 Gone (read-only archive).
 *
 * Env var: EVA_LEGACY_CHAT_ENABLED
 * Default:
 *   - if explicitly set: '1' => enabled, '0' => disabled
 *   - if omitted while S1 is on: disabled (safer default for the current product)
 *   - if omitted while S1 is off: enabled (legacy compatibility)
 */
export const EVA_LEGACY_CHAT_ENABLED: boolean =
  process.env.EVA_LEGACY_CHAT_ENABLED === '1'
    ? true
    : process.env.EVA_LEGACY_CHAT_ENABLED === '0'
      ? false
      : !EVA_STRUCTURED_REFLECTION_V1;

/**
 * When enabled, the second+ round of a theme assessment uses LLM-generated
 * personalized question prompts based on prior round results and recent
 * diary entries. Falls back to the static question bank on any failure.
 *
 * Env var: EVA_THEME_AI_PERSONALIZATION
 * Default: disabled (false) — must be explicitly set to '1' to enable
 */
export const EVA_THEME_AI_PERSONALIZATION: boolean =
  process.env.EVA_THEME_AI_PERSONALIZATION === '1';

/**
 * When enabled, complete() generates an ai_insight section in the result
 * revision, providing AI-analyzed observations that reference evidence.
 * Falls back to template copy on any failure.
 *
 * Env var: EVA_THEME_AI_INSIGHT
 * Default: disabled (false) — must be explicitly set to '1' to enable
 */
export const EVA_THEME_AI_INSIGHT: boolean =
  process.env.EVA_THEME_AI_INSIGHT === '1';
