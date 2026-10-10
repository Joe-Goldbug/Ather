// apps/web/lib/api-dynamic-script.ts
//
// Frontend client for the dynamic-script pipeline.
//
// Mirrors the three-stage API contract documented in
// docs/superpowers/specs/2026-07-25-dynamic-script-ai-agent-design.md:
//   start    → POST /assessment/micro-sandbox/dynamic/start
//   answer   → POST /assessment/micro-sandbox/dynamic/answer
//   complete → POST /assessment/micro-sandbox/dynamic/complete  (returns polling token)
//   abort    → POST /assessment/micro-sandbox/dynamic/abort
//   status   → GET  /assessment/micro-sandbox/dynamic/status?session_id=…
//   scriptStatus   → GET /assessment/micro-sandbox/dynamic/script/:id/status
//   scriptResult   → GET /assessment/micro-sandbox/dynamic/script/:id
//
// All calls share cookies with the existing session (request() uses
// credentials: 'include') so AuthGuard resolves the user from the same
// session token as the rest of the app.

export type Locale = 'zh-CN' | 'en' | 'ja' | 'es';

// Browser → relative `/api` (Next.js rewrites proxy to backend port).
const API_BASE = '/api';

async function request<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers as Record<string, string> ?? {}),
    },
    credentials: 'include',
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: res.statusText }));
    throw new Error(err.message ?? `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export interface Progress {
  scenario: number;
  emotion: number;
  background: number;
  relationship: number;
}

export interface ExtractedVariables {
  scenario_type: 'work' | 'family' | 'romantic' | 'social' | 'other';
  trigger_event: string;
  primary_emotion: string;
  emotion_intensity: number;
  emotional_response: string;
  root_cause?: string;
  recent_context?: string;
  key_persons: Array<{
    name: string;
    relationship: string;
    relationship_quality: number;
  }>;
  coping_strategy: string;
  immediate_action?: string;
}

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
  extracted_variables_so_far: Record<string, unknown>;
}

export interface AnswerDynamicCompleteResponse {
  session_id: string;
  is_complete: true;
  ready_to_generate: true;
  progress: Progress;
  estimated_turns_remaining: 0;
  extracted_variables: Record<string, unknown>;
}

export type AnswerDynamicResponse =
  | AnswerDynamicContinueResponse
  | AnswerDynamicCompleteResponse;

export interface CompleteDynamicAcceptedResponse {
  script_generation_id: string;
  status: 'pending' | 'generating' | 'validating' | 'revising' | 'saving' | 'ready' | 'failed';
  estimated_total_seconds: number;
}

export interface AbortDynamicResponse {
  session_id: string;
  status: 'abandoned' | 'completed';
  generation_cancelled: boolean;
  message: string;
  reason?: 'user_cancelled' | 'changed_mind' | 'other';
}

export interface StatusResponse {
  session_id: string;
  status: 'in_progress' | 'completed' | 'abandoned';
  current_question?: string;
  extracted_variables?: ExtractedVariables;
  script_generation_id?: string;
  generation_status?: GenerationStatus;
  progress: Progress;
  conversation_length: number;
  created_at: string;
  completed_at: string | null;
}

export type GenerationStatus =
  | 'pending'
  | 'generating'
  | 'validating'
  | 'revising'
  | 'saving'
  | 'ready'
  | 'failed';

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

export interface ScriptChoice {
  choice_id: string;
  text: string;
  dimension_signals: Record<string, number>;
  weight: number;
}

export interface ScriptScene {
  scene_id: string;
  scene_number: number;
  narrative: string;
  choices: ScriptChoice[];
  next_scene_map: Record<string, string>;
}

export interface PlayedChoice {
  scene_id: string;
  choice_id: string;
}

export interface PlaybackResponse {
  script_id: string;
  played_path: PlayedChoice[];
  completed: true;
  replayed: boolean;
}

export interface CompleteDynamicSuccessResponse {
  script_id: string;
  played_path?: PlayedChoice[];
  script: {
    template_id: string;
    scenes: ScriptScene[];
    metadata: {
      expected_duration_minutes: number;
      dimension_coverage: string[];
      variable_usage: Record<string, boolean>;
    };
  };
  psychological_narrative: string;
  observations?: Array<{
    id: string;
    title: string;
    text: string;
    question: string;
    evidence: { scene_id: string; choice_id: string; situation: string; choice_text: string };
  }>;
  comparison_summary?: string;
  validation_report: unknown;
  revised: boolean;
}

export const dynamicScriptApi = {
  submitPlayback(scriptId: string, playedPath: PlayedChoice[]): Promise<PlaybackResponse> {
    return request<PlaybackResponse>(`/assessment/micro-sandbox/dynamic/script/${encodeURIComponent(scriptId)}/play`, {
      method: 'POST',
      body: JSON.stringify({ played_path: playedPath }),
    });
  },
  start(input: string, opts?: { locale?: Locale }): Promise<StartDynamicResponse> {
    return request<StartDynamicResponse>('/assessment/micro-sandbox/dynamic/start', {
      method: 'POST',
      body: JSON.stringify({ initial_input: input, locale: opts?.locale }),
    });
  },

  answer(sessionId: string, answer: string): Promise<AnswerDynamicResponse> {
    return request<AnswerDynamicResponse>('/assessment/micro-sandbox/dynamic/answer', {
      method: 'POST',
      body: JSON.stringify({ session_id: sessionId, answer }),
    });
  },

  complete(sessionId: string, idempotencyKey?: string): Promise<CompleteDynamicAcceptedResponse> {
    return request<CompleteDynamicAcceptedResponse>('/assessment/micro-sandbox/dynamic/complete', {
      method: 'POST',
      body: JSON.stringify({
        session_id: sessionId,
        ...(idempotencyKey ? { idempotency_key: idempotencyKey } : {}),
      }),
    });
  },

  abort(sessionId: string, reason?: 'user_cancelled' | 'changed_mind' | 'other'): Promise<AbortDynamicResponse> {
    return request<AbortDynamicResponse>('/assessment/micro-sandbox/dynamic/abort', {
      method: 'POST',
      body: JSON.stringify({ session_id: sessionId, reason }),
    });
  },

  getStatus(sessionId: string): Promise<StatusResponse> {
    return request<StatusResponse>(`/assessment/micro-sandbox/dynamic/status?session_id=${encodeURIComponent(sessionId)}`);
  },

  getScriptStatus(generationId: string): Promise<ScriptGenerationStatus> {
    return request<ScriptGenerationStatus>(
      `/assessment/micro-sandbox/dynamic/script/${encodeURIComponent(generationId)}/status`,
    );
  },

  getScriptResult(generationId: string): Promise<CompleteDynamicSuccessResponse> {
    return request<CompleteDynamicSuccessResponse>(
      `/assessment/micro-sandbox/dynamic/script/${encodeURIComponent(generationId)}`,
    );
  },
};
