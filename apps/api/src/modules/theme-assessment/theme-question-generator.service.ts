import { Injectable } from '@nestjs/common';
import { FORBIDDEN_THEME_LANGUAGE } from './llm-guards.js';
import { resolveLlmRuntimeConfig } from '../../common/llm-config.js';
import { resolveLlmChatCompletionsUrl } from '../../common/llm-endpoint.js';
import type { ThemeLens, RoundApproach } from '@eva/core';

export interface PriorRoundSummary {
  dominant_approach: RoundApproach;
  approach_counts: Record<RoundApproach, number>;
  observation_focuses: string[];
}

export interface DiaryDigestEntry {
  entry_type: string;
  mood_label?: string;
  text: string;
  captured_at: string;
}

export interface GeneratedQuestion {
  prompt: string;
  /** 4 option texts mapped in fixed order: approach / protect / analyze / withdraw.
   *  Omitted when the provider output fails validation — caller falls back to
   *  the static option copy for that question. */
  options?: string[];
}

export type CoreQuestionInput = {
  theme_lens: ThemeLens;
  prior_rounds: PriorRoundSummary[];
  diary_digest: DiaryDigestEntry[];
  used_focus_contexts: string[];
};

const VALID_FOCUS_KEYS: Record<ThemeLens, string[]> = {
  emotion: ['trigger', 'expression', 'regulation', 'recovery', 'self_blame', 'help_seeking'],
  relationship: ['closeness', 'trust', 'boundary', 'conflict', 'repair', 'uncertainty'],
  social: ['initiation', 'group_position', 'rejection', 'energy', 'self_disclosure', 'recovery'],
  workplace: ['feedback', 'disagreement', 'deadline', 'responsibility', 'collaboration', 'recognition'],
  self_evaluation: ['standards', 'error_attribution', 'comparison', 'praise', 'uncertainty', 'failure_recovery'],
};

const MIN_PROMPT_LEN = 12;
const MAX_PROMPT_LEN = 300;
const MAX_TOKENS = 2000;
const MAX_ATTEMPTS = 2;

const BASE_SYSTEM_PROMPT =
  'Return JSON only: {"prompts":[{"focus_key":"...","prompt":"...","options":["...","...","...","..."]}]}' +
  ' with exactly one entry per focus_key (six entries total).' +
  ' Write concrete everyday-life situational prompts in Chinese, 12-300 chars each.' +
  ' For each prompt write exactly 4 option texts in Chinese (4-160 chars each),' +
  ' one per coping style, IN THIS FIXED ORDER: 1=approach (move toward/express),' +
  ' 2=protect (guard boundaries/withhold), 3=analyze (understand first),' +
  ' 4=withdraw (pause/pull back). The four options must remain equally plausible actions;' +
  ' never make one option obviously better.' +
  ' BANNED WORDS (never use, in any form): 人格, 人格类型, 诊断, 神经, 迷走, 潜意识, 治疗, 抑郁, 焦虑,' +
  ' personality, diagnos, polyvagal. Describe states in everyday language instead.';

/** Added on the retry pass when the first attempt missed some focus_keys. */
const RETRY_REMINDER =
  ' IMPORTANT: your previous attempt missed some focus_keys or used banned vocabulary.' +
  ' Output ALL six entries, one per focus_key, and avoid the banned words listed above.';

type RawGeneratedPrompt = { focus_key?: unknown; prompt?: unknown; options?: unknown };

@Injectable()
export class ThemeQuestionGeneratorService {
  async generateCoreQuestions(input: CoreQuestionInput): Promise<Map<string, GeneratedQuestion> | null> {
    const { baseUrl, apiKey, model, explicitPath } = resolveLlmRuntimeConfig();
    if (!apiKey) return null;

    const timeoutMs = Number(process.env.THEME_AI_TIMEOUT_MS);
    if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) return null;

