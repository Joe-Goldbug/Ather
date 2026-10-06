// apps/api/src/modules/assessment/services/micro-sandbox/dynamic-script.service.spec.ts
//
// Hermetic tests for DynamicScriptService.
//
// We mock all collaborators (Database, InquiryAgentService, etc.) so the
// tests exercise the real orchestration logic without touching the LLM
// or Postgres. Patterns follow the existing `.spec.ts` files in this
// folder (see variable-extractor.service.spec.ts for an in-memory
// QueryPool stub).

import { describe, test, expect, beforeEach, jest } from '@jest/globals';
import {
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { DynamicScriptService } from './dynamic-script.service.js';
import { Database } from '../../../../common/database.js';
import type { ExtractedVariables } from '../../dto/dynamic-script/shared/extracted-variables.dto.js';

// dynamic-script 端点强制要求真实 UUID 用户身份（非 UUID 会抛
// UnauthorizedException: Invalid user identity），因此测试不能再用
// 'user-1' 这类占位串作为 userId。
const TEST_USER_ID = '11111111-2222-4333-8444-555555555555';

// ─── In-memory QueryPool stub ───────────────────────────────────────────

interface SessionRow {
  id: string;
  user_id: string;
  initial_input: string;
  conversation: unknown;
  extracted_variables: unknown;
  progress: unknown;
  turn_count: number;
  status: 'in_progress' | 'completed' | 'abandoned';
  locale: string;
  created_at: Date;
  completed_at: Date | null;
  abandoned_at: Date | null;
}

interface GenerationRow {
  id: string;
  session_id: string;
  user_id: string;
  status: 'pending' | 'generating' | 'validating' | 'revising' | 'saving' | 'ready' | 'failed';
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
  idempotency_key?: string | null;
}

interface QueryPoolStub {
  sessions: SessionRow[];
  generations: GenerationRow[];
  query: jest.Mock;
  connect: jest.Mock;
}

function createPoolStub(): QueryPoolStub {
  const sessions: SessionRow[] = [];
  const generations: GenerationRow[] = [];

  const matches = {
    selectSessionById: (text: string) =>
      /FROM dynamic_script_sessions/.test(text) &&
      /WHERE id = \$1/.test(text) &&
      /AND user_id = \$2/.test(text),
    selectInProgress: (text: string) =>
      /FROM dynamic_script_sessions/.test(text) &&
      /status = 'in_progress'/.test(text) &&
      /LIMIT 1/.test(text),
    insertSession: (text: string) =>
      /INSERT INTO dynamic_script_sessions/.test(text),
    updateSession: (text: string) =>
      /UPDATE dynamic_script_sessions/.test(text),
    selectExistingGeneration: (text: string) =>
      /FROM dynamic_script_generations/.test(text) &&
      /session_id = \$1/.test(text) &&
      /status <> 'failed'/.test(text),
    selectGenerationByKey: (text: string) =>
      /FROM dynamic_script_generations/.test(text) &&
      /idempotency_key = \$3/.test(text),
    insertGeneration: (text: string) =>
      /INSERT INTO dynamic_script_generations/.test(text),
    selectGenerationById: (text: string) =>
      /FROM dynamic_script_generations/.test(text) &&
      /WHERE id = \$1/.test(text),
    selectLatestGeneration: (text: string) =>
      /FROM dynamic_script_generations/.test(text) &&
      /WHERE session_id = \$1 AND user_id = \$2/.test(text) &&
      /ORDER BY created_at DESC LIMIT 1/.test(text),
    updateGeneration: (text: string) =>
      /UPDATE dynamic_script_generations/.test(text),
  };

  const queryFn = async (text: string, params: unknown[] = []) => {
    if (/FROM dynamic_scripts/.test(text)) return { rows: [] };
    if (['BEGIN', 'COMMIT', 'ROLLBACK'].includes(text)) return { rows: [] };
    if (matches.selectSessionById(text)) {
      const id = params[0] as string;
      const userId = params[1] as string;
      return {
        rows: sessions.filter((s) => s.id === id && s.user_id === userId),
      };
    }
    if (matches.selectInProgress(text)) {
      const userId = params[0] as string;
      const inProgress = sessions
        .filter((s) => s.user_id === userId && s.status === 'in_progress')
        .sort((a, b) => b.created_at.getTime() - a.created_at.getTime())
        .slice(0, 1);
      return { rows: inProgress };
    }
    if (matches.insertSession(text)) {
      const id = `sess-${sessions.length + 1}`;
      const userId = params[0] as string;
      const initial_input = params[1] as string;
      const locale = (params[2] as string) ?? 'zh-CN';
      sessions.push({
        id,
        user_id: userId,
        initial_input,
        conversation: [],
        extracted_variables: null,
        progress: { scenario: 0, emotion: 0, background: 0, relationship: 0 },
        turn_count: 0,
        status: 'in_progress',
        locale,
        created_at: new Date(),
        completed_at: null,
        abandoned_at: null,
      });
      return { rows: [{ id }] };
    }
    if (matches.updateSession(text)) {
      // Some UPDATEs put the id at $1, others at the tail (the index lookups
      // above put sessionId last). Try both positions.
      const idParam = params[0] as string;
      const session = sessions.find((s) => s.id === idParam)
        ?? sessions.find((s) => s.id === (params[params.length - 1] as string));
      if (!session) return { rows: [] };
      // Best-effort mutation depending on UPDATE flavour.
      const lowered = text.toLowerCase();
      if (lowered.includes("status = 'abandoned'") && session.status === 'in_progress') {
        // abort: param shape depends on caller; handled specifically in abort tests.
        session.status = 'abandoned';
        session.abandoned_at = new Date();
      } else if (lowered.includes("status = 'completed'")) {
        session.status = 'completed';
        session.completed_at = new Date();
      }
      // Detect the answer()-with-extraction UPDATE shape first (it has
      // extracted_variables = $4::jsonb).
      if (lowered.includes('extracted_variables = $4::jsonb')) {
        session.conversation = JSON.parse(params[0] as string);
        session.progress = JSON.parse(params[1] as string);
        session.turn_count = params[2] as number;
        session.extracted_variables = JSON.parse(params[3] as string);
      } else if (/\$1::jsonb/.test(text) && lowered.includes('progress = $2::jsonb')) {
        // answer() continuation (no extraction): $1 conversation, $2 progress, $3 turn_count
        session.conversation = JSON.parse(params[0] as string);
        session.progress = JSON.parse(params[1] as string);
        session.turn_count = params[2] as number;
      } else if (lowered.includes('conversation = $1')) {
        // start() shape: $1 conversation, $2 progress, $3 turn_count
        session.conversation = JSON.parse(params[0] as string);
      }
      return { rows: [] };
    }
    if (matches.selectExistingGeneration(text)) {
      const sessionId = params[0] as string;
      const nonFailed = generations.filter(
        (g) => g.session_id === sessionId && g.status !== 'failed',
      );
      return {
        rows: nonFailed.map((g) => ({ id: g.id, status: g.status })),
      };
    }
    if (matches.selectGenerationByKey(text)) {
      return {
        rows: generations
          .filter((g) => g.session_id === params[0] && g.user_id === params[1]
            && g.idempotency_key === params[2])
          .map((g) => ({ id: g.id, status: g.status })),
      };
    }
    if (matches.selectLatestGeneration(text)) {
      return {
        rows: generations
          .filter((g) => g.session_id === params[0] && g.user_id === params[1])
          .sort((a, b) => b.created_at.getTime() - a.created_at.getTime())
          .slice(0, 1)
          .map((g) => ({ id: g.id, status: g.status })),
      };
    }
    if (matches.insertGeneration(text)) {
      const id = `gen-${generations.length + 1}`;
      const sessionId = params[0] as string;
      const userId = params[1] as string;
      generations.push({
        id,
        session_id: sessionId,
        user_id: userId,
        status: 'pending',
        progress_percentage: 0,
        current_step: '已加入队列，等待生成',
        result: null,
        error: null,
        validation_report: null,
        revised: false,
        script_id: null,
        created_at: new Date(),
        started_at: null,
        ready_at: null,
        failed_at: null,
        idempotency_key: params[2] as string | null,
      });
      return { rows: [{ id }] };
    }
    if (matches.selectGenerationById(text)) {
      const id = params[0] as string;
      const userId = params[1] as string;
      const found = generations.filter(
        (g) => g.id === id && g.user_id === userId,
      );
      return { rows: found };
    }
    if (matches.updateGeneration(text)) {
      const sessionId = params[1] as string;
      const inFlight = generations.filter(
        (g) => g.session_id === sessionId && g.user_id === params[2]
          && !['failed', 'ready'].includes(g.status),
      );
      for (const g of inFlight) {
        g.status = 'failed';
        g.failed_at = new Date();
        g.error = JSON.parse(params[0] as string);
      }
      return { rows: inFlight.map((g) => ({ id: g.id })) };
    }
    throw new Error(`Unexpected query: ${text}`);
  };

  return {
    sessions,
    generations,
    query: jest.fn(queryFn),
    connect: jest.fn(async () => ({ query: jest.fn(queryFn), release: () => undefined })),
  };
}

// ─── Collaborator stubs ─────────────────────────────────────────────────

function createInquiryStub() {
  return {
    askFirstQuestion: jest.fn(async () => ({
      question: '当时具体发生了什么？',
      progress: { scenario: 0.3, emotion: 0, background: 0, relationship: 0 },
    })),
    askNextQuestion: jest.fn(async () => ({
      question: '你当时的感受是什么？',
      progress: { scenario: 0.5, emotion: 0.4, background: 0, relationship: 0 },
    })),
    extractVariables: jest.fn(async () =>
      makeExtractedVariables(),
    ),
  };
}

function createVariableExtractorStub() {
  return {
    appendToMemoryState: jest.fn(async () => {}),
  };
}

function createCompletenessStub() {
  return {
    // The default false case; tests can override per-test.
    shouldTerminate: jest.fn(() => false),
  };
}

function createQueueStub() {
  const fn = jest.fn(
    async (
      _queue: string,
      _name: string,
      _payload: Record<string, unknown>,
      _opts?: { jobId?: string },
    ) => 'job-mock-1',
  );
  return { add: fn };
}

function makeExtractedVariables(): ExtractedVariables {
  return {
    scenario_type: 'work',
    trigger_event: '和李明因为项目方案吵架',
    primary_emotion: '愤怒',
    emotion_intensity: 0.7,
    emotional_response: '觉得不被尊重',
    root_cause: '长期合作中的边界被打破',
    recent_context: '连续加班两周',
    key_persons: [
      { name: '李明', relationship: '5年同事', relationship_quality: 0.3 },
    ],
    coping_strategy: '沉默离开会议室',
    immediate_action: '转身离开',
  };
}

// ─── Test suite ─────────────────────────────────────────────────────────

describe('DynamicScriptService', () => {
  let pool: QueryPoolStub;
  let db: Database;
  let inquiry: ReturnType<typeof createInquiryStub>;
  let variableExtractor: ReturnType<typeof createVariableExtractorStub>;
  let completeness: ReturnType<typeof createCompletenessStub>;
  let queue: ReturnType<typeof createQueueStub>;
  let service: DynamicScriptService;

  beforeEach(() => {
    pool = createPoolStub();
    db = new Database(
      pool as unknown as ConstructorParameters<typeof Database>[0],
    );
    inquiry = createInquiryStub();
    variableExtractor = createVariableExtractorStub();
    completeness = createCompletenessStub();
    queue = createQueueStub();

    service = new DynamicScriptService(
      db,
      inquiry as any,
      variableExtractor as any,
      completeness as any,
      {} as any, // scriptGenerator
      {} as any, // validationOrchestrator
      {} as any, // evidenceBridge
      queue as any,
    );
  });

  // ── start ─────────────────────────────────────────────────────────

  test('start() creates a new session and returns the first question', async () => {
    const result = await service.start(TEST_USER_ID, {
      initial_input: '今天我和李明因为项目方案吵了一架',
      locale: 'zh-CN',
    } as any);

    expect(result.session_id).toBeDefined();
    expect(result.first_question).toBe('当时具体发生了什么？');
    expect(result.is_complete).toBe(false);
    expect(result.progress.scenario).toBeGreaterThan(0);

    expect(pool.sessions).toHaveLength(1);
    expect(pool.sessions[0].status).toBe('in_progress');
    expect(pool.sessions[0].turn_count).toBe(1); // first AI turn

    // conversation + progress must be persisted on the row
    const askFirstCalls = (inquiry.askFirstQuestion as jest.Mock).mock.calls[0];
    expect(askFirstCalls[0]).toBe('今天我和李明因为项目方案吵了一架');
    expect(askFirstCalls[1]).toBe('zh-CN');
  });

  test('start() is idempotent — resumes the existing in_progress session', async () => {
    const first = await service.start(TEST_USER_ID, {
      initial_input: '...',
      locale: 'zh-CN',
    } as any);

    // Second start on the same user should NOT create another session row.
    const second = await service.start(TEST_USER_ID, {
      initial_input: 'different text',
      locale: 'zh-CN',
    } as any);

    expect(second.session_id).toBe(first.session_id);
    expect(pool.sessions).toHaveLength(1);

    // askFirstQuestion is called only the first time
    expect(inquiry.askFirstQuestion).toHaveBeenCalledTimes(1);
  });

  // ── answer ────────────────────────────────────────────────────────

  test('answer() appends the user turn, calls askNextQuestion, and returns the next question', async () => {
    const start = await service.start(TEST_USER_ID, {
      initial_input: '...',
      locale: 'zh-CN',
    } as any);

    const result = await service.answer(TEST_USER_ID, start.session_id, {
      answer: '我们在周会上吵了起来',
    } as any);

    expect(result.is_complete).toBe(false);
    if (result.is_complete === false) {
      expect(result.next_question).toBe('你当时的感受是什么？');
      expect(result.estimated_turns_remaining).toBeGreaterThanOrEqual(0);
    }

    expect(inquiry.askNextQuestion).toHaveBeenCalledTimes(1);
    // completeness shouldTerminate(turnCount, progress) — verify call args.
    const termCalls = (completeness.shouldTerminate as jest.Mock).mock.calls[0];
    expect(termCalls[0]).toBe(1);
    expect(termCalls[1]).toEqual(
      expect.objectContaining({ scenario: expect.any(Number) }),
    );
  });

  test('answer() terminates when completeness says so and extracts variables', async () => {
    const start = await service.start(TEST_USER_ID, {
      initial_input: '...',
      locale: 'zh-CN',
    } as any);

    // Simulate: after this turn, completeness says we are done.
    completeness.shouldTerminate.mockReturnValueOnce(true);

    const result = await service.answer(TEST_USER_ID, start.session_id, {
      answer: '我愤怒地离开了会议室',
    } as any);

    expect(result.is_complete).toBe(true);
    if (result.is_complete === true) {
      expect(result.ready_to_generate).toBe(true);
      expect(result.extracted_variables.scenario_type).toBe('work');
    }

    // Variables must be persisted on the session row
    expect(pool.sessions[0].extracted_variables).not.toBeNull();
    expect(inquiry.extractVariables).toHaveBeenCalledTimes(1);
    const memStateCalls = (variableExtractor.appendToMemoryState as jest.Mock).mock.calls[0];
    expect(memStateCalls[0]).toBe(TEST_USER_ID);
    expect(memStateCalls[1]).toEqual(
      expect.objectContaining({ scenario_type: 'work' }),
    );
  });

  test('answer() rejects when session does not belong to the user', async () => {
    const start = await service.start(TEST_USER_ID, {
      initial_input: '...',
      locale: 'zh-CN',
    } as any);

    await expect(
      service.answer('user-2', start.session_id, { answer: 'x' } as any),
    ).rejects.toThrow(NotFoundException);
  });

  test('answer() rejects when session is no longer in_progress', async () => {
    const start = await service.start(TEST_USER_ID, {
      initial_input: '...',
      locale: 'zh-CN',
    } as any);

    pool.sessions[0].status = 'abandoned';

    await expect(
      service.answer(TEST_USER_ID, start.session_id, { answer: 'x' } as any),
    ).rejects.toThrow(ConflictException);
  });

  // ── complete ──────────────────────────────────────────────────────

  test('complete() inserts a generation row and enqueues a background job', async () => {
    const start = await service.start(TEST_USER_ID, {
      initial_input: '...',
      locale: 'zh-CN',
    } as any);

    // Pretend the user already finished the inquiry by setting
    // extracted_variables on the session row.
    pool.sessions[0].extracted_variables = makeExtractedVariables();

    const result = await service.complete(TEST_USER_ID, start.session_id, {} as any);

    expect(result.script_generation_id).toBeDefined();
    expect(result.status).toBe('pending');
    expect(result.estimated_total_seconds).toBeGreaterThan(0);

    expect(pool.generations).toHaveLength(1);
    expect(pool.generations[0].session_id).toBe(start.session_id);
    expect(pool.generations[0].status).toBe('pending');

    expect(queue.add).toHaveBeenCalledTimes(1);
    const queueCall = (queue.add as jest.Mock).mock.calls[0] as unknown as [
      string,
      string,
      Record<string, unknown>,
      { jobId?: string },
    ];
    const queueName = queueCall[0];
    const jobName = queueCall[1];
    const payload = queueCall[2];
    const opts = queueCall[3];
    expect(queueName).toBe('script-generation');
    expect(jobName).toBe('generate');
    expect(payload.generationId).toBe(result.script_generation_id);
    expect(opts.jobId).toBe(result.script_generation_id);

    expect(pool.sessions[0].status).toBe('completed');
    expect(pool.sessions[0].completed_at).not.toBeNull();
  });

  test('complete() reuses the generation and BullMQ job ID on a pending retry', async () => {
    const start = await service.start(TEST_USER_ID, {
      initial_input: '...',
      locale: 'zh-CN',
    } as any);
    pool.sessions[0].extracted_variables = makeExtractedVariables();

    const first = await service.complete(TEST_USER_ID, start.session_id, {} as any);
    const second = await service.complete(TEST_USER_ID, start.session_id, {} as any);

    expect(second.script_generation_id).toBe(first.script_generation_id);
    expect(pool.generations).toHaveLength(1);
    expect(queue.add).toHaveBeenCalledTimes(2);
    expect((queue.add as jest.Mock).mock.calls[1]?.[3]).toEqual({ jobId: first.script_generation_id });
  });

  test('complete() reuses a caller-supplied idempotency key', async () => {
    const start = await service.start(TEST_USER_ID, { initial_input: '...', locale: 'zh-CN' } as any);
    pool.sessions[0].extracted_variables = makeExtractedVariables();
    const req = { idempotency_key: 'same-operation' } as any;
    const first = await service.complete(TEST_USER_ID, start.session_id, req);
    const second = await service.complete(TEST_USER_ID, start.session_id, req);
    expect(first.script_generation_id).toBe(second.script_generation_id);
    expect(pool.generations).toHaveLength(1);
    expect((queue.add as jest.Mock).mock.calls[1]?.[3]).toEqual({ jobId: first.script_generation_id });
  });

  test('complete() retries the same pending job after an uncertain enqueue failure', async () => {
    const start = await service.start(TEST_USER_ID, {
      initial_input: '...', locale: 'zh-CN',
    } as any);
    pool.sessions[0].extracted_variables = makeExtractedVariables();
    (queue.add as jest.Mock).mockImplementationOnce(async () => { throw new Error('redis disconnected'); });

    await expect(service.complete(TEST_USER_ID, start.session_id, {} as any)).rejects.toThrow();
    expect(pool.generations).toHaveLength(1);
    expect(pool.generations[0].status).toBe('pending');
    expect(pool.sessions[0].status).toBe('in_progress');

    const retried = await service.complete(TEST_USER_ID, start.session_id, {} as any);
    expect(retried.script_generation_id).toBe(pool.generations[0].id);
    expect(queue.add).toHaveBeenCalledTimes(2);
    expect((queue.add as jest.Mock).mock.calls[1]?.[3]).toEqual({ jobId: pool.generations[0].id });
    expect(pool.sessions[0].status).toBe('completed');
  });

  test('complete() rejects when the inquiry is not finished', async () => {
    const start = await service.start(TEST_USER_ID, {
      initial_input: '...',
      locale: 'zh-CN',
    } as any);

    await expect(
      service.complete(TEST_USER_ID, start.session_id, {} as any),
    ).rejects.toThrow(ConflictException);
  });

  // ── status + result ───────────────────────────────────────────────

  test('getStatus() returns in_progress + current question for an active session', async () => {
    const start = await service.start(TEST_USER_ID, {
      initial_input: '...',
      locale: 'zh-CN',
    } as any);

    const status = await service.getStatus(TEST_USER_ID, start.session_id);

    expect(status.status).toBe('in_progress');
    expect(status.current_question).toBe('当时具体发生了什么？');
    expect(status.progress.scenario).toBeGreaterThan(0);
  });

  test('getStatus() exposes a completed extraction and pending job for safe resume', async () => {
    const start = await service.start(TEST_USER_ID, { initial_input: '...', locale: 'zh-CN' } as any);
    pool.sessions[0].extracted_variables = makeExtractedVariables();
    (queue.add as jest.Mock).mockImplementationOnce(async () => { throw new Error('redis disconnected'); });
    await expect(service.complete(TEST_USER_ID, start.session_id, {} as any)).rejects.toThrow();

    const status = await service.getStatus(TEST_USER_ID, start.session_id);
    expect(status.status).toBe('in_progress');
    expect(status.current_question).toBeUndefined();
    expect(status.extracted_variables?.scenario_type).toBe('work');
    expect(status.script_generation_id).toBe(pool.generations[0].id);
    expect(status.generation_status).toBe('pending');
  });

  test('getScriptResult() throws ConflictException until ready', async () => {
    const start = await service.start(TEST_USER_ID, {
      initial_input: '...',
      locale: 'zh-CN',
    } as any);
    pool.sessions[0].extracted_variables = makeExtractedVariables();

    const accepted = await service.complete(TEST_USER_ID, start.session_id, {} as any);

    await expect(
      service.getScriptResult(TEST_USER_ID, accepted.script_generation_id),
    ).rejects.toThrow(ConflictException);
  });

  test('getScriptResult() returns the result when status=ready', async () => {
    const start = await service.start(TEST_USER_ID, {
      initial_input: '...',
      locale: 'zh-CN',
    } as any);
    pool.sessions[0].extracted_variables = makeExtractedVariables();

    const accepted = await service.complete(TEST_USER_ID, start.session_id, {} as any);

    const readyResult = {
      script_id: 'script-1',
      script: {
        template_id: 'work-conflict-v1',
        scenes: [],
        metadata: {
          expected_duration_minutes: 6,
          dimension_coverage: ['conflictResponse'],
          variable_usage: { key_person_name: true },
        },
      },
      psychological_narrative: '故事讲完了...',
      comparison_summary: '与上次相比更冷静',
      validation_report: { results: [], has_critical_failure: false },
      revised: false,
    };
    pool.generations[0].status = 'ready';
    pool.generations[0].result = readyResult;
    pool.generations[0].ready_at = new Date();

    const result = await service.getScriptResult(
      TEST_USER_ID,
      accepted.script_generation_id,
    );

    expect(result.script_id).toBe('script-1');
    expect(result.script.template_id).toBe('work-conflict-v1');
    expect(result.psychological_narrative).toBe('故事讲完了...');
    expect(result.revised).toBe(false);
  });

  test.each([true, false])('getScriptResult exposes path only after completion (%s)', async (completed) => {
    const played_path = [{ scene_id: 's1', choice_id: 'c1' }];
    jest.spyOn(service, 'getScriptGenerationStatus').mockResolvedValue({ status: 'ready', result: { script_id: 'script-1' } } as any);
    pool.query.mockImplementationOnce(async () => ({ rows: [{ played_path, play_completed_at: completed ? new Date() : null }] }));
    const result = await service.getScriptResult(TEST_USER_ID, 'gen-1');
    if (completed) expect(result).toHaveProperty('played_path', played_path);
    else expect(result).not.toHaveProperty('played_path');
    expect(pool.query).toHaveBeenLastCalledWith(expect.stringContaining('FROM dynamic_scripts'), ['script-1', TEST_USER_ID, 'gen-1']);
  });

  // ── abortSession ──────────────────────────────────────────────────

  test('abortSession() flips status to abandoned and fails any in-flight generation rows', async () => {
    const start = await service.start(TEST_USER_ID, {
      initial_input: '...',
      locale: 'zh-CN',
    } as any);

    // Set extracted_variables so the precondition for complete() holds, but
    // we'll abort BEFORE calling complete() so the session stays in_progress
    // and the abort has visible effects.
    pool.sessions[0].extracted_variables = makeExtractedVariables();

    // Manually inject an in-flight generation row (status='pending') to
    // simulate "the worker hasn't picked it up yet, but the session is
    // about to be aborted by the user".
    pool.generations.push({
      id: 'gen-pending',
      session_id: start.session_id,
      user_id: TEST_USER_ID,
      status: 'pending',
      progress_percentage: 0,
      current_step: '已加入队列，等待生成',
      result: null,
      error: null,
      validation_report: null,
      revised: false,
      script_id: null,
      created_at: new Date(),
      started_at: null,
      ready_at: null,
      failed_at: null,
    });

    // Session is still in_progress (we never called complete()).
    expect(pool.sessions[0].status).toBe('in_progress');
    expect(pool.generations[0].status).toBe('pending');

    const cancelled = await service.abortSession(TEST_USER_ID, start.session_id, 'user_cancelled');

    expect(pool.sessions[0].status).toBe('abandoned');
    expect(pool.sessions[0].abandoned_at).not.toBeNull();

    // The in-flight generation row must be marked failed with the abort payload
    expect(pool.generations[0].status).toBe('failed');
    expect(pool.generations[0].failed_at).not.toBeNull();
    expect(pool.generations[0].error).toMatchObject({
      error: 'session_aborted',
      reason: 'user_cancelled',
    });
    expect(cancelled).toEqual({ status: 'abandoned', generation_cancelled: true });
  });

  test('abortSession() preserves a completed inquiry but cancels its pending generation', async () => {
    const start = await service.start(TEST_USER_ID, {
      initial_input: '...',
      locale: 'zh-CN',
    } as any);
    pool.sessions[0].extracted_variables = makeExtractedVariables();

    // complete() flips the session to 'completed'
    await service.complete(TEST_USER_ID, start.session_id, {} as any);
    expect(pool.sessions[0].status).toBe('completed');

    expect(pool.generations[0].status).toBe('pending');

    // A completed inquiry is not the same as a completed generation.
    const cancelled = await service.abortSession(TEST_USER_ID, start.session_id);
    expect(pool.sessions[0].status).toBe('completed');
    expect(pool.generations[0].status).toBe('failed');
    expect(pool.generations[0].error).toMatchObject({ error: 'session_aborted' });
    expect(cancelled).toEqual({ status: 'completed', generation_cancelled: true });
  });
});
