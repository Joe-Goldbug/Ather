// apps/web/hooks/useDynamicScriptSession.ts
//
// React hook for the dynamic-script session lifecycle.
//
// State machine:
//   idle ──start()──▶ inquiring ──answer()──▶ inquiring (continue)
//                                  └─answer()──▶ ready (extracted vars)
//   ready ──complete()──▶ generating ──poll()──▶ ready
//                                                └failed
//
// The hook owns three pieces of long-lived state:
//   1. session_id  — persisted to sessionStorage so a page reload can
//                    resume mid-inquiry via the status endpoint
//   2. progress    — shown as a 4-dim ring/bars in the inquiry view
//   3. generation  — the {id, status, percentage} for the async phase
//
// Polling for generation status is exponential backoff: 1s, 2s, 4s, 8s,
// capped at 8s. It stops automatically when status hits a terminal state
// (ready | failed) or when the component unmounts.

'use client';

import { useCallback, useEffect, useReducer, useRef } from 'react';
import {
  dynamicScriptApi,
  type Progress,
  type GenerationStatus,
  type ScriptGenerationStatus,
  type CompleteDynamicSuccessResponse,
  type ExtractedVariables,
  type PlayedChoice,
} from '@/lib/api-dynamic-script';

export type DynamicScriptPhase =
  | 'idle'
  | 'starting'
  | 'inquiring'
  | 'ready'
  | 'generating'
  | 'playing'
  | 'finished'
  | 'failed';

export interface DynamicScriptState {
  phase: DynamicScriptPhase;
  sessionId: string | null;
  currentQuestion: string;
  answerSubmitting: boolean;
  completeSubmitting: boolean;
  finishSubmitting: boolean;
  playedPath: PlayedChoice[];
  progress: Progress;
  estimatedTurnsRemaining: number;
  extractedVariables: ExtractedVariables | null;
  generationId: string | null;
  generationStatus: GenerationStatus | null;
  generationProgress: number; // 0-100
  generationStep: string;
  script: CompleteDynamicSuccessResponse | null;
  error: string | null;
}

const INITIAL_STATE: DynamicScriptState = {
  phase: 'idle',
  sessionId: null,
  currentQuestion: '',
  answerSubmitting: false,
  completeSubmitting: false,
  finishSubmitting: false,
  playedPath: [],
  progress: { scenario: 0, emotion: 0, background: 0, relationship: 0 },
  estimatedTurnsRemaining: 0,
  extractedVariables: null,
  generationId: null,
  generationStatus: null,
  generationProgress: 0,
  generationStep: '',
  script: null,
  error: null,
};

type Action =
  | { type: 'start_loading' }
  | { type: 'start_ok'; sessionId: string; question: string; progress: Progress; turnsRemaining: number }
  | { type: 'answer_loading' }
  | { type: 'answer_continue'; sessionId: string; question: string; progress: Progress; turnsRemaining: number }
  | { type: 'answer_complete'; sessionId: string; variables: ExtractedVariables; progress: Progress }
  | { type: 'complete_loading' }
  | { type: 'complete_ok'; sessionId: string; generationId: string; estimatedSeconds: number }
  | { type: 'complete_error'; error: string }
  | { type: 'generation_status'; status: GenerationStatus; progress: number; step: string }
  | { type: 'script_ready'; script: CompleteDynamicSuccessResponse }
  | { type: 'finish_loading'; path: PlayedChoice[] }
  | { type: 'finish_ok'; path: PlayedChoice[] }
  | { type: 'finish_error'; error: string }
  | { type: 'abort_ok' }
  | { type: 'failed'; error: string };

function reducer(state: DynamicScriptState, action: Action): DynamicScriptState {
  switch (action.type) {
    case 'start_loading':
      return { ...state, phase: 'starting', error: null };
    case 'start_ok':
      return {
        ...state,
        phase: 'inquiring',
        sessionId: action.sessionId,
        currentQuestion: action.question,
        progress: action.progress,
        estimatedTurnsRemaining: action.turnsRemaining,
        error: null,
      };
    case 'answer_loading':
      return { ...state, answerSubmitting: true };
    case 'answer_continue':
      return {
        ...state,
        phase: 'inquiring',
        answerSubmitting: false,
        sessionId: action.sessionId,
        currentQuestion: action.question,
        progress: action.progress,
        estimatedTurnsRemaining: action.turnsRemaining,
        error: null,
      };
    case 'answer_complete':
      return {
        ...state,
        phase: 'ready',
        answerSubmitting: false,
        sessionId: action.sessionId,
        progress: action.progress,
        estimatedTurnsRemaining: 0,
        extractedVariables: action.variables,
        error: null,
      };
    case 'complete_ok':
      return {
        ...state,
        phase: 'generating',
        sessionId: action.sessionId,
        completeSubmitting: false,
        generationId: action.generationId,
        generationStatus: 'pending',
        generationProgress: 0,
        error: null,
      };
    case 'complete_loading':
      return { ...state, completeSubmitting: true, error: null };
    case 'complete_error':
      return { ...state, phase: 'ready', completeSubmitting: false, error: action.error };
    case 'generation_status':
      return {
        ...state,
        generationStatus: action.status,
        generationProgress: action.progress,
        generationStep: action.step,
      };
    case 'script_ready':
      return {
        ...state,
        phase: action.script.played_path?.length ? 'finished' : 'playing',
        playedPath: action.script.played_path ?? [],
        script: action.script,
        generationStatus: 'ready',
        generationProgress: 100,
        error: null,
      };
    case 'finish_loading':
      return { ...state, finishSubmitting: true, playedPath: action.path, error: null };
    case 'finish_ok':
      return { ...state, phase: 'finished', finishSubmitting: false, playedPath: action.path,
        script: state.script ? { ...state.script, played_path: action.path } : null, error: null };
    case 'finish_error':
      return { ...state, finishSubmitting: false, error: action.error };
    case 'abort_ok':
      return { ...INITIAL_STATE };
    case 'failed':
      return { ...state, phase: 'failed', answerSubmitting: false, error: action.error };
  }
}