    const validKeys = VALID_FOCUS_KEYS[input.theme_lens] ?? [];
    if (validKeys.length === 0) return null;
    const validKeySet = new Set(validKeys);
    const userPayload = JSON.stringify({
      theme: input.theme_lens,
      focus_keys: validKeys,
      prior_rounds: input.prior_rounds,
      diary_digest: input.diary_digest,
      used_focus_contexts: input.used_focus_contexts,
    });

    // Attempt 1; then one retry that fills whatever is still missing.
    // A hard failure (null) on attempt 1 is retried too — a single network
    // blip must not silently downgrade the whole round to static (observed
    // in production as generated_count: 0).
    const merged = new Map<string, GeneratedQuestion>();
    for (let attemptNo = 1; attemptNo <= MAX_ATTEMPTS; attemptNo++) {
      const result = await this.attempt(
        baseUrl, apiKey, model, explicitPath, timeoutMs,
        attemptNo > 1, userPayload, validKeySet,
      );
      if (result) {
        for (const [key, value] of result) {
          if (!merged.has(key)) merged.set(key, value);
        }
      }
      if (merged.size >= validKeys.length) break;
    }

    if (merged.size === 0) return null;
    return merged;
  }

  /** Single provider attempt. Returns validated entries keyed by focus_key, or
   *  null on a hard failure (config/HTTP/parse/timeout). An empty map means the
   *  response arrived but nothing passed validation. */
  private async attempt(
    baseUrl: string,
    apiKey: string,
    model: string,
    explicitPath: string | undefined,
    timeoutMs: number,
    strict: boolean,
    userPayload: string,
    validKeySet: Set<string>,
  ): Promise<Map<string, GeneratedQuestion> | null> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const url = resolveLlmChatCompletionsUrl(baseUrl, explicitPath);
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
        signal: controller.signal,
        body: JSON.stringify({
          model,
          temperature: 0.3,
          max_tokens: MAX_TOKENS,
          messages: [
            { role: 'system', content: BASE_SYSTEM_PROMPT + (strict ? RETRY_REMINDER : '') },
            { role: 'user', content: userPayload },
          ],
        }),
      });

      if (!response.ok) return null;

      const body = (await response.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      const content = body.choices?.[0]?.message?.content?.trim();
      if (!content) return null;

      const match = content.match(/\{[\s\S]*\}/);
      if (!match) return null;

      const parsed = JSON.parse(match[0]) as { prompts?: unknown };
      if (!Array.isArray(parsed.prompts)) return null;

      const result = new Map<string, GeneratedQuestion>();
      for (const item of parsed.prompts) {
        const entry = item as RawGeneratedPrompt;
        const focusKey = typeof entry.focus_key === 'string' ? entry.focus_key : '';
        const promptText = typeof entry.prompt === 'string' ? entry.prompt : '';
        if (!validKeySet.has(focusKey) || result.has(focusKey)) continue;
        if (promptText.length < MIN_PROMPT_LEN || promptText.length > MAX_PROMPT_LEN) continue;
        if (FORBIDDEN_THEME_LANGUAGE.test(promptText)) continue;

        const entryOut: GeneratedQuestion = { prompt: promptText };
        const options = this.validateOptions(entry.options);
        if (options) entryOut.options = options;
        result.set(focusKey, entryOut);
      }
      return result;
    } catch {
      return null;
    } finally {
      clearTimeout(timeout);
    }
  }

  /** 4 strings, each 4-160 chars, none hitting the forbidden-language guard. */
  private validateOptions(raw: unknown): string[] | undefined {
    if (!Array.isArray(raw) || raw.length !== 4) return undefined;
    const options: string[] = [];
    for (const item of raw) {
      if (typeof item !== 'string') return undefined;
      const text = item.trim();
      if (text.length < 4 || text.length > 160) return undefined;
      if (FORBIDDEN_THEME_LANGUAGE.test(text)) return undefined;
      options.push(text);
    }
    return options;
  }
}
