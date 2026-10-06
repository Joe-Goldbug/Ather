// apps/api/src/modules/chat/chat.service.ts
// Legacy chat compatibility service.
// Preserves archived chat logic and related audit/history endpoints while the
// formal product has moved to assessment + portrait + captures + check-ins.

import type { ChatResponse, ConversationTurn, Memory } from '@eva/core';
import { processChat } from '@eva/core';
import type { LLMCaller } from '@eva/core';
import { computeUBVEvidenceEvents } from '@eva/core';
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { AuthService } from '../auth/auth.service.js';
import { ReportService } from '../report/report.service.js';
import { EvidenceService } from '../evidence/evidence.service.js';
import { Database } from '../../common/database.js';
import type { PoolClient } from '../../common/pool.js';
import { resolveLlmChatCompletionsUrl } from '../../common/llm-endpoint.js';
import { resolveLlmRuntimeConfig } from '../../common/llm-config.js';
import { RedisService } from '../../common/redis.service.js';
import { funnel, detectModelFamily, type ModelFamily, type FunnelResult } from '../../common/llm-funnel.js';

export interface ModelAuditResult {
  configured_model: string;
  base_url: string;
  api_key_masked: string;
  model_family: ModelFamily;
  verification: {
    status: 'ok' | 'mismatch' | 'failed' | 'skipped';
    server_model?: string;
    latency_ms?: number;
    error?: string;
  };
}

export interface ModelConfig {
  base_url: string;
  model: string;
  model_family: ModelFamily;
  api_key_masked: string;
}

export interface FunnelStatus {
  model_family: ModelFamily;
  funnel_enabled: boolean;
  max_output_chars: number;
  timeout_ms: number;
  max_retries: number;
  cache_enabled: boolean;
  cache_ttl_seconds: number;
  last_call?: {
    funnel_latency_ms: number;
    fallback_used: boolean;
    model: string;
  };
}

@Injectable()
export class ChatService {
  private _lastUsedModel: string | null = null;
  private _lastFunnelMeta: { funnel_latency_ms: number; fallback_used: boolean; model: string } | null = null;

  get lastUsedModel(): string | null {
    return this._lastUsedModel;
  }

  get lastFunnelMeta() {
    return this._lastFunnelMeta;
  }

  constructor(
    private readonly db: Database,
    private readonly auth: AuthService,
    private readonly report: ReportService,
    private readonly evidence: EvidenceService,
    private readonly redis: RedisService,
  ) {}

  private async ensureConversation(memory: Memory, userId: string, client: PoolClient): Promise<string> {
    const meta = (memory.meta ?? {}) as Record<string, unknown>;
    const existingId = typeof meta.active_conversation_id === 'string'
      ? meta.active_conversation_id
      : null;

    if (existingId) {
      // Verify the stored ID exists AND belongs to this user; reject dirty/stale IDs
      const check = await client.query<{ id: string }>(
        'SELECT id FROM conversations WHERE id = $1 AND user_id = $2 LIMIT 1',
        [existingId, userId],
      );
      if (check.rows[0]) return existingId;
      // ID invalid — fall through to create a new conversation below
    }

    const created = await client.query<{ id: string }>(
      `INSERT INTO conversations (user_id, phase, turns, active_topics, meta, created_at, updated_at)
       VALUES ($1, 'probing', '[]'::jsonb, $2::text[], '{}'::jsonb, NOW(), NOW())
       RETURNING id`,
      [userId, memory.quick_state?.active_topics ?? []],
    );
    return created.rows[0].id;
  }

  private async persistConversationTurnState(
    userId: string,
    conversationId: string,
    response: ChatResponse,
    client: PoolClient,
  ): Promise<void> {
    const statePhase = response.updated_state?.phase ?? 'probing';
    const turns = response.updated_memory.conversation_history as ConversationTurn[];
    const topics = response.updated_memory.quick_state?.active_topics ?? [];

    await client.query(
      `INSERT INTO conversations (id, user_id, phase, turns, active_topics, meta, created_at, updated_at)
       VALUES ($1, $2, $3, $4::jsonb, $5::text[], '{}'::jsonb, NOW(), NOW())
       ON CONFLICT (id) DO UPDATE
       SET phase = EXCLUDED.phase,
           turns = CASE
             WHEN jsonb_array_length(EXCLUDED.turns) > jsonb_array_length(conversations.turns)
             THEN EXCLUDED.turns
             WHEN jsonb_array_length(EXCLUDED.turns) = jsonb_array_length(conversations.turns)
               AND EXCLUDED.updated_at >= conversations.updated_at
             THEN EXCLUDED.turns
             ELSE conversations.turns
           END,
           active_topics = EXCLUDED.active_topics,
           updated_at = NOW()`,
      [conversationId, userId, statePhase, JSON.stringify(turns), topics],
    );
  }