const STORAGE_KEY = 'eva:dynamic-script:session-id';
const MIN_ACTION_FEEDBACK_MS = 700;

async function keepActionFeedbackVisible(startedAt: number): Promise<void> {
  const remainingMs = MIN_ACTION_FEEDBACK_MS - (Date.now() - startedAt);
  if (remainingMs > 0) {
    await new Promise((resolve) => window.setTimeout(resolve, remainingMs));
  }
}

function readPersistedSessionId(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.sessionStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function persistSessionId(sessionId: string | null): void {
  if (typeof window === 'undefined') return;
  try {
    if (sessionId) window.sessionStorage.setItem(STORAGE_KEY, sessionId);
    else window.sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore quota / private mode */
  }
}

export interface UseDynamicScriptSessionApi {
  state: DynamicScriptState;
  start: (initialInput: string, opts?: { locale?: 'zh-CN' | 'en' | 'ja' | 'es' }) => Promise<void>;
  answer: (text: string) => Promise<void>;
  complete: () => Promise<void>;
  finish: (playedPath: PlayedChoice[]) => Promise<void>;
  abort: (reason?: 'user_cancelled' | 'changed_mind' | 'other') => Promise<void>;
  /** Manually poll once and reconcile state from the server. */
  refreshStatus: () => Promise<void>;
  /** Clean state and persisted session id (e.g. on leaving the page). */
  reset: () => void;
}

/**
 * Drives the dynamic-script flow: inquiry → generation → play.
 *
 * Persists sessionId in sessionStorage so a mid-inquiry page reload can
 * pick up via the status endpoint (callers wire that into refreshStatus
 * or via useEffect on mount).
 */
export function useDynamicScriptSession(): UseDynamicScriptSessionApi {
  const [state, dispatch] = useReducer(reducer, INITIAL_STATE);
  const pollingRef = useRef<{ cancelled: boolean } | null>(null);
  const finishInFlightRef = useRef(false);

  const finish = useCallback(async (playedPath: PlayedChoice[]) => {
    if (state.phase !== 'playing' || !state.script || !playedPath.length || finishInFlightRef.current) return;
    finishInFlightRef.current = true;
    dispatch({ type: 'finish_loading', path: playedPath });
    try {
      const res = await dynamicScriptApi.submitPlayback(state.script.script_id, playedPath);
      if (res.completed !== true || res.script_id !== state.script.script_id ||
          !Array.isArray(res.played_path) || res.played_path.length !== playedPath.length ||
          !res.played_path.every((step, i) => step?.scene_id === playedPath[i].scene_id && step?.choice_id === playedPath[i].choice_id)) {
        throw new Error('Playback save was not confirmed. Please retry.');
      }
      dispatch({ type: 'finish_ok', path: res.played_path });
    } catch (err) {
      dispatch({ type: 'finish_error', error: err instanceof Error ? err.message : 'Playback save failed' });
    } finally {
      finishInFlightRef.current = false;
    }
  }, [state.phase, state.script]);

  const start = useCallback(async (initialInput: string, opts?: { locale?: 'zh-CN' | 'en' | 'ja' | 'es' }) => {
    const startedAt = Date.now();
    dispatch({ type: 'start_loading' });
    try {
      const res = await dynamicScriptApi.start(initialInput, { locale: opts?.locale });
      if (
        !res ||
        typeof res.session_id !== 'string' ||
        !res.session_id.trim() ||
        typeof res.first_question !== 'string' ||
        !res.first_question.trim()
      ) {
        throw new Error('动态测试服务返回的数据不完整，请重试或切换固定题。');
      }
      await keepActionFeedbackVisible(startedAt);
      persistSessionId(res.session_id);
      dispatch({
        type: 'start_ok',
        sessionId: res.session_id,
        question: res.first_question,
        progress: res.progress,
        turnsRemaining: res.estimated_turns_remaining,
      });
    } catch (err) {
      await keepActionFeedbackVisible(startedAt);
      dispatch({ type: 'failed', error: err instanceof Error ? err.message : 'start failed' });
    }
  }, []);

  const answer = useCallback(async (text: string) => {
    if (!state.sessionId || state.answerSubmitting) return;
    const startedAt = Date.now();
    dispatch({ type: 'answer_loading' });
    try {
      const res = await dynamicScriptApi.answer(state.sessionId, text);
      await keepActionFeedbackVisible(startedAt);
      if (res.is_complete) {
        dispatch({
          type: 'answer_complete',
          sessionId: res.session_id,
          variables: res.extracted_variables as unknown as ExtractedVariables,
          progress: res.progress,
        });
      } else {
        dispatch({
          type: 'answer_continue',
          sessionId: res.session_id,
          question: res.next_question,
          progress: res.progress,
          turnsRemaining: res.estimated_turns_remaining,
        });
      }
    } catch (err) {
      await keepActionFeedbackVisible(startedAt);
      dispatch({ type: 'failed', error: err instanceof Error ? err.message : 'answer failed' });
    }
  }, [state.answerSubmitting, state.sessionId]);

  const complete = useCallback(async () => {
    if (!state.sessionId || state.completeSubmitting) return;
    const startedAt = Date.now();
    dispatch({ type: 'complete_loading' });
    try {
      const res = await dynamicScriptApi.complete(state.sessionId);
      await keepActionFeedbackVisible(startedAt);
      dispatch({ type: 'complete_ok', sessionId: state.sessionId, generationId: res.script_generation_id, estimatedSeconds: res.estimated_total_seconds });
    } catch (err) {
      await keepActionFeedbackVisible(startedAt);
      dispatch({ type: 'complete_error', error: err instanceof Error ? err.message : 'complete failed' });
    }
  }, [state.completeSubmitting, state.sessionId]);

  const abort = useCallback(async (reason?: 'user_cancelled' | 'changed_mind' | 'other') => {
    const sid = state.sessionId;
    if (sid) {
      const response = await dynamicScriptApi.abort(sid, reason);
      if (state.phase === 'generating' && !response.generation_cancelled) {
        throw new Error('generation_cancel_not_confirmed');
      }
    }
    persistSessionId(null);
    dispatch({ type: 'abort_ok' });
  }, [state.sessionId, state.phase]);

  const refreshStatus = useCallback(async () => {
    const sid = state.sessionId ?? readPersistedSessionId();
    if (!sid) return;
    try {
      const status = await dynamicScriptApi.getStatus(sid);
      if (status.generation_status && status.generation_status !== 'failed' &&
          (status.status === 'completed' || status.generation_status !== 'pending') && status.script_generation_id) {
        dispatch({ type: 'complete_ok', sessionId: sid, generationId: status.script_generation_id, estimatedSeconds: 25 });
      } else if (status.extracted_variables && status.status !== 'abandoned') {
        dispatch({ type: 'answer_complete', sessionId: sid, variables: status.extracted_variables, progress: status.progress });
      } else if (status.status === 'in_progress' && status.current_question) {
        dispatch({
          type: 'answer_continue',
          sessionId: sid,
          question: status.current_question,
          progress: status.progress,
          turnsRemaining: Math.max(0, status.conversation_length > 0 ? 5 - status.conversation_length : 5),
        });
      }
    } catch {
      // ignore — keep current state
    }
  }, [state.sessionId]);

  const reset = useCallback(() => {
    persistSessionId(null);
    dispatch({ type: 'abort_ok' });
  }, []);

  // ── Generation polling ───────────────────────────────────────────────
  useEffect(() => {
    if (state.phase !== 'generating' || !state.generationId) return;

    let cancelled = false;
    let backoff = 1000;
    const maxBackoff = 8000;

    const poll = async () => {
      if (cancelled) return;
      try {
        const status: ScriptGenerationStatus = await dynamicScriptApi.getScriptStatus(state.generationId!);
        if (cancelled) return;
        dispatch({
          type: 'generation_status',
          status: status.status,
          progress: status.progress_percentage,
          step: status.current_step ?? '',
        });
        if (status.status === 'ready') {
          const result = await dynamicScriptApi.getScriptResult(state.generationId!);
          if (cancelled) return;
          dispatch({ type: 'script_ready', script: result });
          return;
        }
        if (status.status === 'failed') {
          dispatch({ type: 'failed', error: '脚本生成失败，请稍后重试' });
          return;
        }
        backoff = Math.min(backoff * 2, maxBackoff);
        setTimeout(poll, backoff);
      } catch {
        backoff = Math.min(backoff * 2, maxBackoff);
        setTimeout(poll, backoff);
      }
    };

    void poll();
    pollingRef.current = { cancelled: false };
    return () => {
      cancelled = true;
      pollingRef.current = null;
    };
  }, [state.phase, state.generationId]);

  return { state, start, answer, complete, finish, abort, refreshStatus, reset };
}
