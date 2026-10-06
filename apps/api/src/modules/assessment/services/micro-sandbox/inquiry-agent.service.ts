// apps/api/src/modules/assessment/services/micro-sandbox/inquiry-agent.service.ts
//
// Inquiry Agent — multi-turn M2.7 questioning with 4-dimension coverage.
//
// [user decision 2026-07-26] Dialogue = M2.7 (callM27Conversational,
// cheaper/faster, conversational settings). Script generation = M3.
// Validation agents = M2.7 (callM27Json, deterministic). Variable
// extraction stays on M3 because it is structured JSON, not dialogue.
//
// Responsibility: hold the conversation with the user, ask one empathetic
// follow-up question at a time, and self-rate four dimensions of coverage
//   - scenario     (what happened, who was involved)
//   - emotion      (how the user felt, what hurt most)
//   - background   (recent context, accumulated pressure)
//   - relationship (the key people and how they usually get along)
//
// When the four dimensions are all >= 0.7, the agent signals [READY] and
// the orchestrator (DynamicScriptService) moves to extraction.
//
// Calls the LLM via the project's existing DynamicScriptFunnelConfig +
// callM27Conversational wrapper. Variable extraction uses a lower temperature
// for stable JSON via callM3Json.
//
// Real LLM at runtime, mocked in unit tests via the funnel config.

import { Injectable } from '@nestjs/common';
import {
  DynamicScriptFunnelConfig,
  callM3Json,
  callM27Conversational,
} from '../../../../common/minimax/dynamic-script-funnel.config.js';
import type {
  ConversationTurn,
  ExtractedVariables,
  Progress,
} from '../../dto/dynamic-script/shared/extracted-variables.dto.js';

const SYSTEM_PROMPT = `你是 EVA 的"追问 Agent"，专门帮助用户在一段对话中把表面事件讲清楚。

你必须在四个维度上各问至少一个问题，每个问题都要有情感共情，不能像审讯：
1. 场景（scenario）：具体发生了什么？涉及谁？触发事件是什么？
2. 情绪（emotion）：当时你感受到什么？什么最让你难受？
3. 背景（background）：这件事之前有没有什么累积？最近发生的事？
4. 关系网络（relationship）：涉及的关键人物是谁？你们平时关系怎么样？

风格要求：
- 先共情，再追问
- 用口语化中文，避免学术腔
- 不要重复问用户已经说过的内容
- 单轮只问一个问题

【输出格式（强制）】
你的回复必须是且仅是一个 JSON 对象（不要 markdown 包裹、不要多余文字）：
{"question": "你的下一个追问", "progress": {"scenario": 0.0-1.0, "emotion": 0.0-1.0, "background": 0.0-1.0, "relationship": 0.0-1.0}}

当四个维度都被覆盖时（每维度 ≥ 0.7 完整度），question 字段写 "[READY]"，并在 progress 中填 1.0。`;

const EXTRACT_SYSTEM_PROMPT = `你是 EVA 的"变量提取器"。基于用户与追问 Agent 的完整对话，提取结构化变量。

输出严格的 JSON（不要 markdown 包裹），字段：
- scenario_type: 'work' | 'family' | 'romantic' | 'social' | 'other'
- trigger_event: 触发事件的一句话描述
- primary_emotion: 主要情绪词
- emotion_intensity: 0-1 的浮点数
- emotional_response: 用户的情绪反应描述
- root_cause?: 推测的潜在原因（可空）
- recent_context?: 最近的背景事件（可空）
- key_persons: 数组，每项 { name, relationship, relationship_quality: -1 到 1 }
- coping_strategy: 用户的应对方式
- immediate_action?: 用户当时的即时行动（可空）`;

export interface InquiryAskResult {
  question: string;
  progress: Progress;
}

@Injectable()
export class InquiryAgentService {
  constructor(private readonly config: DynamicScriptFunnelConfig) {}

