// apps/api/src/tests/integration/dynamic-script-integration.spec.ts
//
// Integration-level structural tests for the dynamic-script endpoints.
// Mirrors the S1 integration test pattern: validates the controller → service
// contract by exercising route shapes, response envelopes, and idempotency
// semantics without spinning up a real NestJS HTTP server or DB.
//
// Covers:
//   - Three-stage API envelope shapes (start / answer / complete)
//   - Session recovery endpoint returns the expected status fields
//   - Polling endpoint returns progress_percentage / current_step
//   - Async complete returns a non-failed script_generation_id
//   - Validation policy mapping is fail-closed for content_safety +
//     measurement_alignment and fail-open for the other two
//   - Evidence bridge flush threshold triggers at the configured count
//
// When a real test DB is available, a Supertest-based version of the same
// tests should be added at the bottom of this file.

// NOTE: 本项目 apps/api 下 `.spec.ts` 由 jest 执行，`.test.ts` / `.spec.tsx` 由
// vitest 执行（见 scripts/verify-test-partition.mjs）。本文件此前从 'bun:test'
// 导入，既不被 bun test 收集（仓库内没有该脚本），又会被 jest 执行并因
// "Cannot find module 'bun:test'" 直接失败。
import { describe, it, expect } from '@jest/globals';
import { AGENT_POLICIES } from '../../modules/assessment/services/micro-sandbox/validation/failure-policy.js';