  /** Real OpenAI-compatible LLM caller, wrapped by the 3-layer funnel.
   *  Configure via OPENAI_BASE_URL, OPENAI_API_KEY, OPENAI_MODEL env vars.
   *  The funnel handles: family-specific request shaping, retries+timeout,
   *  and output normalization (strip think blocks, clamp length, fallback on
   *  off-the-rails output). */
  private buildLLMCaller(locale?: string): LLMCaller {
    const { baseUrl, explicitPath, apiKey, model } = resolveLlmRuntimeConfig();
    const cacheTtl = parseInt(process.env.LLM_CACHE_TTL_SECONDS ?? '0', 10);
    const timeoutMs = parseInt(process.env.LLM_FUNNEL_TIMEOUT_MS ?? '30000', 10);
    const maxRetries = parseInt(process.env.LLM_FUNNEL_MAX_RETRIES ?? '1', 10);
    const maxOutputChars = parseInt(process.env.LLM_FUNNEL_MAX_OUTPUT_CHARS ?? '4000', 10);

    if (!apiKey) {
      throw new InternalServerErrorException(
        '[ChatService] LLM_API_KEY/OPENAI_API_KEY not set — set it in .env. ' +
        'See .env.example for required environment variables.',
      );
    }

    return async ({ system, messages, max_tokens = 512, temperature = 0.7 }) => {
      const lastMsg = messages[messages.length - 1]?.content ?? '';
      const cacheKey = cacheTtl > 0
        ? `llm:funnel:${model}:${this.hashKey(system + lastMsg + String(temperature))}`
        : null;

      if (cacheKey) {
        try {
          const cached = await this.redis.get(cacheKey);
          if (cached) {
            const parsed = JSON.parse(cached) as { content: string; model: string };
            this._lastUsedModel = parsed.model;
            this._lastFunnelMeta = { funnel_latency_ms: 0, fallback_used: false, model: parsed.model };
            return parsed.content;
          }
        } catch { /* cache miss, proceed to LLM */ }
      }

      const result: FunnelResult = await funnel(
        { system, messages, max_tokens, temperature },
        {
          config: { baseUrl, apiKey, model, explicitPath, timeoutMs, maxRetries, maxOutputChars },
          locale,
        },
      );

      this._lastUsedModel = result.model;
      this._lastFunnelMeta = {
        funnel_latency_ms: result.funnel_latency_ms,
        fallback_used: result.fallback_used,
        model: result.model,
      };

      if (cacheKey && cacheTtl > 0) {
        this.redis.set(
          cacheKey,
          JSON.stringify({ content: result.content, model: result.model }),
          cacheTtl,
        ).catch(() => {});
      }

      return result.content;
    };
  }

  private hashKey(input: string): string {
    let hash = 0;
    for (let i = 0; i < input.length; i++) {
      const chr = input.charCodeAt(i);
      hash = ((hash << 5) - hash) + chr;
      hash |= 0;
    }
    return Math.abs(hash).toString(36);
  }

  getModelConfig(): ModelConfig {
    const { model, baseUrl, apiKey } = resolveLlmRuntimeConfig();
    return {
      base_url: baseUrl,
      model,
      model_family: detectModelFamily(model),
      api_key_masked: this.maskApiKey(apiKey),
    };
  }

  getFunnelStatus(): FunnelStatus {
    const { model } = resolveLlmRuntimeConfig();
    const cacheTtl = parseInt(process.env.LLM_CACHE_TTL_SECONDS ?? '0', 10);
    return {
      model_family: detectModelFamily(model),
      funnel_enabled: true,
      max_output_chars: parseInt(process.env.LLM_FUNNEL_MAX_OUTPUT_CHARS ?? '4000', 10),
      timeout_ms: parseInt(process.env.LLM_FUNNEL_TIMEOUT_MS ?? '30000', 10),
      max_retries: parseInt(process.env.LLM_FUNNEL_MAX_RETRIES ?? '1', 10),
      cache_enabled: cacheTtl > 0,
      cache_ttl_seconds: cacheTtl,
      last_call: this._lastFunnelMeta ?? undefined,
    };
  }

