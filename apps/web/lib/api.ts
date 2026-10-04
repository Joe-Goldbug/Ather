// apps/web/lib/api.ts
// Ather-Solana Web API 客户端 —— 闭环主链路最小集合
//
// 依据 docs/CURRENT-PRODUCT-TRUTH-2026-06-29.md 的正式主链路：
//   建轮 → 逐题作答 → 完成 → 读结果 → 提交反馈 → 轮次历史
//
// 本文件由 Ather-ethan 的 lib/api.ts 按段落精确抽取生成，
// auth / themeAssessment / guest 三段签名与源仓库完全一致。
// 未迁入：chat / report / evidence / diary / weeklyReview / portrait
//        / observations / consent（均属非正式路径或 P2 范围）。
//
// 浏览器端走相对路径 `/api`（Next rewrites 代理到后端）；
// SSR 走 NEXT_PUBLIC_API_URL，生产缺失时直接抛错，不静默回落 localhost。

// apps/web/lib/api.ts
// Ather Web API client — Phase 6/7
// All calls go to the NestJS API (apps/api).

// Browser → relative `/api` (Next.js rewrites proxy to backend port).
// Server (SSR / RSC / generateMetadata) → must use absolute NEXT_PUBLIC_API_URL.
// In production we refuse to silently fall back to localhost — that masks
// missing env config behind ECONNREFUSED.
function resolveApiBase(): string {
  if (typeof window !== 'undefined') return '/api';
  const url = process.env.NEXT_PUBLIC_API_URL;
  if (url && url.trim() !== '') return url;
  if (process.env.NODE_ENV === 'production') {
    throw new Error('[api] NEXT_PUBLIC_API_URL is required for SSR in production');
  }
  return 'http://localhost:3001';
}

