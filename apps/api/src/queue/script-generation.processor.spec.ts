// apps/api/src/queue/script-generation.processor.spec.ts
//
// Tests for ScriptGenerationProcessor. Strategy:
//
//   1. Lifecycle test — verifies the status column on
//      dynamic_script_generations transitions through
//      generating → validating → ready (and revising when shouldRevise()
//      returns true), and that a ScriptBlockedException transitions
//      to failed with `script_validation_failed`.
//
//   2. RLS test — verifies every db.pool.query call happens INSIDE a
//      runWithToken() callback whose first arg is the user's id.
//      This is the critical review fix #1: without runWithToken the
//      AsyncLocalStorage has no session token at worker startup, so
//      the SELECT against dynamic_script_sessions returns zero rows
//      and the worker can't see the user's variables.
//
//   3. revise() test — verifies aggregated_issues_for_revision from the
//      validation report is actually forwarded into the system prompt
//      fed to M3 (i.e. ScriptGeneratorService.generateScript receives
//      a non-empty `revisionIssues` array). This is review fix #2.
//
// We mock Database, ScriptGeneratorService, ValidationOrchestrator, and
// EvidenceBridgeService — no live API keys or DB required.

import { describe, test, expect, beforeEach, jest } from '@jest/globals';
import { ScriptGenerationProcessor } from './script-generation.processor.js';
import type { Database } from '../common/database.js';
import type { ScriptGeneratorService } from '../modules/assessment/services/micro-sandbox/script-generator.service.js';
import type { ValidationOrchestrator } from '../modules/assessment/services/micro-sandbox/validation/orchestrator.js';
import { ScriptBlockedException } from '../modules/assessment/services/micro-sandbox/validation/orchestrator.js';
import type { ValidationReport } from '../modules/assessment/services/micro-sandbox/validation/failure-policy.js';
import type { EvidenceBridgeService } from '../modules/assessment/services/micro-sandbox/evidence-bridge.service.js';
import { EvidenceService } from '../modules/evidence/evidence.service.js';

test('worker factory wires the real evidence writer to persist candidate evidence', async () => {
  const query = jest.fn(async (_sql: string, _values?: unknown[]) => ({ rows: [{ id: 'evidence' }] }));
  const processor = ScriptGenerationProcessor.createForWorker({ pool: { query, connect: jest.fn(async () => { throw new Error('unexpected connect'); }) }, env: { DYNAMIC_SCRIPT_API_KEY: 'test-only-no-provider-call' } });
  const writer = (processor as any).evidenceBridge.evidenceService;
  expect(writer).toBeInstanceOf(EvidenceService);
  await writer.writeEvidence({ userId: 'user', dimension: 'work', explanation: 'choice', evidenceKind: 'practice', candidate: true });
  expect(query).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO evidence_events'), expect.any(Array));
});

// ─── Test doubles ───────────────────────────────────────────────────────────

/**
 * Mock Database that records every runWithToken call and the SQL
 * that fires inside each one. We then assert that:
 *   - runWithToken was invoked at least once
 *   - the first arg of every runWithToken call equals userId
 *   - at least one db.pool.query ran INSIDE runWithToken
 *
 * The mock query() returns a different row shape depending on the SQL
 * fragment so the processor can complete the full lifecycle in test:
 *   - SELECT against dynamic_script_sessions  →  extracted_variables + locale
 *   - INSERT into dynamic_scripts             →  { id: 'script-id-123' }
 *   - everything else                         →  empty rows
 */
