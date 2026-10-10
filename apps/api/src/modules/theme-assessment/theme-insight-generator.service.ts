import { Injectable } from '@nestjs/common';
import { FORBIDDEN_THEME_LANGUAGE } from './llm-guards.js';
import { resolveThemeLlmProviders, type LlmRuntimeConfig } from '../../common/llm-config.js';
import { resolveLlmChatCompletionsUrl } from '../../common/llm-endpoint.js';
import type { ThemeLens, ThemeRoundResult } from '@eva/core';
import type { PriorRoundSummary, DiaryDigestEntry } from './theme-question-generator.service.js';

export interface AiInsightParagraph {
  text: string;
  evidence_question_ids: string[];
}

export interface AiInsight {
  source: 'ai';
  model: string;
  generated_at: string;
  disclaimer: string;
  paragraphs: AiInsightParagraph[];
}

type RawParagraph = { text?: unknown; evidence_question_ids?: unknown };

const MAX_PARAGRAPHS = 3;
const MAX_PARAGRAPH_LEN = 200;
const MIN_PARAGRAPH_LEN = 10;

const BASE_SYSTEM_PROMPT =
  'Return JSON only: {"paragraphs":[{"text":"...","evidence_question_ids":["..."]}]}.' +
  ' Write 1-3 paragraphs of situational insight in Chinese.' +
  ' Each paragraph must reference at least one evidence_question_id from the provided evidence.' +
  ' Each paragraph must be 10-200 chars.' +
  ' Do not diagnose, mention personality types, neural states, or clinical terms.' +
  ' Compare with prior rounds if available.' +
  ' Frame observations as tendencies, not permanent traits.';

/** Added only on the retry pass, when the first attempt produced no usable paragraph. */
const BANNED_WORD_REMINDER =
  ' IMPORTANT: the previous attempt used banned vocabulary. Never use these words or their' +
  ' English equivalents: 人格, 人格类型, 诊断, 神经, 迷走, 潜意识, 治疗, 抑郁, 焦虑.' +
  ' Describe states in everyday language instead.';

@Injectable()
export class ThemeInsightGeneratorService {
  async generateInsight(
    theme_lens: ThemeLens,
    result: ThemeRoundResult,
    priorRoundSummaries: PriorRoundSummary[],
    diaryDigest: DiaryDigestEntry[],
  ): Promise<AiInsight | null> {
    const providers = resolveThemeLlmProviders();
    if (providers.length === 0) return null;
    const primary = providers[0]!;

    const timeoutMs = Number(process.env.THEME_AI_TIMEOUT_MS);
    if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) return null;

    const validEvidenceIds = new Set(result.evidence.map((entry) => entry.question_id));
    const userPayload = JSON.stringify({
      theme: theme_lens,
      current_result: {
        headline: result.headline,
        summary: result.summary,
        strength: result.strength,
        watchout: result.watchout,
        evidence: result.evidence.map((entry) => ({
          question_id: entry.question_id,
          focus: entry.focus_label,
          context: entry.context_label,
          approach: entry.approach,
        })),
      },
      prior_rounds: priorRoundSummaries,
      diary_digest: diaryDigest,
    });

    const firstAttempt = await this.attempt(
      primary, timeoutMs, false, userPayload, validEvidenceIds,
    );
    // null = hard failure (config/HTTP/parse/timeout) → give up; the template copy stands.
    if (firstAttempt === null) return null;

    // Empty = content-level rejection (all paragraphs failed validation).
    // One stricter retry with an explicit banned-word reminder is worth it.
    let paragraphs = firstAttempt;
    let usedModel = primary.model;
    if (paragraphs.length === 0) {
      // 重试换 provider 链上的下一家（主题专属失败 → 全局兜底），或同一家加严格提醒
      const fallback = providers[Math.min(1, providers.length - 1)]!;
      const retry = await this.attempt(
        fallback, timeoutMs, true, userPayload, validEvidenceIds,
      );
      paragraphs = retry ?? [];
      if (paragraphs.length > 0) usedModel = fallback.model;
    }
    if (paragraphs.length === 0) return null;

    return {
      source: 'ai' as const,
      model: usedModel,
      generated_at: new Date().toISOString(),
      disclaimer: '以下洞察由 AI 基于本轮情境证据生成，非人格结论或诊断，仅供参考。如不准确可在下方反馈纠错。',
      paragraphs,
    };
  }

  /** Single provider attempt. Returns validated paragraphs, or null on a hard failure
   *  (config/HTTP/parse/timeout). An empty array means the response arrived but no
   *  paragraph passed validation. */
  private async attempt(
    provider: LlmRuntimeConfig,
    timeoutMs: number,
    strict: boolean,
    userPayload: string,
    validEvidenceIds: Set<string>,
  ): Promise<AiInsightParagraph[] | null> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const url = resolveLlmChatCompletionsUrl(provider.baseUrl, provider.explicitPath);
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${provider.apiKey}` },
        signal: controller.signal,
        body: JSON.stringify({
          model: provider.model,
          temperature: 0.3,
          messages: [
            { role: 'system', content: BASE_SYSTEM_PROMPT + (strict ? BANNED_WORD_REMINDER : '') },
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

      const parsed = JSON.parse(match[0]) as { paragraphs?: unknown };
      if (!Array.isArray(parsed.paragraphs)) return null;

      const validParagraphs: AiInsightParagraph[] = [];
      for (const item of parsed.paragraphs) {
        if (validParagraphs.length >= MAX_PARAGRAPHS) break;
        const entry = item as RawParagraph;
        const text = typeof entry.text === 'string' ? entry.text : '';
        const ids = Array.isArray(entry.evidence_question_ids) ? entry.evidence_question_ids : [];

        if (text.length < MIN_PARAGRAPH_LEN || text.length > MAX_PARAGRAPH_LEN) continue;
        if (FORBIDDEN_THEME_LANGUAGE.test(text)) continue;

        const validIds = ids.filter(
          (id) => typeof id === 'string' && validEvidenceIds.has(id as string),
        ) as string[];
        if (validIds.length === 0) continue;

        validParagraphs.push({ text, evidence_question_ids: validIds });
      }
      return validParagraphs;
    } catch {
      return null;
    } finally {
      clearTimeout(timeout);
    }
  }
}