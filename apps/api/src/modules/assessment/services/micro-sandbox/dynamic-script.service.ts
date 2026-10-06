// apps/api/src/modules/assessment/services/micro-sandbox/dynamic-script.service.ts
//
// Dynamic Script Service — top-level orchestrator for the dynamic-script
// pipeline. Implements the three-stage API contract:
//   start   →  begin a multi-turn inquiry session, return the first question
//   answer  →  append a user turn, ask the next question, decide if done
//   complete → enqueue async script generation, return a polling token
//
// State machine:
//   in_progress ──answer──▶ in_progress   (continue asking)
//                        └─answer──▶ (extracted_variables ready)
//   completed/abandoned ←─complete / abort
//
// Termination policy is owned by CompletenessEvaluator (min turns +
// dimensions-over-threshold OR max-turns reached). Variable extraction at
// termination is owned by InquiryAgentService.extractVariables; the
// resulting ExtractedVariables are persisted on the session row and
// appended to user.memory_state by VariableExtractorService.
//
// Idempotency:
//   - start:    resumes the latest in_progress session if one exists for
//                the user (no duplicate sessions are created)
//   - complete: returns the existing non-failed generation row if one is
//                already in flight for the session (no duplicate jobs)
//
// All DB access goes through Database.pool.query (RLS-aware via the
// AsyncLocalStorage token stored by SessionInterceptor). Background job
// dispatch goes through QueueService.add('script-generation', ...).

