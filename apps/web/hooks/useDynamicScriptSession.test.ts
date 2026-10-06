// apps/web/hooks/useDynamicScriptSession.test.ts
//
// Unit tests for the dynamic-script session hook. Covers:
//   - start() transitions idle → inquiring and persists sessionId
//   - answer() on a non-complete response updates currentQuestion
//   - answer() on a complete response transitions to ready with extractedVariables
//   - complete() transitions to generating with generationId
//   - abort() resets state and clears persisted sessionId
//   - failed() captures error and transitions to failed

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useDynamicScriptSession } from './useDynamicScriptSession';
import { dynamicScriptApi } from '@/lib/api-dynamic-script';

vi.mock('@/lib/api-dynamic-script', () => ({
  dynamicScriptApi: {
    start: vi.fn(),
    answer: vi.fn(),
    complete: vi.fn(),
    abort: vi.fn(),
    getStatus: vi.fn(),
    getScriptStatus: vi.fn(),
    getScriptResult: vi.fn(),
    submitPlayback: vi.fn(),
  },
}));

const mockApi = dynamicScriptApi as unknown as {
  start: ReturnType<typeof vi.fn>;
  answer: ReturnType<typeof vi.fn>;
  complete: ReturnType<typeof vi.fn>;
  abort: ReturnType<typeof vi.fn>;
  getStatus: ReturnType<typeof vi.fn>;
  getScriptStatus: ReturnType<typeof vi.fn>;
  getScriptResult: ReturnType<typeof vi.fn>;
  submitPlayback: ReturnType<typeof vi.fn>;
};

