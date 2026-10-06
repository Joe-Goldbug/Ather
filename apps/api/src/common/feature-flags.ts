// [S1-active] Feature flags for gradual rollout and backward compatibility

/**
 * [S1] When enabled, uses the new four-factor confidence engine.
 * When disabled, falls back to the old weighted-average aggregator.
 *
 * Env var: EVA_STRUCTURED_REFLECTION_V1 / ATHER_STRUCTURED_REFLECTION_V1
 * Default: disabled (false) — must be explicitly set to '1' to enable
 */
export const EVA_STRUCTURED_REFLECTION_V1: boolean =
  process.env.EVA_STRUCTURED_REFLECTION_V1 === '1' ||
  process.env.ATHER_STRUCTURED_REFLECTION_V1 === '1';
export const ATHER_STRUCTURED_REFLECTION_V1 = EVA_STRUCTURED_REFLECTION_V1;

/**
 * [S1] When enabled, the /chat/send endpoint is active.
 * When disabled, /chat/send returns 410 Gone (read-only archive).
 *
 * Env var: EVA_LEGACY_CHAT_ENABLED / ATHER_LEGACY_CHAT_ENABLED
 * Default:
 *   - if explicitly set: '1' => enabled, '0' => disabled
 *   - if omitted while S1 is on: disabled (safer default for the current product)
 *   - if omitted while S1 is off: enabled (legacy compatibility)
 */
const legacyChatEnv = process.env.EVA_LEGACY_CHAT_ENABLED ?? process.env.ATHER_LEGACY_CHAT_ENABLED;
export const EVA_LEGACY_CHAT_ENABLED: boolean =
  legacyChatEnv === '1'
    ? true
    : legacyChatEnv === '0'
      ? false
      : !EVA_STRUCTURED_REFLECTION_V1;
export const ATHER_LEGACY_CHAT_ENABLED = EVA_LEGACY_CHAT_ENABLED;