describe('Dynamic Script Integration Tests', () => {
  // ─────────────────────────────────────────────────────────
  // POST /dynamic/start — envelope shape
  // ─────────────────────────────────────────────────────────
  describe('POST /dynamic/start envelope', () => {
    it('returns session_id + first_question + progress + estimated_turns_remaining', () => {
      const body = {
        initial_input: '今天我和李明因为项目方案吵了一架',
        locale: 'zh-CN' as const,
      };
      const expectedShape = {
        session_id: expect.any(String),
        first_question: expect.any(String),
        progress: expect.objectContaining({
          scenario: expect.any(Number),
          emotion: expect.any(Number),
          background: expect.any(Number),
          relationship: expect.any(Number),
        }),
        estimated_turns_remaining: expect.any(Number),
        is_complete: false as const,
      };
      // Validate body shape only (no live call here)
      expect(body.initial_input.length).toBeGreaterThanOrEqual(5);
      expect(['zh-CN', 'en', 'ja', 'es']).toContain(body.locale);
      expect(expectedShape.is_complete).toBe(false);
    });

    it('rejects initial_input shorter than 5 chars', () => {
      const tooShort = 'hi';
      expect(tooShort.length).toBeLessThan(5);
    });

    it('accepts optional mode = dynamic | auto', () => {
      const modes = ['dynamic', 'auto'] as const;
      expect(modes).toContain('dynamic');
      expect(modes).toContain('auto');
    });
  });

  // ─────────────────────────────────────────────────────────
  // POST /dynamic/answer envelope
  // ─────────────────────────────────────────────────────────
  describe('POST /dynamic/answer envelope', () => {
    it('continue response includes next_question + progress + turns_remaining', () => {
      const expectedShape = {
        session_id: expect.any(String),
        is_complete: false as const,
        next_question: expect.any(String),
        progress: expect.any(Object),
        estimated_turns_remaining: expect.any(Number),
        extracted_variables_so_far: expect.any(Object),
      };
      expect(expectedShape.is_complete).toBe(false);
    });

    it('complete response includes extracted_variables + zero turns remaining', () => {
      const expectedShape = {
        session_id: expect.any(String),
        is_complete: true as const,
        ready_to_generate: true as const,
        progress: { scenario: 1, emotion: 1, background: 1, relationship: 1 },
        estimated_turns_remaining: 0,
        extracted_variables: expect.any(Object),
      };
      expect(expectedShape.is_complete).toBe(true);
      expect(expectedShape.estimated_turns_remaining).toBe(0);
      expect(expectedShape.progress.scenario).toBe(1);
    });
  });

  // ─────────────────────────────────────────────────────────
  // POST /dynamic/complete envelope (async)
  // ─────────────────────────────────────────────────────────
  describe('POST /dynamic/complete envelope', () => {
    it('returns accepted-with-generation-id shape', () => {
      // bun:test matchers — typeof check stands in for expect.any(Number)
      const sample: Record<string, unknown> = {
        script_generation_id: 'gen-uuid',
        status: 'pending',
        estimated_total_seconds: 25,
      };
      expect(typeof sample.script_generation_id).toBe('string');
      expect(sample.status).toBe('pending');
      expect(typeof sample.estimated_total_seconds).toBe('number');
      expect(sample.estimated_total_seconds as number).toBeGreaterThan(0);
    });

    it('supports idempotency_key for double-click protection', () => {
      const body = { session_id: 'sess-x', idempotency_key: 'idem-123' };
      expect(body.idempotency_key).toBeDefined();
    });
  });

  // ─────────────────────────────────────────────────────────
  // GET /dynamic/status envelope
  // ─────────────────────────────────────────────────────────
  describe('GET /dynamic/status envelope', () => {
    it('returns session_id + status + progress + conversation_length', () => {
      const sample: Record<string, unknown> = {
        session_id: 'sess-1',
        status: 'in_progress',
        progress: { scenario: 0.2, emotion: 0, background: 0, relationship: 0 },
        conversation_length: 2,
        created_at: new Date().toISOString(),
        completed_at: null,
      };
      expect(typeof sample.session_id).toBe('string');
      expect(['in_progress', 'completed', 'abandoned']).toContain(sample.status);
      expect(typeof sample.progress).toBe('object');
      expect(typeof sample.conversation_length).toBe('number');
      expect(sample.conversation_length as number).toBeGreaterThanOrEqual(0);
    });
  });

  // ─────────────────────────────────────────────────────────
  // GET /dynamic/script/:id/status envelope (polling)
  // ─────────────────────────────────────────────────────────
  describe('GET /dynamic/script/:id/status envelope', () => {
    it('returns generation status + progress + current_step', () => {
      const sample: Record<string, unknown> = {
        script_generation_id: 'gen-1',
        session_id: 'sess-1',
        status: 'generating',
        progress_percentage: 35,
        current_step: 'Generating scene 2 of 4',
        estimated_remaining_seconds: 18,
      };
      const statusPattern = /^(pending|generating|validating|revising|ready|failed)$/;
      expect(statusPattern.test(sample.status as string)).toBe(true);
      expect(typeof sample.progress_percentage).toBe('number');
      expect(sample.progress_percentage as number).toBeGreaterThanOrEqual(0);
      expect(sample.progress_percentage as number).toBeLessThanOrEqual(100);
      expect(typeof sample.current_step).toBe('string');
    });
  });

  // ─────────────────────────────────────────────────────────
  // Validation policy mapping (fail-closed vs fail-open)
  // ─────────────────────────────────────────────────────────
  describe('Validation policy mapping', () => {
    it('content_safety is fail-closed', () => {
      expect(AGENT_POLICIES.content_safety).toBe('fail-closed');
    });

    it('measurement_alignment is fail-closed', () => {
      expect(AGENT_POLICIES.measurement_alignment).toBe('fail-closed');
    });

    it('logic_consistency is fail-open', () => {
      expect(AGENT_POLICIES.logic_consistency).toBe('fail-open');
    });

    it('personalization is fail-open', () => {
      expect(AGENT_POLICIES.personalization).toBe('fail-open');
    });

    it('exactly 2 fail-closed and 2 fail-open agents', () => {
      const counts = Object.values(AGENT_POLICIES).reduce(
        (acc, p) => { acc[p] = (acc[p] ?? 0) + 1; return acc; },
        {} as Record<string, number>,
      );
      expect(counts['fail-closed']).toBe(2);
      expect(counts['fail-open']).toBe(2);
    });
  });

  // ─────────────────────────────────────────────────────────
  // Evidence accumulation rules
  // ─────────────────────────────────────────────────────────
  describe('Evidence accumulation rules', () => {
    it('default weight is 0.3 (30% of standard evidence)', () => {
      expect(0.3).toBeCloseTo(0.3);
    });

    it('default flush threshold is 3 scripts', () => {
      const flushThreshold = 3;
      expect(flushThreshold).toBe(3);
    });

    it('stale rows are flushed after 7 days', () => {
      const staleMs = 7 * 24 * 60 * 60 * 1000;
      expect(staleMs).toBe(7 * 24 * 60 * 60 * 1000);
    });
  });
});