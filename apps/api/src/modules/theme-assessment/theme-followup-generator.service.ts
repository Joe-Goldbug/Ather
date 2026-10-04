import { Injectable } from '@nestjs/common';
import type { ThemeQuestion, ThemeRoundAnswer } from '@ather/core';

const FORBIDDEN_FOLLOWUP_LANGUAGE =
  /人格|人格类型|诊断|神经|迷走|潜意识|治疗|抑郁|焦虑|personality|diagnos|polyvagal/i;

type ProviderReply = { prompt?: unknown; options?: unknown };

function sanitizeUserContext(value?: string): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed) return undefined;
  return trimmed
    .slice(0, 240)
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, '[邮箱已隐藏]')
    .replace(/https?:\/\/\S+/gi, '[链接已隐藏]')
    .replace(/\+?\d[\d\s()-]{7,}\d/g, '[号码已隐藏]');
}

/**
 * Optional provider adapter for one bounded follow-up question. The fallback
 * question remains the authority: a provider may only rephrase its scene and
 * option copy, never add a score, claim, evidence source, or new question role.
 */
@Injectable()
export class ThemeFollowupGeneratorService {
  async rephrase(
    fallback: ThemeQuestion,
    priorAnswers: ThemeRoundAnswer[]
  ): Promise<ThemeQuestion> {
    const baseUrl = process.env.LLM_BASE_URL?.trim();
    const apiKey = process.env.LLM_API_KEY?.trim();
    const model = process.env.LLM_MODEL?.trim();
    const timeoutMs = Number(process.env.THEME_FOLLOWUP_TIMEOUT_MS);
    if (!baseUrl || !apiKey || !model || !Number.isFinite(timeoutMs) || timeoutMs <= 0)
      return fallback;

    const answerSummary = priorAnswers.map((answer) => ({
      question_id: answer.question_id,
      choice_id: answer.choice_id,
      user_context: sanitizeUserContext(answer.free_text),
    }));
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(`${baseUrl.replace(/\/$/, '')}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
        signal: controller.signal,
        body: JSON.stringify({
          model,
          temperature: 0.2,
          messages: [
            {
              role: 'system',
              content:
                'Return JSON only: {"prompt":"...","options":["...","...","...","..."]}. Write one concrete follow-up situation. Do not diagnose, score, explain personality, infer causes, mention neural states, or use identity labels. The four options must remain equally plausible actions.',
            },
            {
              role: 'user',
              content: JSON.stringify({
                theme: fallback.theme_lens,
                role: fallback.role,
                fallback_prompt: fallback.prompt,
                parent_question_id: fallback.parent_question_id,
                current_round_answers: answerSummary,
              }),
            },
          ],
        }),
      });
      if (!response.ok) return fallback;
      const body = (await response.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      const content = body.choices?.[0]?.message?.content?.trim();
      if (!content) return fallback;
      const match = content.match(/\{[\s\S]*\}/);
      if (!match) return fallback;
      const candidate = JSON.parse(match[0]) as ProviderReply;
      if (
        typeof candidate.prompt !== 'string' ||
        !Array.isArray(candidate.options) ||
        candidate.options.length !== 4
      )
        return fallback;
      const options = candidate.options.every(
        (option) => typeof option === 'string' && option.length > 4 && option.length <= 160
      )
        ? (candidate.options as string[])
        : null;
      if (!options || candidate.prompt.length < 12 || candidate.prompt.length > 300)
        return fallback;
      if (
        FORBIDDEN_FOLLOWUP_LANGUAGE.test(candidate.prompt) ||
        options.some((option) => FORBIDDEN_FOLLOWUP_LANGUAGE.test(option))
      )
        return fallback;
      return {
        ...fallback,
        prompt: candidate.prompt,
        options: fallback.options.map((option, index) => ({ ...option, text: options[index]! })),
      };
    } catch {
      return fallback;
    } finally {
      clearTimeout(timeout);
    }
  }
}