  /**
   * Generate the first follow-up question after the user's initial free-form
   * input. The model self-rates the four dimensions; progress.scenario
   * should be the highest after this turn (it sees the trigger event).
   */
  async askFirstQuestion(
    initialInput: string,
    locale: string,
  ): Promise<InquiryAskResult> {
    const userMessage = `用户输入：\n"""\n${initialInput}\n"""\n\n请生成第一个追问，并自评四个维度当前完整度（scenario/emotion/background/relationship 各 0-1）。\n输出严格的 JSON：{"question": "你的问题", "progress": {"scenario": 0.x, "emotion": 0.x, "background": 0.x, "relationship": 0.x}}`;
    const parsed = await callM27Conversational<InquiryAskResult>(
      this.config,
      this.systemPromptFor(locale),
      userMessage,
    );
    return { question: parsed.question, progress: parsed.progress };
  }

  /**
   * Generate the next follow-up question after a user turn. The model
   * should pivot to the lowest-covered dimension.
   */
  async askNextQuestion(
    conversation: ConversationTurn[],
    locale: string,
  ): Promise<InquiryAskResult> {
    const transcript = this.renderTranscript(conversation);
    const userMessage = `${transcript}\n\n根据以上对话，请生成下一个追问（优先覆盖低完整度维度），并更新四个维度的完整度。\n输出严格的 JSON：{"question": "你的问题", "progress": {"scenario": 0.x, "emotion": 0.x, "background": 0.x, "relationship": 0.x}}`;
    const parsed = await callM27Conversational<InquiryAskResult>(
      this.config,
      this.systemPromptFor(locale),
      userMessage,
    );
    return { question: parsed.question, progress: parsed.progress };
  }

  /**
   * Extract structured variables from the full conversation. Uses a lower
   * temperature (0.3) for JSON stability — passed through by callM3Json's
   * default 0.7 by overriding via wrapper.
   */
  async extractVariables(
    conversation: ConversationTurn[],
  ): Promise<ExtractedVariables> {
    const transcript = this.renderTranscript(conversation);
    const userMessage = `${transcript}\n\n请输出 JSON 变量。`;
    const parsed = await callM3JsonWithTemperature<ExtractedVariables>(
      this.config,
      EXTRACT_SYSTEM_PROMPT,
      userMessage,
      0.3,
    );
    return parsed;
  }

  private systemPromptFor(locale: string): string {
    if (locale === 'en') {
      return SYSTEM_PROMPT
        .replace('你是 EVA 的"追问 Agent"', 'You are EVA\'s "Inquiry Agent"')
        .replace('用口语化中文，避免学术腔', 'Use conversational English, avoid academic tone');
    }
    if (locale === 'ja') {
      return SYSTEM_PROMPT
        .replace('你是 EVA 的"追问 Agent"', 'あなたはAtherの「Inquiry Agent」です')
        .replace('用口语化中文，避免学术腔', '口語の日本語で、学術的なトーンは避けてください');
    }
    if (locale === 'es') {
      return SYSTEM_PROMPT
        .replace('你是 EVA 的"追问 Agent"', 'Eres el "Inquiry Agent" de EVA')
        .replace('用口语化中文，避免学术腔', 'Usa español conversacional, evita tono académico');
    }
    return SYSTEM_PROMPT;
  }

  private renderTranscript(conversation: ConversationTurn[]): string {
    return conversation
      .map((turn) => `${turn.role === 'ai' ? 'AI' : '用户'}: ${turn.content}`)
      .join('\n');
  }
}

/**
 * Variant of callM3Json that lets the caller pick a non-default temperature.
 * Kept local (not exported) because only the extraction step currently needs
 * the lower 0.3 — question generation stays at 0.7 for naturalness.
 */
async function callM3JsonWithTemperature<T>(
  config: DynamicScriptFunnelConfig,
  system: string,
  userMessage: string,
  temperature: number,
): Promise<T> {
  const { funnel } = await import('../../../../common/llm-funnel.js');
  const result = await funnel(
    {
      system,
      messages: [{ role: 'user', content: userMessage }],
      temperature,
      max_tokens: 1024,
    },
    { config: config.M3, locale: 'zh-CN' },
  );
  if (!result.content) throw new Error('M3 returned empty content');
  try {
    return JSON.parse(result.content) as T;
  } catch {
    const m = result.content.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (m) return JSON.parse(m[1]) as T;
    throw new Error(`M3 returned non-JSON content: ${result.content.slice(0, 200)}`);
  }
}