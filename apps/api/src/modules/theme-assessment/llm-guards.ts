/**
 * Shared LLM guardrails for theme-assessment AI integration.
 * Extracted from theme-followup-generator.service.ts so both the
 * question generator and insight generator enforce the same boundary.
 */

/** Forbidden language — product science boundary. AI output must not contain
 *  diagnostic, personality-type, or clinical terms. */
export const FORBIDDEN_THEME_LANGUAGE =
  /人格|人格类型|诊断|神经|迷走|潜意识|治疗|抑郁|焦虑|personality|diagnos|polyvagal/i;

/** Sanitize user-provided context before sending to LLM: strip PII, cap length. */
export function sanitizeUserContext(value?: string): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed) return undefined;
  return trimmed
    .slice(0, 240)
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, '[邮箱已隐藏]')
    .replace(/https?:\/\/\S+/gi, '[链接已隐藏]')
    .replace(/\+?\d[\d\s()-]{7,}\d/g, '[号码已隐藏]');
}