function makeMockDb() {
  const statusUpdates: Array<{ sql: string; params: unknown[] }> = [];
  const tokenCalls: Array<{ userId: string; ranQueries: number }> = [];
  let generationStatus = 'pending';
  let generationVisible = true;
  let tracker: { userId: string; ranQueries: number } | null = null;
  let cancelBeforeSave = false;

  const fakeSessionRow = {
    extracted_variables: {
      scenario_type: 'work',
      trigger_event: '李明公开质疑我的市场分析',
      primary_emotion: '愤怒',
      emotion_intensity: 0.8,
      emotional_response: '觉得不被尊重',
      key_persons: [{ name: '李明', relationship: '5年同事', relationship_quality: 0.3 }],
      coping_strategy: '沉默离开',
    },
    locale: 'zh-CN',
  };

  const query = async (sql: string, params: unknown[] = []) => {
    if (!tracker) throw new Error('query outside runWithToken');
    tracker.ranQueries++;
    statusUpdates.push({ sql, params });
    if (/FROM dynamic_script_sessions/.test(sql)) return { rows: [fakeSessionRow] };
    if (/SELECT session_id, status FROM dynamic_script_generations/.test(sql)) {
      return { rows: generationVisible
        ? [{ session_id: (params[0] as string).replace(/^gen-/, 'sess-'), status: generationStatus }]
        : [] };
    }
    if (/SELECT status FROM dynamic_script_generations/.test(sql)) {
      if (cancelBeforeSave) generationStatus = 'failed';
      return { rows: [{ status: generationStatus }] };
    }
    if (/UPDATE dynamic_script_generations/.test(sql)) {
      const nextStatus = params[0] as string;
      const expected = /status = ANY/.test(sql) ? params[6] as string[]
        : /status = 'saving'/.test(sql) ? ['saving']
        : ['pending', 'generating', 'validating', 'revising', 'saving'];
      if (!expected.includes(generationStatus)) return { rows: [] };
      generationStatus = nextStatus;
      return { rows: [{ id: 'gen-1' }] };
    }
    if (/INSERT INTO dynamic_scripts/.test(sql)) return { rows: [{ id: 'script-id-123' }] };
    return { rows: [] };
  };
  const db = {
    runWithToken: jest.fn(async (userId: string, fn: () => Promise<unknown>) => {
      tracker = { userId, ranQueries: 0 };
      tokenCalls.push(tracker);
      try { return await fn(); } finally { tracker = null; }
    }),
    pool: {
      query,
      connect: async () => ({ query, release: () => undefined }),
    },
  } as unknown as Database;

  return {
    db, statusUpdates, tokenCalls,
    cancel: () => { generationStatus = 'failed'; },
    hideGeneration: () => { generationVisible = false; },
    cancelAtSave: () => { cancelBeforeSave = true; },
    status: () => generationStatus,
  };
}

function makeMockScriptGenerator() {
  const calls: Array<{ revisionIssues?: unknown[] }> = [];
  return {
    service: {
      generateScript: jest.fn(async (_variables: unknown, _locale: string, revisionIssues?: unknown[]) => {
        calls.push({ revisionIssues });
        return {
          template_id: 'work-conflict-v1',
          scenes: [
            {
              scene_id: 'scene-1',
              scene_number: 1,
              narrative: '你在周会上，李明公开质疑你的市场分析。',
              choices: [
                {
                  choice_id: 'a',
                  text: '当场反驳',
                  dimension_signals: { conflictResponse: 0.8 },
                  weight: 1,
                },
              ],
              next_scene_map: { a: 'scene-2' },
            },
          ],
          metadata: {
            expected_duration_minutes: 5,
            dimension_coverage: ['conflictResponse'],
            variable_usage: { key_person_name: true },
          },
        };
      }),
    } as unknown as ScriptGeneratorService,
    calls,
  };
}

function makeMockValidationOrchestrator(opts: {
  shouldRevise?: boolean;
  aggregatedIssues?: unknown[];
  throwBlocked?: boolean;
} = {}) {
  const { shouldRevise = false, aggregatedIssues = [], throwBlocked = false } = opts;

  const report: ValidationReport = {
    results: [],
    has_critical_failure: shouldRevise,
    aggregated_issues_for_revision: aggregatedIssues as ValidationReport['aggregated_issues_for_revision'],
  };

  return {
    service: {
      validate: jest.fn(async () => {
        if (throwBlocked) {
          // Synthetic throw to exercise the failure path
          throw new ScriptBlockedException('test block');
        }
        return report;
      }),
      shouldRevise: jest.fn(() => shouldRevise),
    } as unknown as ValidationOrchestrator,
    report,
  };
}