import { Injectable, Logger, NotFoundException, ConflictException, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { Database } from '../../../../common/database.js';
import { InquiryAgentService } from './inquiry-agent.service.js';
import { VariableExtractorService } from './variable-extractor.service.js';
import { CompletenessEvaluator } from './completeness-evaluator.js';
import { ScriptGeneratorService } from './script-generator.service.js';
import { ValidationOrchestrator } from './validation/orchestrator.js';
import { EvidenceBridgeService, type PlayedChoice } from './evidence-bridge.service.js';
import { QueueService } from '../../../../queue/queue.service.js';
import type { StartDynamicDto } from '../../dto/dynamic-script/start.dto.js';
import type { AnswerDynamicDto } from '../../dto/dynamic-script/answer.dto.js';
import type { CompleteDynamicDto } from '../../dto/dynamic-script/complete.dto.js';
import type {
  ConversationTurn,
  ExtractedVariables,
  Progress,
} from '../../dto/dynamic-script/shared/extracted-variables.dto.js';

// Conservative UUID v4-ish regex. Covers both upper- and lower-case forms Postgres
// normalizes to (lower-case) and accepts the 8-4-4-4-12 layout the user_id column expects.
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function isUuid(value: string): boolean {
  return UUID_PATTERN.test(value);
}

const ESTIMATED_GENERATION_SECONDS = 25;

/** Conservative budget for the size of the estimated-turns-remaining window. */
const TYPICAL_INQUIRY_TURNS = 5;

/** BullMQ queue name for async script generation. Mirrored in queue.ts. */
const SCRIPT_GENERATION_QUEUE = 'script-generation';

/** Status values for dynamic_script_generations. */
type GenerationStatus =
  | 'pending'
  | 'generating'
  | 'validating'
  | 'revising'
  | 'saving'
  | 'ready'
  | 'failed';

/** Status values for dynamic_script_sessions. */
type SessionStatus = 'in_progress' | 'completed' | 'abandoned';

/** Row shape we read from dynamic_script_sessions. */
interface DynamicScriptSessionRow {
  id: string;
  user_id: string;
  initial_input: string;
  conversation: ConversationTurn[];
  extracted_variables: ExtractedVariables | null;
  progress: Progress;
  turn_count: number;
  status: SessionStatus;
  locale: string | null;
  created_at: Date;
  completed_at: Date | null;
  abandoned_at: Date | null;
}

/** Row shape we read from dynamic_script_generations. */
interface DynamicScriptGenerationRow {
  id: string;
  session_id: string;
  user_id: string;
  status: GenerationStatus;
  progress_percentage: number;
  current_step: string | null;
  result: unknown;
  error: unknown;
  validation_report: unknown;
  revised: boolean;
  script_id: string | null;
  created_at: Date;
  started_at: Date | null;
  ready_at: Date | null;
  failed_at: Date | null;
}

// ─── Response shapes ────────────────────────────────────────────────────

export interface StartDynamicResponse {
  session_id: string;
  first_question: string;
  progress: Progress;
  estimated_turns_remaining: number;
  is_complete: false;
}

export interface AnswerDynamicContinueResponse {
  session_id: string;
  is_complete: false;
  next_question: string;
  progress: Progress;
  estimated_turns_remaining: number;
  /** Best-effort partial variables for UI preview; full extract happens at completion. */
  extracted_variables_so_far: Partial<ExtractedVariables>;
}

export interface AnswerDynamicCompleteResponse {
  session_id: string;
  is_complete: true;
  ready_to_generate: true;
  progress: Progress;
  estimated_turns_remaining: 0;
  extracted_variables: ExtractedVariables;
}

export interface CompleteDynamicAcceptedResponse {
  script_generation_id: string;
  status: GenerationStatus;
  estimated_total_seconds: number;
}

export interface StatusResponse {
  session_id: string;
  status: SessionStatus;
  current_question?: string;
  extracted_variables?: ExtractedVariables;
  script_generation_id?: string;
  generation_status?: GenerationStatus;
  progress: Progress;
  conversation_length: number;
  created_at: Date;
  completed_at: Date | null;
}

export interface ScriptGenerationStatus {
  script_generation_id: string;
  session_id: string;
  status: GenerationStatus;
  progress_percentage: number;
  current_step?: string;
  estimated_remaining_seconds: number;
  result?: unknown;
  error?: unknown;
}

export interface CompleteDynamicSuccessResponse {
  script_id: string;
  played_path?: PlayedChoice[];
  script: {
    template_id: string;
    scenes: Array<{
      scene_id: string;
      scene_number: number;
      narrative: string;
      choices: Array<{
        choice_id: string;
        text: string;
        dimension_signals: Record<string, number>;
        weight: number;
      }>;
      next_scene_map: Record<string, string>;
    }>;
    metadata: {
      expected_duration_minutes: number;
      dimension_coverage: string[];
      variable_usage: Record<string, boolean>;
    };
  };
  psychological_narrative: string;
  comparison_summary?: string;
  validation_report: unknown;
  revised: boolean;
}

// ─── Service ─────────────────────────────────────────────────────────────

@Injectable()
export class DynamicScriptService {
  private readonly logger = new Logger(DynamicScriptService.name);

  constructor(
    private readonly db: Database,
    private readonly inquiryAgent: InquiryAgentService,
    private readonly variableExtractor: VariableExtractorService,
    private readonly completenessEvaluator: CompletenessEvaluator,
    // ScriptGeneratorService and ValidationOrchestrator are wired up here
    // for consistency with the planned DI graph; they are owned by the
    // background script-generation processor (Task 12) at runtime. They
    // remain as constructor dependencies so a later task can wire the
    // synchronous in-process fast-path without re-plumbing the class.
    // (declare-only on the `_` prefix to keep eslint happy.)
    private readonly _scriptGenerator: ScriptGeneratorService,
    private readonly _validationOrchestrator: ValidationOrchestrator,
    private readonly _evidenceBridge: EvidenceBridgeService,
    private readonly queue: QueueService,
  ) {}

  // ─── start ────────────────────────────────────────────────────────

  /**
   * Begin (or resume) an inquiry session for the user.
   *
   * Idempotent: if the user already has an in_progress session, return
   * its current state with the last AI question — no duplicate session
   * row is created and no extra LLM call is made.
   */
  async start(userId: string, req: StartDynamicDto): Promise<StartDynamicResponse> {
    const locale = req.locale ?? 'zh-CN';
    this.logger.log(`[dynamic:start] user=${userId} locale=${locale} input_len=${req.initial_input.length}`);

    // Guard: dev-mock and other non-UUID user ids can't reach the DB (UUID column).
    // Without this, a malformed user_id crashes the request with a 500 + uncaught
    // exception that takes the API process down. Returning 401 keeps the contract
    // honest and matches what AuthGuard would have done with a real-but-invalid user.
    if (!isUuid(userId)) {
      throw new UnauthorizedException(
        `Invalid user identity for dynamic-script (expected UUID, got ${userId.slice(0, 12)}…)`,
      );
    }

    try {
      // 1. Idempotency: resume existing in_progress session if present.
      const existing = await this.db.pool.query<DynamicScriptSessionRow>(
        `SELECT id, user_id, initial_input, conversation, extracted_variables,
                progress, turn_count, status, locale, created_at, completed_at, abandoned_at
           FROM dynamic_script_sessions
           WHERE user_id = $1 AND status = 'in_progress'
           ORDER BY created_at DESC LIMIT 1`,
        [userId],
      );

      if (existing.rows.length > 0) {
        const session = existing.rows[0];
        const conversation = session.conversation ?? [];
        const lastAi = this.lastAiTurn(conversation);
        const userTurnCount = conversation.filter((t) => t.role === 'user').length;
        return {
          session_id: session.id,
          first_question: lastAi?.content ?? '',
          progress: session.progress ?? this.emptyProgress(),
          estimated_turns_remaining: Math.max(0, TYPICAL_INQUIRY_TURNS - userTurnCount),
          is_complete: false,
        };
      }

      // 2. Create new session row.
      const inserted = await this.db.pool.query<{ id: string }>(
        `INSERT INTO dynamic_script_sessions (user_id, initial_input, locale)
           VALUES ($1, $2, $3)
           RETURNING id`,
        [userId, req.initial_input, locale],
      );
      const sessionId = inserted.rows[0].id;
      this.logger.log(`[dynamic:start] created session=${sessionId}`);

      // 3. Ask the first follow-up via the inquiry agent (M3 LLM call).
      // Fail-soft: if the LLM is unavailable, keep the session alive with a
      // graceful fallback so the user can still proceed; log the cause so
      // dev/CI can see exactly what went wrong.
      let firstQuestion = '能再多告诉我一些当时的具体情况吗?';
      let firstProgress: Progress = { scenario: 0.3, emotion: 0.1, background: 0.1, relationship: 0.1 };
      try {
        const result = await this.inquiryAgent.askFirstQuestion(req.initial_input, locale);
        firstQuestion = result.question;
        firstProgress = result.progress;
      } catch (llmErr) {
        this.logger.error(
          `[dynamic:start] M3 inquiry-agent failed (session=${sessionId}): ${llmErr instanceof Error ? llmErr.message : String(llmErr)}. Using fallback question.`,
        );
      }

      // 4. Persist the conversation + progress + turn_count = 1 (the AI turn).
      const conversation: ConversationTurn[] = [
        { role: 'ai', content: firstQuestion, timestamp: Date.now() },
      ];
      await this.db.pool.query(
        `UPDATE dynamic_script_sessions
           SET conversation = $1::jsonb, progress = $2::jsonb, turn_count = $3
           WHERE id = $4`,
        [
          JSON.stringify(conversation),
          JSON.stringify(firstProgress),
          1,
          sessionId,
        ],
      );

      return {
        session_id: sessionId,
        first_question: firstQuestion,
        progress: firstProgress,
        estimated_turns_remaining: TYPICAL_INQUIRY_TURNS - 1,
        is_complete: false,
      };
    } catch (err) {
      this.logger.error(
        `[dynamic:start] HARD FAILURE user=${userId}: ${err instanceof Error ? (err.stack ?? err.message) : String(err)}`,
      );
      throw err;
    }
  }

  // ─── answer ───────────────────────────────────────────────────────

  /**
   * Append a user answer to the inquiry, ask the next follow-up, and
   * decide whether the inquiry has produced enough coverage to move on
   * to script generation.
   */
  async answer(
    userId: string,
    sessionId: string,
    req: AnswerDynamicDto,
  ): Promise<AnswerDynamicContinueResponse | AnswerDynamicCompleteResponse> {
    // 1. Load + authorize the session row.
    const loaded = await this.db.pool.query<DynamicScriptSessionRow>(
      `SELECT id, user_id, initial_input, conversation, extracted_variables,
              progress, turn_count, status, locale, created_at, completed_at, abandoned_at
         FROM dynamic_script_sessions
         WHERE id = $1 AND user_id = $2`,
      [sessionId, userId],
    );
    if (loaded.rows.length === 0) {
      throw new NotFoundException('Session not found');
    }
    const session = loaded.rows[0];
    if (session.status !== 'in_progress') {
      throw new ConflictException(`Session is not active (status=${session.status})`);
    }

    const locale = session.locale ?? 'zh-CN';
    const conversation: ConversationTurn[] = [...(session.conversation ?? [])];
    conversation.push({ role: 'user', content: req.answer, timestamp: Date.now() });

    // 2. Ask the next follow-up.
    const { question, progress } = await this.inquiryAgent.askNextQuestion(
      conversation,
      locale,
    );
    conversation.push({ role: 'ai', content: question, timestamp: Date.now() });

    // 3. Evaluate termination against the 4-dimension progress.
    const userTurnCount = conversation.filter((t) => t.role === 'user').length;
    const shouldTerminate = this.completenessEvaluator.shouldTerminate(
      userTurnCount,
      progress,
    );

    if (shouldTerminate) {
      // 4a. Extract full variables and persist them + memory_state.
      const variables = await this.inquiryAgent.extractVariables(conversation);
      await this.variableExtractor.appendToMemoryState(userId, variables);
      await this.db.pool.query(
        `UPDATE dynamic_script_sessions
           SET conversation = $1::jsonb,
               progress = $2::jsonb,
               turn_count = $3,
               extracted_variables = $4::jsonb
           WHERE id = $5`,
        [
          JSON.stringify(conversation),
          JSON.stringify(progress),
          userTurnCount,
          JSON.stringify(variables),
          sessionId,
        ],
      );

      return {
        session_id: sessionId,
        is_complete: true,
        ready_to_generate: true,
        progress,
        estimated_turns_remaining: 0,
        extracted_variables: variables,
      };
    }

    // 4b. Persist conversation + progress and ask for the next turn.
    await this.db.pool.query(
      `UPDATE dynamic_script_sessions
         SET conversation = $1::jsonb,
             progress = $2::jsonb,
             turn_count = $3
         WHERE id = $4`,
      [
        JSON.stringify(conversation),
        JSON.stringify(progress),
        userTurnCount,
        sessionId,
      ],
    );

    return {
      session_id: sessionId,
      is_complete: false,
      next_question: question,
      progress,
      estimated_turns_remaining: Math.max(0, TYPICAL_INQUIRY_TURNS - userTurnCount),
      extracted_variables_so_far: this.partialFromConversation(conversation),
    };
  }

  // ─── complete ─────────────────────────────────────────────────────

  /**
   * Enqueue async script generation for the completed inquiry session.
   *
   * Idempotency:
   *   - If a non-failed generation row already exists for this session,
   *     reuse it; pending rows may be re-enqueued with the same BullMQ job ID.
   *   - The dynamic_script_generations.idempotency_key (when supplied
   *     via req.idempotency_key) de-dupes across distinct calls to
   *     /complete with the same key.
   *   - A short session-row lock serializes first submissions without a key.
   */
  async complete(
    userId: string,
    sessionId: string,
    req: CompleteDynamicDto,
  ): Promise<CompleteDynamicAcceptedResponse> {
    const idempotencyKey = req.idempotency_key ?? null;
    let generation: { id: string; status: GenerationStatus } | undefined;
    const client = await this.db.pool.connect();
    try {
      await client.query('BEGIN');
      // Serialize first submissions for the same inquiry, including clients
      // that do not supply an idempotency key.
      const loaded = await client.query<DynamicScriptSessionRow>(
        `SELECT id, user_id, initial_input, conversation, extracted_variables,
                progress, turn_count, status, locale, created_at, completed_at, abandoned_at
           FROM dynamic_script_sessions
           WHERE id = $1 AND user_id = $2 FOR UPDATE`,
        [sessionId, userId],
      );
      const session = loaded.rows[0];
      if (!session) throw new NotFoundException('Session not found');
      if (!session.extracted_variables) throw new ConflictException('Inquiry is not yet complete');
      if (session.status === 'abandoned') throw new ConflictException('Session was cancelled');

      if (idempotencyKey) {
        const byKey = await client.query<{ id: string; status: GenerationStatus }>(
          `SELECT id, status FROM dynamic_script_generations
           WHERE session_id = $1 AND user_id = $2 AND idempotency_key = $3 LIMIT 1`,
          [sessionId, userId, idempotencyKey],
        );
        generation = byKey.rows[0];
      }
      if (!generation) {
        const existing = await client.query<{ id: string; status: GenerationStatus }>(
          `SELECT id, status FROM dynamic_script_generations
           WHERE session_id = $1 AND user_id = $2 AND status <> 'failed'
           ORDER BY created_at DESC LIMIT 1`,
          [sessionId, userId],
        );
        generation = existing.rows[0];
      }
      if (!generation) {
        const inserted = await client.query<{ id: string }>(
          `INSERT INTO dynamic_script_generations
           (session_id, user_id, status, progress_percentage, current_step, revised, idempotency_key)
           VALUES ($1, $2, 'pending', 0, '已加入队列，等待生成', FALSE, $3)
           RETURNING id`,
          [sessionId, userId, idempotencyKey],
        );
        generation = { id: inserted.rows[0].id, status: 'pending' };
      }
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      throw err;
    } finally {
      client.release();
    }

    if (generation.status === 'pending') {
      await this.enqueueGeneration(generation.id, sessionId, userId, idempotencyKey);
    }

    return {
      script_generation_id: generation.id,
      status: generation.status,
      estimated_total_seconds: ESTIMATED_GENERATION_SECONDS,
    };
  }

  private async enqueueGeneration(
    generationId: string,
    sessionId: string,
    userId: string,
    idempotencyKey: string | null,
  ): Promise<void> {
    try {
      const jobId = await this.queue.add(
        SCRIPT_GENERATION_QUEUE,
        'generate',
        { generationId, sessionId, userId, idempotency_key: idempotencyKey },
        { jobId: generationId },
      );
      this.logger.log(`Enqueued script-generation job ${jobId} for session ${sessionId} (user ${userId})`);
    } catch (err) {
      this.logger.warn(`Script queue unavailable for generation ${generationId}: ${String(err)}`);
      throw new ServiceUnavailableException('Script generation queue is unavailable; retry');
    }
    await this.db.pool.query(
      `UPDATE dynamic_script_sessions
         SET status = 'completed', completed_at = COALESCE(completed_at, NOW())
         WHERE id = $1 AND user_id = $2 AND status <> 'abandoned'`,
      [sessionId, userId],
    );
  }

  // ─── status + result ──────────────────────────────────────────────

  async getStatus(userId: string, sessionId: string): Promise<StatusResponse> {
    const loaded = await this.db.pool.query<DynamicScriptSessionRow>(
      `SELECT id, user_id, initial_input, conversation, extracted_variables,
              progress, turn_count, status, locale, created_at, completed_at, abandoned_at
         FROM dynamic_script_sessions
         WHERE id = $1 AND user_id = $2`,
      [sessionId, userId],
    );
    if (loaded.rows.length === 0) {
      throw new NotFoundException('Session not found');
    }
    const row = loaded.rows[0];
    const conversation = row.conversation ?? [];
    const lastAi = this.lastAiTurn(conversation);
    const generation = await this.db.pool.query<{ id: string; status: GenerationStatus }>(
      `SELECT id, status FROM dynamic_script_generations
       WHERE session_id = $1 AND user_id = $2
       ORDER BY created_at DESC LIMIT 1`,
      [sessionId, userId],
    );

    return {
      session_id: row.id,
      status: row.status,
      current_question: row.status === 'in_progress' && !row.extracted_variables ? lastAi?.content : undefined,
      extracted_variables: row.extracted_variables ?? undefined,
      script_generation_id: generation.rows[0]?.id,
      generation_status: generation.rows[0]?.status,
      progress: row.progress ?? this.emptyProgress(),
      conversation_length: conversation.length,
      created_at: row.created_at,
      completed_at: row.completed_at,
    };
  }

  async getScriptGenerationStatus(
    userId: string,
    generationId: string,
  ): Promise<ScriptGenerationStatus> {
    const result = await this.db.pool.query<DynamicScriptGenerationRow>(
      `SELECT id, session_id, user_id, status, progress_percentage, current_step,
              result, error, validation_report, revised, script_id,
              created_at, started_at, ready_at, failed_at
         FROM dynamic_script_generations
         WHERE id = $1 AND user_id = $2`,
      [generationId, userId],
    );
    if (result.rows.length === 0) {
      throw new NotFoundException('Generation not found');
    }
    const row = result.rows[0];
    const isTerminal = row.status === 'ready' || row.status === 'failed';
    return {
      script_generation_id: row.id,
      session_id: row.session_id,
      status: row.status,
      progress_percentage: row.progress_percentage,
      current_step: row.current_step ?? undefined,
      estimated_remaining_seconds: isTerminal ? 0 : ESTIMATED_GENERATION_SECONDS,
      result: row.status === 'ready' ? row.result : undefined,
      error: row.status === 'failed' ? row.error : undefined,
    };
  }

  /**
   * Fetch the final playable script + post-experience narrative.
   *
   * Throws ConflictException (HTTP 409) if the generation is not yet
   * ready, allowing the controller to send a "still processing" retry
   * hint instead of an empty 200 response.
   */
  async getScriptResult(
    userId: string,
    generationId: string,
  ): Promise<CompleteDynamicSuccessResponse> {
    const status = await this.getScriptGenerationStatus(userId, generationId);
    if (status.status !== 'ready' || !status.result) {
      throw new ConflictException(
        `Script is not ready yet (status=${status.status})`,
      );
    }
    const { played_path: _cachedPath, ...result } = status.result as CompleteDynamicSuccessResponse;
    const playback = await this.db.pool.query<{ played_path: PlayedChoice[] | null; play_completed_at: Date | null }>(
      `SELECT played_path, play_completed_at FROM dynamic_scripts
       WHERE id = $1 AND user_id = $2 AND generation_id = $3`,
      [result.script_id, userId, generationId],
    );
    const row = playback.rows[0];
    return row?.play_completed_at && row.played_path
      ? { ...result, played_path: row.played_path }
      : result;
  }

  // ─── abort ────────────────────────────────────────────────────────

  /**
   * Mark the session as abandoned and fail any in-flight generation row
   * (pending / generating / validating / revising / saving) so the worker does
   * not keep churning after the user has explicitly given up.
   */
  async abortSession(userId: string, sessionId: string, reason?: string): Promise<{
    status: 'abandoned' | 'completed';
    generation_cancelled: boolean;
  }> {
    const sessionResult = await this.db.pool.query<DynamicScriptSessionRow>(
      `SELECT id, user_id, initial_input, conversation, extracted_variables,
              progress, turn_count, status, locale, created_at, completed_at, abandoned_at
         FROM dynamic_script_sessions
         WHERE id = $1 AND user_id = $2`,
      [sessionId, userId],
    );
    if (sessionResult.rows.length === 0) {
      throw new NotFoundException('Session not found');
    }
    await this.db.pool.query(
      `UPDATE dynamic_script_sessions
         SET status = 'abandoned', abandoned_at = NOW()
         WHERE id = $1 AND user_id = $2 AND status = 'in_progress'`,
      [sessionId, userId],
    );

    // Fail any in-flight generation rows for this session.
    const errorPayload = {
      error: 'session_aborted',
      message: 'User abandoned the session',
      reason: reason ?? 'user_cancelled',
      user_options: ['restart'],
    };
    const cancelled = await this.db.pool.query<{ id: string }>(
      `UPDATE dynamic_script_generations
         SET status = 'failed',
             failed_at = NOW(),
             error = $1::jsonb,
             current_step = '会话已取消'
         WHERE session_id = $2 AND user_id = $3
           AND status IN ('pending', 'generating', 'validating', 'revising', 'saving')
         RETURNING id`,
      [JSON.stringify(errorPayload), sessionId, userId],
    );

    const current = await this.db.pool.query<{ status: SessionStatus }>(
      `SELECT status FROM dynamic_script_sessions WHERE id = $1 AND user_id = $2`,
      [sessionId, userId],
    );
    const currentStatus = current.rows[0]?.status;
    if (currentStatus === 'in_progress') {
      throw new ConflictException('Cancellation could not be confirmed');
    }
    if (!currentStatus) {
      throw new NotFoundException('Session not found');
    }
    this.logger.log(`Cancellation request for session ${sessionId}: stopped ${cancelled.rows.length} generation(s)`);
    return {
      status: currentStatus,
      generation_cancelled: cancelled.rows.length > 0,
    };
  }

  // ─── helpers ──────────────────────────────────────────────────────

  private emptyProgress(): Progress {
    return { scenario: 0, emotion: 0, background: 0, relationship: 0 };
  }

  private lastAiTurn(conversation: ConversationTurn[]): ConversationTurn | undefined {
    for (let i = conversation.length - 1; i >= 0; i--) {
      if (conversation[i].role === 'ai') return conversation[i];
    }
    return undefined;
  }

  /**
   * Best-effort partial extraction for the UI preview. Full extraction
   * is owned by InquiryAgentService.extractVariables and runs only at
   * termination; this stub returns the latest AI question + the user
   * turns so the client can render a transcript preview.
   */
  private partialFromConversation(
    conversation: ConversationTurn[],
  ): Partial<ExtractedVariables> {
    const turns = conversation
      .filter((t) => t.role === 'user')
      .map((t) => ({ trigger_event: t.content }));
    return {
      trigger_event: turns.at(-1)?.trigger_event ?? '',
      emotional_response: turns.map((t) => t.trigger_event).join(' / '),
    };
  }
}