const API_BASE = resolveApiBase();
async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...((options.headers as Record<string, string>) ?? {}),
  };

  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
    credentials: 'include', // Send cookies automatically
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: res.statusText }));
    throw new Error(err.message ?? `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

// ── Auth ──────────────────────────────────────────────────────────────────
export interface AuthUser {
  id: string;
  email: string;
  created_at?: string;
  baseline_completed?: boolean;
  sandbox_completed_today?: boolean;
  entitlement_tier?: 'free' | 'paid';
  capabilities?: {
    canUseCorrections: boolean;
    canContinueTesting: boolean;
  };
}

export const authApi = {
  me: () => request<AuthUser>('/auth/me'),
  sendCode: (email: string) =>
    request<{ success?: boolean; message: string; dev_auto_login?: boolean; user_id?: string }>(
      '/auth/send-code',
      {
        method: 'POST',
        body: JSON.stringify({ email }),
      }
    ),
  verifyCode: (email: string, code: string) =>
    request<{ user_id: string; email: string }>('/auth/verify-code', {
      method: 'POST',
      body: JSON.stringify({ email, code }),
    }),
  logout: () =>
    request<{ success: boolean }>('/auth/logout', {
      method: 'POST',
    }),
  /** DEV ONLY: skip email/OTP entirely, server returns a session cookie. */
  devLogin: () =>
    request<{ user_id: string; email: string; message: string }>('/auth/dev-login', {
      method: 'POST',
    }),
};

// ── Theme assessment rounds (Track A: current-round observations only) ──────
export type ThemeLens = 'emotion' | 'relationship' | 'social' | 'workplace' | 'self_evaluation';
export type ThemeChoiceId = 'A' | 'B' | 'C' | 'D';

export interface ThemeQuestionOption {
  id: ThemeChoiceId;
  text: string;
}

export interface ThemeQuestion {
  question_id: string;
  focus_label: string;
  context_label: string;
  role: 'core' | 'clarifier' | 'counterexample';
  prompt: string;
  options: ThemeQuestionOption[];
}

export interface ThemeRoundNext {
  state: 'question' | 'ready' | 'completed';
  item_id?: string;
  decision_index?: number;
  decision_minimum?: number;
  decision_maximum?: number;
  completed_decisions?: number;
  question?: ThemeQuestion;
  message?: string;
  selection?: ThemeRoundSelection | null;
}

export interface ThemeRoundSelection {
  rule_version: 'theme-feedback-v1';
  reason: 'manual_theme' | 'verify_disagreement' | 'clarify_partial' | 'use_added_context' | 'add_context' | 'refresh_stale_evidence' | 'explore_domain';
  reason_zh: string;
  target: {
    response_id: string;
    result_revision_id: string;
    observation_question_id: string | null;
    action: 'partial' | 'refute' | 'clarify';
  } | null;
  status: 'targeted' | 'theme_followup' | 'target_unavailable' | 'theme_selection';
  selected_question_id: string | null;
}

export interface ThemeRoundEvidence {
  question_id: string;
  focus_label: string;
  context_label: string;
  choice_text: string;
}

export interface ThemeRoundResult {
  theme_lens: ThemeLens;
  theme_title: string;
  headline: string;
  summary: string;
  observations: Array<{ focus: string; text: string; evidence_question_id: string }>;
  strength: string;
  watchout: string;
  counterevidence: string;
  boundary: string;
  evidence: ThemeRoundEvidence[];
}

export interface ThemeRoundResultResponse {
  round_id: string;
  result_revision_id: string;
  revision_number: number;
  published_at: string;
  result: ThemeRoundResult;
  feedback_state: ThemeResultFeedbackState;
  whole_result_refuted: boolean;
  latest_feedback: ThemeResultFeedback | null;
  observation_feedback?: Record<string, ThemeResultFeedback>;
}

export type ThemeResultFeedbackState = 'not_responded' | 'recorded' | 'needs_follow_up';

export interface ThemeResultFeedback {
  response_id: string;
  action: 'confirm' | 'partial' | 'refute' | 'clarify';
  explanation: string | null;
  observation_question_id: string | null;
  state: Exclude<ThemeResultFeedbackState, 'not_responded'>;
  created_at: string;
}

export interface ThemeCoverageResponse {
  themes: Array<{
    theme_lens: ThemeLens;
    title: string;
    completed_rounds: number;
    last_completed_at: string | null;
  }>;
  recommended_theme: ThemeLens;
  recommendation: string;
  recommendation_reason: 'verify_disagreement' | 'clarify_partial' | 'use_added_context' | 'add_context' | 'refresh_stale_evidence' | 'explore_domain';
  recommendation_target: ThemeRoundSelection['target'];
}

export interface ThemeRoundHistoryItem {
  id: string;
  theme_lens: ThemeLens;
  theme_title: string;
  status: 'in_progress' | 'ready_to_complete' | 'completed' | 'withheld' | 'abandoned';
  completed_at: string | null;
  headline: string | null;
  boundary: string | null;
  feedback_state: ThemeResultFeedbackState;
  whole_result_refuted: boolean;
  latest_feedback_action: ThemeResultFeedback['action'] | null;
}

export const themeAssessmentApi = {
  coverage: () => request<ThemeCoverageResponse>('/v1/assessment-themes/coverage'),
  history: () => request<ThemeRoundHistoryItem[]>('/v1/assessment-rounds'),
  start: (dto: { theme?: ThemeLens; locale?: string } = {}) =>
    request<{
      round: { id: string; theme_lens: ThemeLens };
      recommendation: string | null;
      selection: ThemeRoundSelection;
      next: ThemeRoundNext;
    }>('/v1/assessment-rounds', {
      method: 'POST',
      body: JSON.stringify(dto),
    }),
  next: (roundId: string) => request<ThemeRoundNext>(`/v1/assessment-rounds/${roundId}/next`),
  answer: (
    roundId: string,
    itemId: string,
    dto: { operation_id: string; choice_id: ThemeChoiceId; free_text?: string }
  ) =>
    request<ThemeRoundNext>(`/v1/assessment-rounds/${roundId}/items/${itemId}/responses`, {
      method: 'POST',
      body: JSON.stringify(dto),
    }),
  complete: (roundId: string) =>
    request<ThemeRoundResultResponse>(`/v1/assessment-rounds/${roundId}/complete`, {
      method: 'POST',
    }),
  result: (roundId: string) =>
    request<ThemeRoundResultResponse>(`/v1/assessment-rounds/${encodeURIComponent(roundId)}/result`),
  respond: (
    roundId: string,
    dto: {
      operation_id: string;
      action: 'confirm' | 'partial' | 'refute' | 'clarify';
      explanation?: string;
      observation_question_id?: string;  // P0-3：可选，传则反馈单条 observation；不传则整报告级
    }
  ) =>
    request<{
      response_id: string;
      result_revision_id: string;
      action: ThemeResultFeedback['action'];
      explanation: string | null;
      observation_question_id: string | null;
      state: Exclude<ThemeResultFeedbackState, 'not_responded'>;
      feedback_state: ThemeResultFeedbackState;
      created_at: string;
      replayed: boolean;
    }>(
      `/v1/assessment-rounds/${roundId}/result/responses`,
      {
        method: 'POST',
        body: JSON.stringify(dto),
      }
    ),
};

// ── Telemetry（埋点；后端 product-events 属 P2 范围，失败仅告警）─────────
export const telemetryApi = {
  async emitEvent(event: Partial<Record<string, unknown>>): Promise<void> {
    await request('/product-events', {
      method: 'POST',
      body: JSON.stringify(event),
    }).catch((e) => console.warn('Telemetry event failed:', e));
  },
};

export type GuestChoiceId = 'A' | 'B' | 'C' | 'D';

export interface GuestOpening {
  guest_run_id: string;
  episode_id: string;
  episode_version: string;
  question_bank_version: string;
  copy_version: string;
  expires_at: string;
  nodes: Array<{
    id: string;
    title: string;
    context: string;
    options: Array<{ id: GuestChoiceId; text: string; consequence: string }>;
  }>;
}

export interface GuestAnswer {
  node_id: string;
  choice_id: GuestChoiceId;
}

export interface GuestChapterRecord {
  episode_id: string;
  episode_version: string;
  episode_title: string;
  evidence_kind: 'simulation';
  science_status: 'candidate_only';
  source_independence_group: string;
  summary: string;
  pattern: string;
  benefits: string;
  costs: string;
  exceptions: string;
  unknowns: string;
}

export interface GuestCompletion {
  result: GuestChapterRecord;
  claim_token: string;
}

export const guestAssessmentApi = {
  getOpening: () => request<GuestOpening>('/v1/story/guest-opening'),
  complete: (body: {
    guest_run_id: string;
    version: string;
    adult_confirmed: true;
    answers: GuestAnswer[];
  }) => request<GuestCompletion>('/v1/story/guest-opening/complete', {
    method: 'POST',
    body: JSON.stringify(body),
  }),
  claim: (body: { claim_token: string }) =>
    request<ThemeRoundResultResponse>('/v1/story/guest-opening/claim', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
};
