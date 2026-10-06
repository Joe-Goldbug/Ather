// apps/api/src/modules/assessment/dynamic-script.controller.spec.ts
//
// Hermetic controller tests — the controller is a thin HTTP wrapper that
// delegates to DynamicScriptService. We mock the service so each route is
// tested for shape (request → service arg mapping, response passthrough)
// without needing a real DB or LLM.

import { describe, test, expect, beforeEach, jest } from '@jest/globals';
import { DynamicScriptController } from './dynamic-script.controller.js';
import { DynamicScriptService } from './services/micro-sandbox/dynamic-script.service.js';
import { DynamicScriptPlaybackService } from './services/micro-sandbox/dynamic-script-playback.service.js';
import { AuthGuard } from '../auth/auth.guard.js';
import { GUARDS_METADATA, PATH_METADATA, METHOD_METADATA } from '@nestjs/common/constants';
import { RequestMethod } from '@nestjs/common';

function makeService(): jest.Mocked<DynamicScriptService> {
  return {
    start: jest.fn(async () => ({
      session_id: 'sess-1',
      first_question: '能告诉我发生了什么吗?',
      progress: { scenario: 0.1, emotion: 0, background: 0, relationship: 0 },
      estimated_turns_remaining: 4,
      is_complete: false as const,
    })) as any,
    answer: jest.fn(async () => ({
      session_id: 'sess-1',
      next_question: '你当时感觉怎么样?',
      progress: { scenario: 0.2, emotion: 0.3, background: 0, relationship: 0 },
      estimated_turns_remaining: 3,
      is_complete: false as const,
      extracted_variables_so_far: {},
    })) as any,
    complete: jest.fn(async () => ({
      script_generation_id: 'gen-1',
      status: 'pending' as const,
      estimated_total_seconds: 25,
    })) as any,
    abortSession: jest.fn(async () => ({ status: 'abandoned', generation_cancelled: false })) as any,
    getStatus: jest.fn(async () => ({
      session_id: 'sess-1',
      status: 'in_progress' as const,
      current_question: '能告诉我发生了什么吗?',
      progress: { scenario: 0.1, emotion: 0, background: 0, relationship: 0 },
      conversation_length: 1,
      created_at: new Date('2026-07-26T00:00:00Z'),
      completed_at: null,
    })) as any,
    getScriptGenerationStatus: jest.fn(async () => ({
      script_generation_id: 'gen-1',
      session_id: 'sess-1',
      status: 'generating' as const,
      progress_percentage: 35,
      current_step: 'Generating scene 2 of 4',
      estimated_remaining_seconds: 18,
    })) as any,
    getScriptResult: jest.fn(async () => ({
      script_id: 'script-1',
      script: {
        template_id: 'work-conflict-v1',
        scenes: [],
        metadata: {
          expected_duration_minutes: 4,
          dimension_coverage: [],
          variable_usage: {},
        },
      },
      psychological_narrative: '你今天在工作中展示了自我主张的一面。',
      comparison_summary: undefined,
      validation_report: { results: [], has_critical_failure: false, aggregated_issues_for_revision: [] },
      revised: false,
    })) as any,
  } as any;
}

describe('DynamicScriptController', () => {
  let controller: DynamicScriptController;
  let service: jest.Mocked<DynamicScriptService>;
  const user = { id: 'test-user' } as any;
  const req = { user } as any;

  beforeEach(() => {
    service = makeService();
    controller = new DynamicScriptController(service, { play: jest.fn() } as unknown as DynamicScriptPlaybackService);
  });

  test('POST /start forwards userId and body to service.start', async () => {
    const body = { initial_input: '今天我和同事吵架了' } as any;
    const result = await controller.start(req, body);
    expect(service.start).toHaveBeenCalledWith(user.id, body);
    expect(result.session_id).toBe('sess-1');
    expect(result.first_question).toBe('能告诉我发生了什么吗?');
    expect(result.is_complete).toBe(false);
  });

  test('authenticated POST playback forwards UUID params and path', async () => {
    const response = { script_id: 'script', played_path: [{ scene_id: 's1', choice_id: 'c1' }], completed: true, replayed: false };
    const play = jest.fn(async (..._args: unknown[]) => response);
    controller = new DynamicScriptController(service, { play } as unknown as DynamicScriptPlaybackService);
    expect(await controller.play(req, { script_id: 'script' }, { played_path: response.played_path })).toBe(response);
    expect(play).toHaveBeenCalledWith(user.id, 'script', response.played_path);
    expect(Reflect.getMetadata(GUARDS_METADATA, DynamicScriptController)).toContain(AuthGuard);
    expect(Reflect.getMetadata(PATH_METADATA, controller.play)).toBe('script/:script_id/play');
    expect(Reflect.getMetadata(METHOD_METADATA, controller.play)).toBe(RequestMethod.POST);
  });

  test('POST /answer forwards userId, sessionId and body to service.answer', async () => {
    const body = { session_id: 'sess-1', answer: '在团队周会上' } as any;
    const result = await controller.answer(req, body);
    expect(service.answer).toHaveBeenCalledWith(user.id, 'sess-1', body);
    expect(result.session_id).toBe('sess-1');
    expect((result as any).next_question).toBe('你当时感觉怎么样?');
  });

  test('POST /complete forwards userId, sessionId and body to service.complete', async () => {
    const body = { session_id: 'sess-1', idempotency_key: 'idem-1' } as any;
    const result = await controller.complete(req, body);
    expect(service.complete).toHaveBeenCalledWith(user.id, 'sess-1', body);
    expect(result.script_generation_id).toBe('gen-1');
    expect(result.status).toBe('pending');
  });

  test('POST /abort calls abortSession and returns abandoned status', async () => {
    const body = { session_id: 'sess-1', reason: 'user_cancelled' as const } as any;
    const result = await controller.abort(req, body);
    expect(service.abortSession).toHaveBeenCalledWith(user.id, 'sess-1', 'user_cancelled');
    expect(result).toEqual({
      session_id: 'sess-1',
      status: 'abandoned',
      generation_cancelled: false,
      message: '会话已取消',
      reason: 'user_cancelled',
    });
  });

  test('GET /status forwards session_id to service.getStatus', async () => {
    const query = { session_id: 'sess-1' } as any;
    const result = await controller.getStatus(req, query);
    expect(service.getStatus).toHaveBeenCalledWith(user.id, 'sess-1');
    expect(result.status).toBe('in_progress');
  });

  test('GET /script/:id/status forwards generation id to service', async () => {
    const params = { script_generation_id: 'gen-1' } as any;
    const result = await controller.getScriptStatus(req, params);
    expect(service.getScriptGenerationStatus).toHaveBeenCalledWith(user.id, 'gen-1');
    expect(result.status).toBe('generating');
    expect(result.progress_percentage).toBe(35);
  });

  test('GET /script/:id forwards generation id to service.getScriptResult', async () => {
    const params = { script_generation_id: 'gen-1' } as any;
    const result = await controller.getScriptResult(req, params);
    expect(service.getScriptResult).toHaveBeenCalledWith(user.id, 'gen-1');
    expect(result.script_id).toBe('script-1');
    expect(result.script.template_id).toBe('work-conflict-v1');
  });
});
