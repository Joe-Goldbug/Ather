import { Injectable } from '@nestjs/common';
import { FORBIDDEN_THEME_LANGUAGE, sanitizeUserContext } from './llm-guards.js';
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

export interface CoreQuestionInput {
  theme_lens: ThemeLens;
  prior_rounds: PriorRoundSummary[];
  diary_digest: DiaryDigestEntry[];
  used_focus_contexts: string[];
}

const VALID_FOCUS_KEYS: Record<ThemeLens, string[]> = {
  emotion: ['trigger', 'expression', 'regulation', 'recovery', 'self_blame', 'help_seeking'],
  relationship: ['closeness', 'trust', 'boundary', 'conflict', 'repair', 'uncertainty'],
  social: ['initiation', 'group_position', 'rejection', 'energy', 'self_disclosure', 'recovery'],
  workplace: ['feedback', 'disagreement', 'deadline', 'responsibility', 'collaboration', 'recognition'],
  self_evaluation: ['standards', 'error_attribution', 'comparison', 'praise', 'uncertainty', 'failure_recovery'],
};

const MIN_PROMPT_LEN = 12;
const MAX_PROMPT_LEN = 300;

type RawGeneratedPrompt = { focus_key?: unknown; prompt?: unknown };

@Injectable()
export class ThemeQuestionGeneratorService {
  async generateCoreQuestions(input: CoreQuestionInput): Promise<Map<string, string> | null> {
    const baseUrl = process.env.LLM_BASE_URL?.trim();
    const apiKey = process.env.LLM_API_KEY?.trim();
    const model = process.env.LLM_MODEL?.trim();
    if (!baseUrl || !apiKey || !model) return null;

    const timeoutMs = Number(process.env.THEME_AI_TIMEOUT_MS);
    if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) return null;

    const validKeys = new Set(VALID_FOCUS_KEYS[input.theme_lens] ?? []);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(`${baseUrl.replace(/\/$/, '')}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
        signal: controller.signal,
        body: JSON.stringify({
        model,
        temperature: 0.3,
        messages: [
          {
            role: 'system',
            content:
              'Return JSON only: {"prompts":[{"focus_key":"trigger","prompt":"..."}]}.' +
              ' Generate 6 situational test prompts, one per focus_key, in Chinese.' +
              ' Each prompt must be 12-300 chars, a concrete everyday-life situation.' +
              ' Avoid diagnostic or personality-type language.' +
              ' The four response options (approach/protect/analyze/withdraw) remain fixed.' +
              ' When prior rounds or diary entries are provided, make scenarios feel' +
              ' relevant to the user\'s recent life, while avoiding repetition of prior contexts.',
          },
          {
            role: 'user',
            content: JSON.stringify({
              theme: input.theme_lens,
              focus_keys: VALID_FOCUS_KEYS[input.theme_lens],
              prior_rounds: input.prior_rounds,
              diary_digest: input.diary_digest,
              used_focus_contexts: input.used_focus_contexts,
            }),
          },
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

      const result = new Map<string, string>();
      for (const item of parsed.prompts) {
        const entry = item as RawGeneratedPrompt;
        const focusKey = typeof entry.focus_key === 'string' ? entry.focus_key : '';
        const promptText = typeof entry.prompt === 'string' ? entry.prompt : '';
        if (!validKeys.has(focusKey)) continue;
        if (promptText.length < MIN_PROMPT_LEN || promptText.length > MAX_PROMPT_LEN) continue;
        if (FORBIDDEN_THEME_LANGUAGE.test(promptText)) continue;
        result.set(focusKey, promptText);
      }

      return result.size > 0 ? result : null;
    } catch {
      return null;
    } finally {
      clearTimeout(timeout);
    }
  }
}