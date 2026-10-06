import { randomUUID } from 'node:crypto';
import { test, expect } from 'vitest';
import { Pool } from 'pg';
import { Database } from '../common/database.js';
import { DynamicScriptService } from '../modules/assessment/services/micro-sandbox/dynamic-script.service.js';
import { ScriptGenerationProcessor } from './script-generation.processor.js';

const url = process.env.EVA_TEST_DATABASE_URL;
const isolated = process.env.EVA_TEST_DATABASE_ISOLATED === '1';

test('dynamic generation cancellation, saving and concurrent first submit', async ({ skip }) => {
  if (!url || !isolated) skip();
  const pool = new Pool({ connectionString: url! });
  const db = new Database(pool as any);
  const userId = randomUUID();
  const otherUserId = randomUUID();
  const sessionId = randomUUID();
  const generationId = randomUUID();
  const variables = {
    scenario_type: 'work', trigger_event: 'test', primary_emotion: 'concern',
    emotion_intensity: 0.5, emotional_response: 'pause', key_persons: [], coping_strategy: 'reflect',
  };
  try {
    await pool.query('INSERT INTO users (id, email) VALUES ($1, $2)', [userId, `dynamic-cancel-${userId}@example.invalid`]);
    await pool.query(
      `INSERT INTO dynamic_script_sessions
         (id, user_id, initial_input, conversation, progress, turn_count, status, locale, extracted_variables)
       VALUES ($1, $2, 'test', '[]', '{}', 1, 'completed', 'zh-CN', $3)`,
      [sessionId, userId, JSON.stringify(variables)],
    );
    await pool.query(
      `INSERT INTO dynamic_script_generations (id, session_id, user_id, status)
       VALUES ($1, $2, $3, 'pending')`,
      [generationId, sessionId, userId],
    );

    const service = new DynamicScriptService(db, {} as any, {} as any, {} as any, {} as any, {} as any, {} as any, {} as any);
    const cancelled = await service.abortSession(userId, sessionId);
    expect(cancelled).toEqual({ status: 'completed', generation_cancelled: true });

    let modelCalls = 0;
    const processor = new ScriptGenerationProcessor(
      db,
      { generateScript: async () => { modelCalls++; throw new Error('must not run'); } } as any,
      {} as any,
      { accumulate: async () => undefined, flushIfReady: async () => undefined } as any,
    );
    await processor.process({ generationId, sessionId, userId });
    const state = await pool.query<{ status: string; error: { error: string } }>(
      'SELECT status, error FROM dynamic_script_generations WHERE id = $1', [generationId],
    );
    const scripts = await pool.query<{ count: string }>(
      'SELECT count(*) FROM dynamic_scripts WHERE generation_id = $1', [generationId],
    );
    expect(modelCalls).toBe(0);
    expect(state.rows[0].status).toBe('failed');
    expect(state.rows[0].error.error).toBe('session_aborted');
    expect(Number(scripts.rows[0].count)).toBe(0);

    // A fresh generation must still traverse the new saving constraint and commit ready.
    const freshId = randomUUID();
    await pool.query(
      `INSERT INTO dynamic_script_generations (id, session_id, user_id, status)
       VALUES ($1, $2, $3, 'pending')`,
      [freshId, sessionId, userId],
    );
    const script = { template_id: 'test', scenes: [], metadata: {} };
    const readyProcessor = new ScriptGenerationProcessor(
      db,
      { generateScript: async () => script } as any,
      { validate: async () => ({ results: [], has_critical_failure: false, aggregated_issues_for_revision: [] }), shouldRevise: () => false } as any,
      { accumulate: async () => undefined, flushIfReady: async () => undefined } as any,
    );
    await readyProcessor.process({ generationId: freshId, sessionId, userId });
    const ready = await pool.query<{ status: string; script_id: string }>(
      'SELECT status, script_id FROM dynamic_script_generations WHERE id = $1', [freshId],
    );
    const saved = await pool.query<{ count: string }>(
      'SELECT count(*) FROM dynamic_scripts WHERE generation_id = $1', [freshId],
    );
    expect(ready.rows[0].status).toBe('ready');
    expect(ready.rows[0].script_id).toBeTruthy();
    expect(Number(saved.rows[0].count)).toBe(1);

    const interruptedId = randomUUID();
    await pool.query(
      `INSERT INTO dynamic_script_generations (id, session_id, user_id, status)
       VALUES ($1, $2, $3, 'pending')`,
      [interruptedId, sessionId, userId],
    );
    let modelStarted!: () => void;
    let finishModel!: (value: typeof script) => void;
    const started = new Promise<void>((resolve) => { modelStarted = resolve; });
    const modelResult = new Promise<typeof script>((resolve) => { finishModel = resolve; });
    let validationCalls = 0;
    const interruptedProcessor = new ScriptGenerationProcessor(
      db,
      { generateScript: async () => { modelStarted(); return modelResult; } } as any,
      { validate: async () => { validationCalls++; return {}; }, shouldRevise: () => false } as any,
      { accumulate: async () => undefined, flushIfReady: async () => undefined } as any,
    );
    const processing = interruptedProcessor.process({ generationId: interruptedId, sessionId, userId });
    await started;
    const interrupted = await service.abortSession(userId, sessionId);
    expect(interrupted.generation_cancelled).toBe(true);
    finishModel(script);
    await processing;
    const final = await pool.query<{ status: string; error: { error: string } }>(
      'SELECT status, error FROM dynamic_script_generations WHERE id = $1', [interruptedId],
    );
    const interruptedScripts = await pool.query<{ count: string }>(
      'SELECT count(*) FROM dynamic_scripts WHERE generation_id = $1', [interruptedId],
    );
    expect(final.rows[0].status).toBe('failed');
    expect(final.rows[0].error.error).toBe('session_aborted');
    expect(validationCalls).toBe(0);
    expect(Number(interruptedScripts.rows[0].count)).toBe(0);

    const concurrentSessionId = randomUUID();
    await pool.query(
      `INSERT INTO dynamic_script_sessions
         (id, user_id, initial_input, conversation, progress, turn_count, status, locale, extracted_variables)
       VALUES ($1, $2, 'test', '[]', '{}', 1, 'in_progress', 'zh-CN', $3)`,
      [concurrentSessionId, userId, JSON.stringify(variables)],
    );
    const queuedIds: string[] = [];
    const concurrentService = new DynamicScriptService(
      db, {} as any, {} as any, {} as any, {} as any, {} as any, {} as any,
      { add: async (_queue: string, _name: string, _payload: unknown, opts: { jobId: string }) => {
        queuedIds.push(opts.jobId);
        return opts.jobId;
      } } as any,
    );
    const responses = await Promise.all([
      concurrentService.complete(userId, concurrentSessionId, {} as any),
      concurrentService.complete(userId, concurrentSessionId, {} as any),
    ]);
    const concurrentRows = await pool.query<{ id: string }>(
      `SELECT id FROM dynamic_script_generations
       WHERE session_id = $1 AND status <> 'failed'`, [concurrentSessionId],
    );
    expect(concurrentRows.rows).toHaveLength(1);
    expect(responses[0].script_generation_id).toBe(responses[1].script_generation_id);
    expect(new Set(queuedIds)).toEqual(new Set([concurrentRows.rows[0].id]));

    await pool.query('INSERT INTO users (id, email) VALUES ($1, $2)',
      [otherUserId, `dynamic-other-${otherUserId}@example.invalid`]);
    const otherSessionId = randomUUID();
    await pool.query(
      `INSERT INTO dynamic_script_sessions
         (id, user_id, initial_input, conversation, progress, turn_count, status, locale, extracted_variables)
       VALUES ($1, $2, 'private', '[]', '{}', 1, 'completed', 'zh-CN', $3)`,
      [otherSessionId, otherUserId, JSON.stringify(variables)],
    );
    const mismatchedId = randomUUID();
    await pool.query(
      `INSERT INTO dynamic_script_generations (id, session_id, user_id, status)
       VALUES ($1, $2, $3, 'pending')`,
      [mismatchedId, concurrentSessionId, userId],
    );
    let crossUserModelCalls = 0;
    const mismatchedProcessor = new ScriptGenerationProcessor(
      db,
      { generateScript: async () => { crossUserModelCalls++; throw new Error('must not run'); } } as any,
      {} as any,
      { accumulate: async () => undefined, flushIfReady: async () => undefined } as any,
    );
    await mismatchedProcessor.process({ generationId: mismatchedId, sessionId: otherSessionId, userId });
    expect(crossUserModelCalls).toBe(0);
    const mismatchedState = await pool.query<{ status: string; error: { error: string } }>(
      'SELECT status, error FROM dynamic_script_generations WHERE id = $1', [mismatchedId],
    );
    expect(mismatchedState.rows[0].status).toBe('failed');
    expect(mismatchedState.rows[0].error.error).toBe('job_scope_mismatch');
  } finally {
    await pool.query('DELETE FROM users WHERE id = $1', [otherUserId]);
    await pool.query('DELETE FROM users WHERE id = $1', [userId]);
    await pool.end();
  }
});