  async verifyModel(): Promise<ModelAuditResult> {
    const config = this.getModelConfig();
    const { baseUrl, explicitPath, apiKey, model } = resolveLlmRuntimeConfig();

    if (!apiKey) {
      return {
        configured_model: config.model,
        base_url: config.base_url,
        api_key_masked: config.api_key_masked,
        model_family: config.model_family,
        verification: { status: 'skipped', error: 'LLM_API_KEY/OPENAI_API_KEY not configured' },
      };
    }

    try {
      const t0 = Date.now();
      const url = resolveLlmChatCompletionsUrl(baseUrl, explicitPath);
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages: [{ role: 'user', content: 'ping' }],
          max_tokens: 4,
          temperature: 0,
        }),
        signal: AbortSignal.timeout(10000),
      });

      const latency_ms = Date.now() - t0;

      if (!response.ok) {
        const body = await response.text();
        return {
          configured_model: config.model,
          base_url: config.base_url,
          api_key_masked: config.api_key_masked,
          model_family: config.model_family,
          verification: { status: 'failed', latency_ms, error: `HTTP ${response.status}: ${body.slice(0, 300)}` },
        };
      }

      const data = (await response.json()) as { model?: string };
      const serverModel = data.model ?? '(not returned)';
      const matches = serverModel === model || serverModel.includes(model) || model.includes(serverModel);

      return {
        configured_model: config.model,
        base_url: config.base_url,
        api_key_masked: config.api_key_masked,
        model_family: config.model_family,
        verification: {
          status: matches ? 'ok' : 'mismatch',
          server_model: serverModel,
          latency_ms,
        },
      };
    } catch (err) {
      return {
        configured_model: config.model,
        base_url: config.base_url,
        api_key_masked: config.api_key_masked,
        model_family: config.model_family,
        verification: {
          status: 'failed',
          error: err instanceof Error ? err.message : String(err),
        },
      };
    }
  }

  private maskApiKey(key: string): string {
    if (key.length <= 8) return '***';
    return `${key.slice(0, 4)}...${key.slice(-4)}`;
  }

  private buildHydrationHints(memory: Memory, candidatesPayload: {
    candidates: Array<{
      dimension: string;
      confidence: number;
      correction_penalty: number;
      evidence_strength: number;
      evidence_count_7d: number;
      correction_count_14d: number;
      weighted_delta_7d: number;
    }>;
  }) {
    const topLowConfidence = [...candidatesPayload.candidates]
      .sort((a, b) => a.confidence - b.confidence)
      .slice(0, 3)
      .map((c) => c.dimension);

    const recentCorrections = candidatesPayload.candidates
      .filter((c) => c.correction_penalty > 0)
      .sort((a, b) => b.correction_penalty - a.correction_penalty)
      .slice(0, 5)
      .map((c) => ({
        dimension: c.dimension,
        count: c.correction_count_14d,
      }));

    const recentEvidenceSummary = candidatesPayload.candidates
      .sort((a, b) => b.evidence_strength - a.evidence_strength)
      .slice(0, 5)
      .map((c) => ({
        dimension: c.dimension,
        count: c.evidence_count_7d,
        weighted_delta: c.weighted_delta_7d,
      }));

    const currentUbv = memory.ubv ?? {};
    const baselineUbv = memory.baseline_ubv ?? {};
    const deltaTop3 = Object.keys(currentUbv)
      .map((key) => {
        const curr = currentUbv[key]?.value ?? 50;
        const base = baselineUbv[key]?.value ?? curr;
        return { dimension: key, delta: Number(((curr - base) / 100).toFixed(3)) };
      })
      .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
      .slice(0, 3);

    return {
      top_low_confidence_dimensions: topLowConfidence,
      recent_corrections_by_dimension: recentCorrections,
      recent_evidence_summary: recentEvidenceSummary,
      baseline_vs_current_delta_top3: deltaTop3,
    };
  }

  private async assertChatHistoryConsent(userId: string): Promise<void> {
    const permission = await this.db.pool.query<{ granted: boolean }>(
      `SELECT granted FROM consent_grants WHERE user_id = $1 AND consent_type = 'chat_history_use'`,
      [userId],
    );
    if (permission.rows[0]?.granted !== true) {
      throw new ForbiddenException({ code: 'chat_history_use_not_authorized' });
    }
  }

  /** Process a chat message — main entry point for the dialogue engine */
  async sendMessage(userId: string, userMessage: string, locale?: string): Promise<ChatResponse> {
    await this.assertChatHistoryConsent(userId);
    const memory = await this.auth.getUserMemory(userId);
    if (!memory) throw new NotFoundException('User memory not found');

    // Defensive: ensure quick_state is always present (DB records may predate the field)
    if (!memory.quick_state) {
      memory.quick_state = {
        recent_mood: '',
        mood_intensity: 0.5,
        active_topics: [],
        mention_counts: {},
        last_active: Date.now(),
      };
    }

    // Gate: require baseline assessment before chatting (mirrors micro-sandbox gate)
    // Skip in local dev to allow quick chat testing without running full assessment
    const skipBaseline = process.env.NODE_ENV === 'development' && process.env.MOCK_DB === '1';
    if (!skipBaseline) {
      const baselineCompleted = await this.auth.getBaselineCompleted(userId);
      if (!baselineCompleted && !memory.personality_vector) {
        throw new BadRequestException('Please complete the baseline assessment before chatting.');
      }
    }

    // Capture prev phase before engine runs — used to detect closed transition
    const prevPhase = (memory.meta as Record<string, unknown> & { dialogue_state?: { phase?: string } })?.dialogue_state?.phase ?? 'probing';

    // Step 1: Capture old UBV before this turn (for evidence computation)
    const oldUBV = memory.ubv ?? null;

    // Step 1b: Get recent user corrections for YouShifted correction gating
    const recentCorrections = await this.evidence.getRecentCorrections(userId).catch(() => []);
    const insightCandidates = await this.evidence.getInsightCandidates(userId).catch(() => ({ candidates: [] }));
    const hydrationHints = this.buildHydrationHints(memory, insightCandidates);

    const modelCaller = this.buildLLMCaller(locale ?? 'zh-CN');
    const llm_caller: LLMCaller = async (request) => {
      await this.assertChatHistoryConsent(userId);
      return modelCaller(request);
    };
    const response = await processChat({
      user_message: userMessage,
      memory,
      llm_caller,
      locale: locale ?? 'zh-CN',
      recent_corrections: recentCorrections,
      hydration_hints: hydrationHints,
    });
    const client = await this.db.pool.connect();
    let conversationId: string;
    try {
      await client.query('BEGIN');
      const permission = await client.query<{ granted: boolean }>(
        `SELECT granted FROM consent_grants
         WHERE user_id = $1 AND consent_type = 'chat_history_use'
         FOR SHARE`,
        [userId],
      );
      if (permission.rows[0]?.granted !== true) {
        throw new ForbiddenException({ code: 'chat_history_use_not_authorized' });
      }

      conversationId = await this.ensureConversation(memory, userId, client);
      (response.updated_memory as unknown as { meta: Record<string, unknown> }).meta = {
        ...(response.updated_memory.meta as Record<string, unknown>),
        active_conversation_id: conversationId,
      };
      await this.persistConversationTurnState(userId, conversationId, response, client);

      if (oldUBV && response.updated_memory?.ubv) {
        const events = computeUBVEvidenceEvents(
          userId,
          conversationId,
          oldUBV,
          response.updated_memory.ubv,
          userMessage,
        );
        if (events.length > 0) {
          await this.evidence.writeMany(events, client);
        }
      }

      await this.auth.saveUserMemory(userId, response.updated_memory, client);
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }

    // Step 4: Trigger report generation only on the turn that transitions to closed
    const phase = response.updated_state?.phase;
    if (phase === 'closed' && prevPhase !== 'closed') {
      // Idempotency: skip if report already exists for this conversation
      const existingReport = await this.report.getReportByConversation(conversationId, userId);
      if (!existingReport) {
        this.report.triggerReport(conversationId, userId, locale ?? 'zh-CN').catch((err) => {
          console.error('[ChatService] triggerReport failed:', err.message);
        });
      }
    }

    return response;
  }

  /** Get user's current dialogue state (for UI phase display) */
  async getDialogueState(userId: string) {
    const memory = await this.auth.getUserMemory(userId);
    if (!memory) throw new NotFoundException('User memory not found');

    // Gate: require baseline assessment before accessing dialogue state
    // Skip in local dev to allow quick testing
    const skipBaseline = process.env.NODE_ENV === 'development' && process.env.MOCK_DB === '1';
    if (!skipBaseline) {
      const baselineCompleted = await this.auth.getBaselineCompleted(userId);
      if (!baselineCompleted && !memory.personality_vector) {
        throw new BadRequestException('Please complete the baseline assessment first.');
      }
    }

    const raw = (memory.meta as Record<string, unknown>).dialogue_state;
    return raw ?? null;
  }

  /** Get persisted chat history for the current user (used to restore page state after login). */
  async getHistory(userId: string) {
    const memory = await this.auth.getUserMemory(userId);
    if (!memory) throw new NotFoundException('User memory not found');

    const skipBaseline = process.env.NODE_ENV === 'development' && process.env.MOCK_DB === '1';
    if (!skipBaseline) {
      const baselineCompleted = await this.auth.getBaselineCompleted(userId);
      if (!baselineCompleted && !memory.personality_vector) {
        throw new BadRequestException('Please complete the baseline assessment first.');
      }
    }

    return {
      user_id: userId,
      conversation_history: memory.conversation_history ?? [],
      active_conversation_id: (memory.meta as Record<string, unknown>).active_conversation_id ?? null,
      total_turns: memory.meta.total_turns,
      last_active: memory.meta.last_active,
    };
  }
}