function makeMockEvidenceBridge() {
  return {
    accumulate: jest.fn(async () => undefined),
    flushIfReady: jest.fn(async () => undefined),
  } as unknown as EvidenceBridgeService;
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('ScriptGenerationProcessor', () => {
  let processor: ScriptGenerationProcessor;
  let mocks: ReturnType<typeof makeMockDb>;
  let gen: ReturnType<typeof makeMockScriptGenerator>;
  let val: ReturnType<typeof makeMockValidationOrchestrator>;
  let bridge: ReturnType<typeof makeMockEvidenceBridge>;

  beforeEach(() => {
    mocks = makeMockDb();
    gen = makeMockScriptGenerator();
    val = makeMockValidationOrchestrator();
    bridge = makeMockEvidenceBridge();
    processor = new ScriptGenerationProcessor(mocks.db, gen.service, val.service, bridge);
  });

  test('runs the full lifecycle when validation passes (no revision)', async () => {
    await processor.process({
      generationId: 'gen-1',
      sessionId: 'sess-1',
      userId: 'user-1',
    });

    const statuses = mocks.statusUpdates
      .filter((u) => u.sql.includes('UPDATE dynamic_script_generations'))
      .map((u) => u.params[0]);

    expect(statuses).toContain('generating');
    expect(statuses).toContain('validating');
    expect(statuses).toContain('ready');
    expect(statuses).not.toContain('revising');
    expect(mocks.status()).toBe('ready');
  });

  test('does not validate or save when cancelled during generation', async () => {
    const originalGenerate = gen.service.generateScript.bind(gen.service);
    gen.service.generateScript = jest.fn(async (...args: Parameters<ScriptGeneratorService['generateScript']>) => {
      const result = await originalGenerate(...args);
      mocks.cancel();
      return result;
    }) as ScriptGeneratorService['generateScript'];

    await processor.process({ generationId: 'gen-1', sessionId: 'sess-1', userId: 'user-1' });

    expect(mocks.status()).toBe('failed');
    expect(val.service.validate).not.toHaveBeenCalled();
    expect(mocks.statusUpdates.some((u) => /INSERT INTO dynamic_scripts/.test(u.sql))).toBe(false);
  });

  test('does not start model work when cancelled before pickup', async () => {
    mocks.cancel();
    await processor.process({ generationId: 'gen-1', sessionId: 'sess-1', userId: 'user-1' });
    expect(gen.service.generateScript).not.toHaveBeenCalled();
    expect(mocks.status()).toBe('failed');
  });

  test('does not acknowledge an invisible generation as a successful BullMQ job', async () => {
    mocks.hideGeneration();
    await expect(processor.process({ generationId: 'gen-1', sessionId: 'sess-1', userId: 'user-1' }))
      .rejects.toThrow('generation_not_visible');
    expect(gen.service.generateScript).not.toHaveBeenCalled();
  });

  test('scopes worker reads and status writes to the queued user and session', async () => {
    await processor.process({ generationId: 'gen-1', sessionId: 'sess-1', userId: 'user-1' });
    const sessionRead = mocks.statusUpdates.find((u) => /FROM dynamic_script_sessions/.test(u.sql));
    expect(sessionRead?.sql).toMatch(/WHERE id = \$1 AND user_id = \$2/);
    expect(sessionRead?.params).toEqual(['sess-1', 'user-1']);
    const phaseWrites = mocks.statusUpdates.filter((u) => /UPDATE dynamic_script_generations/.test(u.sql)
      && /status = ANY/.test(u.sql));
    expect(phaseWrites.length).toBeGreaterThan(0);
    for (const write of phaseWrites) {
      expect(write.sql).toMatch(/user_id = \$5 AND session_id = \$6/);
      expect(write.params[4]).toBe('user-1');
      expect(write.params[5]).toBe('sess-1');
    }
  });

  test('does not insert a script when cancelled before final row lock', async () => {
    mocks.cancelAtSave();
    await processor.process({ generationId: 'gen-1', sessionId: 'sess-1', userId: 'user-1' });
    expect(mocks.status()).toBe('failed');
    expect(mocks.statusUpdates.some((u) => /INSERT INTO dynamic_scripts/.test(u.sql))).toBe(false);
  });

  test('enters revising phase when validator demands a revision', async () => {
    val = makeMockValidationOrchestrator({
      shouldRevise: true,
      aggregatedIssues: [
        {
          description: 'choice-a is unsafe',
          location: 'scene-1.choice-a',
          suggestion: 'soften the wording',
          agent_name: 'content_safety',
          severity: 'critical',
        },
      ],
    });
    processor = new ScriptGenerationProcessor(mocks.db, gen.service, val.service, bridge);

    await processor.process({
      generationId: 'gen-2',
      sessionId: 'sess-2',
      userId: 'user-2',
    });

    const statuses = mocks.statusUpdates
      .filter((u) => u.sql.includes('UPDATE dynamic_script_generations'))
      .map((u) => u.params[0]);

    expect(statuses).toContain('revising');
    expect(statuses).toContain('ready');

    // Confirm revise() actually forwarded the issues to the generator.
    expect(gen.calls.length).toBeGreaterThanOrEqual(2);
    const revisionCall = gen.calls.find((c) => c.revisionIssues && c.revisionIssues.length > 0);
    expect(revisionCall).toBeDefined();
    expect(revisionCall!.revisionIssues).toHaveLength(1);
    expect(revisionCall!.revisionIssues![0]).toMatchObject({
      description: 'choice-a is unsafe',
      agent_name: 'content_safety',
      severity: 'critical',
    });
  });

  test('marks generation failed when a fail-closed validator throws', async () => {
    val = makeMockValidationOrchestrator({ throwBlocked: true });
    processor = new ScriptGenerationProcessor(mocks.db, gen.service, val.service, bridge);

    await processor.process({
      generationId: 'gen-3',
      sessionId: 'sess-3',
      userId: 'user-3',
    });

    const failedUpdate = mocks.statusUpdates.find(
      (u) => u.sql.includes('UPDATE dynamic_script_generations') && u.params[0] === 'failed',
    );
    expect(failedUpdate).toBeDefined();
    // params: [status, step, errorJSON, generationId] — error JSON is at index 2
    const errorBlob = JSON.parse(failedUpdate!.params[2] as string);
    expect(errorBlob.error).toBe('script_validation_failed');
    expect(errorBlob.user_options).toContain('change_topic');
  });

  test('retains the legacy worker context for database calls without treating it as RLS proof', async () => {
    await processor.process({
      generationId: 'gen-4',
      sessionId: 'sess-4',
      userId: 'user-4',
    });

    // At minimum, runWithToken was called once with the user's id.
    expect(mocks.tokenCalls.length).toBeGreaterThanOrEqual(1);
    for (const call of mocks.tokenCalls) {
      expect(call.userId).toBe('user-4');
      // Inside that runWithToken, the processor should have issued >= 1 query.
      expect(call.ranQueries).toBeGreaterThan(0);
    }

    // Every pool.query call in statusUpdates should originate from inside
    // runWithToken — i.e. the total count matches.
    const totalPoolQueries = mocks.tokenCalls.reduce((acc, c) => acc + c.ranQueries, 0);
    expect(totalPoolQueries).toBeGreaterThan(0);
    expect(totalPoolQueries).toBe(mocks.statusUpdates.length);
  });

  test('passes aggregated_issues_for_revision into the system prompt on revise (review-fix #2)', async () => {
    const issues = [
      {
        description: 'dimension_signal missing for shameSensitivity',
        location: 'scene-2.choice-b',
        suggestion: 'add shameSensitivity signal',
        agent_name: 'measurement_alignment',
        severity: 'critical',
      },
      {
        description: 'narrative doesn\'t reference user\'s key person',
        location: 'scene-3',
        suggestion: 'include {{key_person_name}}',
        agent_name: 'personalization',
        severity: 'critical',
      },
    ];

    val = makeMockValidationOrchestrator({
      shouldRevise: true,
      aggregatedIssues: issues,
    });
    processor = new ScriptGenerationProcessor(mocks.db, gen.service, val.service, bridge);

    await processor.process({
      generationId: 'gen-5',
      sessionId: 'sess-5',
      userId: 'user-5',
    });

    // Find the call to generateScript that carried revisionIssues.
    const revisionCall = gen.calls.find((c) => c.revisionIssues && c.revisionIssues.length > 0);
    expect(revisionCall).toBeDefined();

    // The forwarded issues must include BOTH issues verbatim — not empty,
    // not truncated to just the first one.
    expect(revisionCall!.revisionIssues).toHaveLength(2);
    expect(revisionCall!.revisionIssues![0]).toMatchObject({
      description: 'dimension_signal missing for shameSensitivity',
      agent_name: 'measurement_alignment',
    });
    expect(revisionCall!.revisionIssues![1]).toMatchObject({
      description: 'narrative doesn\'t reference user\'s key person',
      agent_name: 'personalization',
    });
  });
});