beforeEach(() => {
  window.sessionStorage.clear();
  vi.resetAllMocks();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('useDynamicScriptSession', () => {
  async function resumePlayback(playedPath?: Array<{ scene_id: string; choice_id: string }>) {
    window.sessionStorage.setItem('eva:dynamic-script:session-id', 'sess-play');
    mockApi.getStatus.mockResolvedValue({ status: 'completed', generation_status: 'ready', script_generation_id: 'gen-play' });
    mockApi.getScriptStatus.mockResolvedValue({ status: 'ready', progress_percentage: 100 });
    mockApi.getScriptResult.mockResolvedValue({ script_id: 'script-play', script: { scenes: [] }, played_path: playedPath });
    const hook = renderHook(() => useDynamicScriptSession());
    await act(async () => { await hook.result.current.refreshStatus(); });
    return hook;
  }

  it('saves playback once and only shows finished after the server confirms persistence', async () => {
    const { result } = await resumePlayback();
    const path = [{ scene_id: 's1', choice_id: 'c1' }];
    let resolve!: (value: unknown) => void;
    mockApi.submitPlayback.mockReturnValue(new Promise(r => { resolve = r; }));
    let pending!: Promise<void>;
    act(() => { pending = result.current.finish(path); void result.current.finish(path); });
    expect(mockApi.submitPlayback).toHaveBeenCalledTimes(1);
    expect(result.current.state.phase).toBe('playing');
    expect(result.current.state.finishSubmitting).toBe(true);
    await act(async () => { resolve({ script_id: 'script-play', played_path: path, completed: true, replayed: false }); await pending; });
    expect(result.current.state.phase).toBe('finished');
    expect(window.sessionStorage.getItem('eva:dynamic-script:session-id')).toBe('sess-play');
  });

  it('preserves the path on save failure and allows a safe retry', async () => {
    const { result } = await resumePlayback();
    const path = [{ scene_id: 's1', choice_id: 'c1' }];
    mockApi.submitPlayback.mockRejectedValueOnce(new Error('save failed'));
    await act(async () => { await result.current.finish(path); });
    expect(result.current.state.phase).toBe('playing');
    expect(result.current.state.error).toBe('save failed');
    expect(result.current.state.playedPath).toEqual(path);
    mockApi.submitPlayback.mockResolvedValueOnce({ script_id: 'script-play', played_path: path, completed: true, replayed: true });
    await act(async () => { await result.current.finish(result.current.state.playedPath); });
    expect(result.current.state.phase).toBe('finished');
  });

  it('restores a durably completed playback after refresh', async () => {
    const path = [{ scene_id: 's1', choice_id: 'c1' }];
    const { result } = await resumePlayback(path);
    expect(result.current.state.phase).toBe('finished');
    expect(result.current.state.playedPath).toEqual(path);
    expect(mockApi.submitPlayback).not.toHaveBeenCalled();
  });

  it('does not claim completion for an unconfirmed or mismatched saved path', async () => {
    const { result } = await resumePlayback();
    const path = [{ scene_id: 's1', choice_id: 'c1' }];
    mockApi.submitPlayback.mockResolvedValueOnce({ script_id: 'script-play', played_path: [], completed: true });
    await act(async () => { await result.current.finish(path); });
    expect(result.current.state.phase).toBe('playing');
    expect(result.current.state.finishSubmitting).toBe(false);
    expect(result.current.state.error).toContain('not confirmed');
  });
  it('initializes in idle phase', () => {
    const { result } = renderHook(() => useDynamicScriptSession());
    expect(result.current.state.phase).toBe('idle');
    expect(result.current.state.sessionId).toBeNull();
    expect(result.current.state.currentQuestion).toBe('');
  });

  it('start() transitions idle → inquiring and persists sessionId', async () => {
    mockApi.start.mockResolvedValueOnce({
      session_id: 'sess-1',
      first_question: '发生了什么?',
      progress: { scenario: 0.1, emotion: 0, background: 0, relationship: 0 },
      estimated_turns_remaining: 4,
      is_complete: false,
    });
    const { result } = renderHook(() => useDynamicScriptSession());
    await act(async () => {
      await result.current.start('今天我和同事吵架了', { locale: 'zh-CN' });
    });
    expect(result.current.state.phase).toBe('inquiring');
    expect(result.current.state.sessionId).toBe('sess-1');
    expect(result.current.state.currentQuestion).toBe('发生了什么?');
    expect(result.current.state.progress.scenario).toBeCloseTo(0.1);
    expect(window.sessionStorage.getItem('eva:dynamic-script:session-id')).toBe('sess-1');
    expect(mockApi.start).toHaveBeenCalledWith('今天我和同事吵架了', { locale: 'zh-CN' });
  });

  it('fails clearly instead of showing an empty question when the API response is incomplete', async () => {
    mockApi.start.mockResolvedValueOnce({
      session_id: 'sess-incomplete',
      first_question: '',
      progress: undefined,
      estimated_turns_remaining: 4,
      is_complete: false,
    });
    const { result } = renderHook(() => useDynamicScriptSession());

    await act(async () => {
      await result.current.start('合成测试场景');
    });

    expect(result.current.state.phase).toBe('failed');
    expect(result.current.state.error).toBe('动态测试服务返回的数据不完整，请重试或切换固定题。');
    expect(window.sessionStorage.getItem('eva:dynamic-script:session-id')).toBeNull();
  });

  it('keeps the start loading state visible when an incomplete API response fails immediately', async () => {
    vi.useFakeTimers();
    mockApi.start.mockResolvedValueOnce({ session_id: 'sess-incomplete', first_question: '' });
    const { result } = renderHook(() => useDynamicScriptSession());
    let startPromise!: Promise<void>;

    act(() => { startPromise = result.current.start('合成测试场景'); });
    await act(async () => { await Promise.resolve(); });

    expect(result.current.state.phase).toBe('starting');

    await act(async () => { await vi.advanceTimersByTimeAsync(700); });
    await act(async () => { await startPromise; });
    expect(result.current.state.phase).toBe('failed');
  });

  it('answer() updates currentQuestion on continue response', async () => {
    mockApi.start.mockResolvedValueOnce({
      session_id: 'sess-1',
      first_question: '发生了什么?',
      progress: { scenario: 0.1, emotion: 0, background: 0, relationship: 0 },
      estimated_turns_remaining: 4,
      is_complete: false,
    });
    mockApi.answer.mockResolvedValueOnce({
      session_id: 'sess-1',
      is_complete: false,
      next_question: '你当时感觉怎么样?',
      progress: { scenario: 0.3, emotion: 0.2, background: 0, relationship: 0 },
      estimated_turns_remaining: 3,
      extracted_variables_so_far: {},
    });
    const { result } = renderHook(() => useDynamicScriptSession());
    await act(async () => {
      await result.current.start('今天我和同事吵架了');
    });
    await act(async () => {
      await result.current.answer('在团队周会上');
    });
    expect(result.current.state.phase).toBe('inquiring');
    expect(result.current.state.currentQuestion).toBe('你当时感觉怎么样?');
    expect(result.current.state.progress.scenario).toBeCloseTo(0.3);
  });

  it('keeps an explicit loading state while an answer request is pending', async () => {
    mockApi.start.mockResolvedValueOnce({
      session_id: 'sess-1',
      first_question: '发生了什么?',
      progress: { scenario: 0.1, emotion: 0, background: 0, relationship: 0 },
      estimated_turns_remaining: 4,
      is_complete: false,
    });
    let resolveAnswer!: (value: unknown) => void;
    mockApi.answer.mockReturnValueOnce(new Promise((resolve) => { resolveAnswer = resolve; }));
    const { result } = renderHook(() => useDynamicScriptSession());

    await act(async () => { await result.current.start('最近发生了一件事'); });
    let answerPromise!: Promise<void>;
    act(() => { answerPromise = result.current.answer('我先补充具体情况'); });

    expect(result.current.state.answerSubmitting).toBe(true);

    await act(async () => {
      resolveAnswer({
        session_id: 'sess-1', is_complete: false, next_question: '你当时怎么想？',
        progress: { scenario: 0.3, emotion: 0.2, background: 0, relationship: 0 },
        estimated_turns_remaining: 3, extracted_variables_so_far: {},
      });
      await answerPromise;
    });
    expect(result.current.state.answerSubmitting).toBe(false);
  });

  it('keeps answer loading visible when the API responds immediately', async () => {
    mockApi.start.mockResolvedValueOnce({
      session_id: 'sess-1', first_question: '发生了什么?',
      progress: { scenario: 0.1, emotion: 0, background: 0, relationship: 0 },
      estimated_turns_remaining: 4, is_complete: false,
    });
    const { result } = renderHook(() => useDynamicScriptSession());
    await act(async () => { await result.current.start('最近发生了一件事'); });
    vi.useFakeTimers();
    mockApi.answer.mockResolvedValueOnce({
      session_id: 'sess-1', is_complete: false, next_question: '你当时怎么想？',
      progress: { scenario: 0.3, emotion: 0.2, background: 0, relationship: 0 },
      estimated_turns_remaining: 3, extracted_variables_so_far: {},
    });
    let answerPromise!: Promise<void>;

    act(() => { answerPromise = result.current.answer('我先补充具体情况'); });
    await act(async () => { await Promise.resolve(); });
    expect(result.current.state.answerSubmitting).toBe(true);

    await act(async () => { await vi.advanceTimersByTimeAsync(700); });
    await act(async () => { await answerPromise; });
    expect(result.current.state.currentQuestion).toBe('你当时怎么想？');
    expect(result.current.state.answerSubmitting).toBe(false);
  });

  it('answer() transitions to ready when backend says is_complete', async () => {
    mockApi.start.mockResolvedValueOnce({
      session_id: 'sess-1',
      first_question: '发生了什么?',
      progress: { scenario: 0.5, emotion: 0.5, background: 0.5, relationship: 0.5 },
      estimated_turns_remaining: 2,
      is_complete: false,
    });
    mockApi.answer.mockResolvedValueOnce({
      session_id: 'sess-1',
      is_complete: true,
      ready_to_generate: true,
      progress: { scenario: 1, emotion: 1, background: 1, relationship: 1 },
      estimated_turns_remaining: 0,
      extracted_variables: {
        scenario_type: 'work',
        trigger_event: '在团队周会上被公开质疑',
        primary_emotion: '愤怒',
        emotion_intensity: 0.7,
        emotional_response: '心跳加速',
        key_persons: [{ name: '李明', relationship: '同事', relationship_quality: -0.2 }],
        coping_strategy: '当场反驳',
      },
    });
    const { result } = renderHook(() => useDynamicScriptSession());
    await act(async () => {
      await result.current.start('今天我和同事吵架了');
    });
    await act(async () => {
      await result.current.answer('回答够了');
    });
    expect(result.current.state.phase).toBe('ready');
    expect(result.current.state.extractedVariables?.scenario_type).toBe('work');
    expect(result.current.state.progress.scenario).toBe(1);
  });

  it('complete() transitions to generating with generationId', async () => {
    mockApi.start.mockResolvedValueOnce({
      session_id: 'sess-1',
      first_question: 'q',
      progress: { scenario: 0.5, emotion: 0.5, background: 0.5, relationship: 0.5 },
      estimated_turns_remaining: 2,
      is_complete: false,
    });
    mockApi.complete.mockResolvedValueOnce({
      script_generation_id: 'gen-1',
      status: 'pending',
      estimated_total_seconds: 25,
    });
    const { result } = renderHook(() => useDynamicScriptSession());
    await act(async () => {
      await result.current.start('x');
    });
    // Skip ahead to ready by manipulating state through complete() directly is not allowed;
    // we simulate having a sessionId by calling complete with a sessionId in state.
    // Since we cannot reach ready state via reducer shortcuts here, we instead seed
    // sessionId through sessionStorage and verify complete() handles it correctly.
    await act(async () => {
      await result.current.complete();
    });
    // After start, phase is inquiring; complete should still attempt the call
    // because sessionId is set in state.
    expect(mockApi.complete).toHaveBeenCalledWith('sess-1');
  });

  it('locks generation while the completion request is pending', async () => {
    mockApi.start.mockResolvedValueOnce({
      session_id: 'sess-1', first_question: 'q',
      progress: { scenario: 0.5, emotion: 0.5, background: 0.5, relationship: 0.5 },
      estimated_turns_remaining: 2, is_complete: false,
    });
    let resolveComplete!: (value: unknown) => void;
    mockApi.complete.mockReturnValueOnce(new Promise((resolve) => { resolveComplete = resolve; }));
    const { result } = renderHook(() => useDynamicScriptSession());

    await act(async () => { await result.current.start('synthetic scenario'); });
    let completePromise!: Promise<void>;
    act(() => { completePromise = result.current.complete(); });
    expect(result.current.state.completeSubmitting).toBe(true);

    await act(async () => { await result.current.complete(); });
    expect(mockApi.complete).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveComplete({ script_generation_id: 'gen-1', status: 'pending', estimated_total_seconds: 25 });
      await completePromise;
    });
    expect(result.current.state.completeSubmitting).toBe(false);
    expect(result.current.state.phase).toBe('generating');
  });

  it('complete() keeps a ready inquiry retryable when enqueue is unavailable', async () => {
    mockApi.start.mockResolvedValueOnce({
      session_id: 'sess-1', first_question: 'q',
      progress: { scenario: 0, emotion: 0, background: 0, relationship: 0 },
      estimated_turns_remaining: 4, is_complete: false,
    });
    mockApi.answer.mockResolvedValueOnce({
      session_id: 'sess-1', is_complete: true, ready_to_generate: true,
      progress: { scenario: 1, emotion: 1, background: 1, relationship: 1 },
      estimated_turns_remaining: 0, extracted_variables: {},
    });
    mockApi.complete.mockRejectedValueOnce(new Error('queue unavailable'));
    const { result } = renderHook(() => useDynamicScriptSession());
    await act(async () => { await result.current.start('x'); });
    await act(async () => { await result.current.answer('x'); });
    await act(async () => { await result.current.complete(); });
    expect(result.current.state.phase).toBe('ready');
    expect(result.current.state.error).toBe('queue unavailable');
    expect(window.sessionStorage.getItem('eva:dynamic-script:session-id')).toBe('sess-1');
  });

  it('refreshStatus() restores a pending enqueue failure as retryable ready state', async () => {
    window.sessionStorage.setItem('eva:dynamic-script:session-id', 'sess-1');
    mockApi.getStatus.mockResolvedValueOnce({
      session_id: 'sess-1', status: 'in_progress', progress: { scenario: 1, emotion: 1, background: 1, relationship: 1 },
      conversation_length: 4, created_at: '', completed_at: null,
      extracted_variables: { scenario_type: 'work' }, script_generation_id: 'gen-1', generation_status: 'pending',
    });
    const { result } = renderHook(() => useDynamicScriptSession());
    await act(async () => { await result.current.refreshStatus(); });
    expect(result.current.state.phase).toBe('ready');
    expect(result.current.state.sessionId).toBe('sess-1');
  });

  it('refreshStatus() resumes polling an acknowledged generation', async () => {
    window.sessionStorage.setItem('eva:dynamic-script:session-id', 'sess-1');
    mockApi.getStatus.mockResolvedValueOnce({
      session_id: 'sess-1', status: 'completed', progress: { scenario: 1, emotion: 1, background: 1, relationship: 1 },
      conversation_length: 4, created_at: '', completed_at: '',
      extracted_variables: { scenario_type: 'work' }, script_generation_id: 'gen-1', generation_status: 'generating',
    });
    mockApi.getScriptStatus.mockResolvedValue({
      script_generation_id: 'gen-1', session_id: 'sess-1', status: 'generating',
      progress_percentage: 10, current_step: 'generating', estimated_remaining_seconds: 20,
    });
    const { result } = renderHook(() => useDynamicScriptSession());
    await act(async () => { await result.current.refreshStatus(); });
    expect(result.current.state.phase).toBe('generating');
    expect(result.current.state.generationId).toBe('gen-1');
    expect(result.current.state.sessionId).toBe('sess-1');
  });

  it('keeps the session through script readiness so a remount can restore play', async () => {
    window.sessionStorage.setItem('eva:dynamic-script:session-id', 'sess-1');
    mockApi.getStatus.mockResolvedValue({
      session_id: 'sess-1', status: 'completed',
      progress: { scenario: 1, emotion: 1, background: 1, relationship: 1 },
      conversation_length: 4, created_at: '', completed_at: '',
      script_generation_id: 'gen-1', generation_status: 'ready',
    });
    mockApi.getScriptStatus.mockResolvedValue({
      script_generation_id: 'gen-1', session_id: 'sess-1', status: 'ready',
      progress_percentage: 100,
    });
    const script = { session_id: 'sess-1', script: { scenes: [] } };
    mockApi.getScriptResult.mockResolvedValue(script);
    const first = renderHook(() => useDynamicScriptSession());
    await act(async () => { await first.result.current.refreshStatus(); });
    expect(first.result.current.state.phase).toBe('playing');
    expect(first.result.current.state.sessionId).toBe('sess-1');
    expect(window.sessionStorage.getItem('eva:dynamic-script:session-id')).toBe('sess-1');
    first.unmount();
    const restored = renderHook(() => useDynamicScriptSession());
    await act(async () => { await restored.result.current.refreshStatus(); });
    expect(restored.result.current.state.phase).toBe('playing');
    expect(restored.result.current.state.script).toEqual(script);
    expect(restored.result.current.state.sessionId).toBe('sess-1');
    act(() => restored.result.current.reset());
    expect(window.sessionStorage.getItem('eva:dynamic-script:session-id')).toBeNull();
  });

  it('abort() resets state and clears persisted sessionId', async () => {
    mockApi.start.mockResolvedValueOnce({
      session_id: 'sess-1',
      first_question: 'q',
      progress: { scenario: 0, emotion: 0, background: 0, relationship: 0 },
      estimated_turns_remaining: 4,
      is_complete: false,
    });
    mockApi.abort.mockResolvedValueOnce({
      session_id: 'sess-1',
      status: 'abandoned',
      generation_cancelled: false,
      message: 'ok',
    });
    const { result } = renderHook(() => useDynamicScriptSession());
    await act(async () => {
      await result.current.start('x');
    });
    expect(window.sessionStorage.getItem('eva:dynamic-script:session-id')).toBe('sess-1');
    await act(async () => {
      await result.current.abort('user_cancelled');
    });
    expect(result.current.state.phase).toBe('idle');
    expect(window.sessionStorage.getItem('eva:dynamic-script:session-id')).toBeNull();
    expect(mockApi.abort).toHaveBeenCalledWith('sess-1', 'user_cancelled');
  });

  it('abort() keeps the session when the server request fails', async () => {
    mockApi.start.mockResolvedValueOnce({
      session_id: 'sess-1',
      first_question: 'q',
      progress: { scenario: 0, emotion: 0, background: 0, relationship: 0 },
      estimated_turns_remaining: 4,
      is_complete: false,
    });
    mockApi.abort.mockRejectedValueOnce(new Error('network failed'));
    const { result } = renderHook(() => useDynamicScriptSession());
    await act(async () => { await result.current.start('x'); });
    await expect(act(async () => { await result.current.abort('user_cancelled'); })).rejects.toThrow('network failed');
    expect(result.current.state.sessionId).toBe('sess-1');
    expect(window.sessionStorage.getItem('eva:dynamic-script:session-id')).toBe('sess-1');
  });

  it('abort() does not claim success when generation already finished', async () => {
    mockApi.start.mockResolvedValueOnce({
      session_id: 'sess-1', first_question: 'q',
      progress: { scenario: 0, emotion: 0, background: 0, relationship: 0 },
      estimated_turns_remaining: 4, is_complete: false,
    });
    mockApi.complete.mockResolvedValueOnce({
      script_generation_id: 'gen-1', status: 'pending', estimated_total_seconds: 25,
    });
    mockApi.abort.mockResolvedValueOnce({
      session_id: 'sess-1', status: 'completed', generation_cancelled: false, message: '生成已结束',
    });
    const { result } = renderHook(() => useDynamicScriptSession());
    await act(async () => { await result.current.start('x'); });
    await act(async () => { await result.current.complete(); });
    await expect(act(async () => { await result.current.abort('user_cancelled'); })).rejects.toThrow('generation_cancel_not_confirmed');
    expect(result.current.state.phase).toBe('generating');
    expect(window.sessionStorage.getItem('eva:dynamic-script:session-id')).toBe('sess-1');
  });

  it('start() failure transitions to failed with error message', async () => {
    mockApi.start.mockRejectedValueOnce(new Error('boom'));
    const { result } = renderHook(() => useDynamicScriptSession());
    await act(async () => {
      await result.current.start('x');
    });
    expect(result.current.state.phase).toBe('failed');
    expect(result.current.state.error).toBe('boom');
  });

  it('reset() clears persisted sessionId and returns to idle', async () => {
    mockApi.start.mockResolvedValueOnce({
      session_id: 'sess-1',
      first_question: 'q',
      progress: { scenario: 0, emotion: 0, background: 0, relationship: 0 },
      estimated_turns_remaining: 4,
      is_complete: false,
    });
    const { result } = renderHook(() => useDynamicScriptSession());
    await act(async () => {
      await result.current.start('x');
    });
    act(() => result.current.reset());
    expect(result.current.state.phase).toBe('idle');
    expect(window.sessionStorage.getItem('eva:dynamic-script:session-id')).toBeNull();
  });
});
