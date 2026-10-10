// apps/web/lib/api.ts
// EVA Web API client — Phase 6/7
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
  return 'http://localhost:3101';
}

const API_BASE = resolveApiBase();
export { API_BASE };
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
  name?: string | null;
  username?: string;
  display_name?: string;
  avatar_url?: string | null;
  created_at?: string;
  baseline_completed?: boolean;
  sandbox_completed_today?: boolean;
  entitlement_tier?: 'free' | 'paid';
  capabilities?: {
    canUseCorrections: boolean;
    canContinueTesting: boolean;
  };
}

// ── 个人资料（昵称/头像） ─────────────────────────────────────────────────
export const accountApi = {
  updateName: (name: string) =>
    request<{ id: string; email: string; name: string | null; avatar_url: string | null }>(
      '/profile/me',
      { method: 'PATCH', body: JSON.stringify({ name }) }
    ),
  uploadAvatar: (file: File) => {
    const form = new FormData();
    form.append('file', file);
    return fetch(`${API_BASE}/profile/avatar`, {
      method: 'POST',
      body: form,
      credentials: 'include',
    }).then(async (res) => {
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: res.statusText }));
        throw new Error(err.message ?? `HTTP ${res.status}`);
      }
      return res.json() as Promise<{ avatar_url: string }>;
    });
  },
};

export const authApi = {
  me: (signal?: AbortSignal) => request<AuthUser>('/auth/me', { signal }),
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
  devLogin: (signal?: AbortSignal) =>
    request<{ user_id: string; email: string; message: string }>('/auth/dev-login', {
      method: 'POST',
      signal,
    }),
};

// ── Chat ───────────────────────────────────────────────────────────────────
export interface NextTestRecommendation {
  reason: string;
  target_dimension: string;
  suggested_format: string;
  urgency: 'high' | 'medium' | 'low';
  personalized_intro: string;
}

export interface ChatResponse {
  eva_message: string;
  engine_used: string | null;
  model: string | null;
  you_shifted?: {
    dimension: string;
    narrative_insight: string;
    before_quote?: string;
    after_quote?: string;
    magnitude?: 'subtle' | 'moderate' | 'profound';
    comparison_type?: 'recent' | 'longterm' | 'both';
  };
  dialogue_state?: Record<string, unknown>;
  diary_update?: unknown;
  correction_signal?: {
    source_type: 'chat_claim';
    source_id: string;
    dimension: string;
    original_text: string;
    corrected_text: string;
    explanation: string;
  } | null;
  next_test_recommendation?: NextTestRecommendation | null;
}

export interface ChatHistoryTurn {
  id: string;
  role: 'user' | 'eva';
  content: string;
  timestamp: number;
  engine_triggered?: string | null;
  topic_tags?: string[] | null;
}

export interface ChatHistoryResponse {
  user_id: string;
  conversation_history: ChatHistoryTurn[];
  active_conversation_id: string | null;
  total_turns: number;
  last_active: number;
}

export const chatApi = {
  send: (message: string, locale?: string) =>
    request<ChatResponse>('/chat/send', {
      method: 'POST',
      body: JSON.stringify({ message, ...(locale ? { locale } : {}) }),
    }),
  history: () => request<ChatHistoryResponse>('/chat/history'),
  getDialogueState: () => request<Record<string, unknown> | null>('/chat/dialogue-state'),
};

// ── Portrait history / legacy report transport ─────────────────────────────
// `reportApi` is kept for backend compatibility. In current product terms this
// powers portrait snapshots and portrait history, not a standalone report page.
export interface ReportStatus {
  report_id: string;
  status: 'generating' | 'completed' | 'failed';
  error_message: string | null;
  record_kind?: 'historical';
  current_evidence_status?: 'not_revalidated' | 'sources_changed';
}

export const reportApi = {
  trigger: (conversationId: string) =>
    request<{ job_id: string; status: string }>(`/report/trigger/${conversationId}`, {
      method: 'POST',
    }),
  get: (reportId: string) => request<Record<string, unknown>>(`/report/${reportId}`),
  getStatus: (reportId: string) => request<ReportStatus>(`/report/status/${reportId}`),
  getSnapshots: (limit = 10) =>
    request<Record<string, unknown>[]>('/report/snapshots?limit=' + limit),
  getHistory: (limit = 5) => request<Record<string, unknown>[]>('/report/history?limit=' + limit),
};

// ── Evidence ─────────────────────────────────────────────────────────────────
export const evidenceApi = {
  getByDimension: () => request<Record<string, unknown>[]>('/evidence/by-dimension'),
  getAll: (limit = 30) => request<Record<string, unknown>[]>('/evidence?limit=' + limit),
};

// ── Legacy diary archive transport ──────────────────────────────────────────
// `diaryApi` is retained because old diary_entries still exist as read-only
// archive data inside current Record / Weekly Review flows.
export interface DiaryEntry {
  id: string;
  entry_date: string;
  content: Record<string, string>;
  timezone?: string;
  created_at: string;
}

export const diaryApi = {
  submit: (entry: { date: string; answers: Record<string, string>; timezone?: string }) =>
    request<DiaryEntry>('/diary', { method: 'POST', body: JSON.stringify(entry) }),
  recent: (limit?: number, offset = 0) => request<DiaryEntry[]>(
    limit === undefined ? '/diary/recent' : `/diary/recent?limit=${limit}&offset=${offset}`,
  ),
};

// ── Weekly Review ────────────────────────────────────────────────────────────
export interface WeeklyReview {
  id?: string;
  week_start?: string;
  week_end?: string;
  summary: string | null;
  eva_message?: string | null;
  dominant_emotion?: string | null;
  mood_trend?: string;
  status?: 'not_generated';
  content?: {
    suggested_experiment?: WeeklyExperimentSuggestion | null;
    [key: string]: unknown;
  };
  created_at?: string;
}

export interface WeeklyExperimentSuggestion {
  action_text: string;
  trigger_context: string;
}

export type WeeklyExperimentOutcome = 'done' | 'partly_done' | 'no_opportunity' | 'paused';

export interface WeeklyExperiment {
  id: string;
  user_id: string;
  weekly_review_id: string;
  action_text: string;
  trigger_context: string;
  review_on: string;
  state: 'active' | 'completed' | 'paused';
  created_at: string;
  updated_at: string;
}

export const weeklyReviewApi = {
  current: () => request<WeeklyReview>('/weekly-review/current'),
  trigger: () =>
    request<{ job_id: string; week_start: string; week_end: string }>('/weekly-review/trigger', {
      method: 'POST',
    }),
  history: (limit = 8) => request<WeeklyReview[]>('/weekly-review/history?limit=' + limit),
  createExperiment: (reviewId: string) =>
    request<{ experiment: WeeklyExperiment; created: boolean }>(`/weekly-review/${reviewId}/experiments`, {
      method: 'POST',
    }),
};

export type ConsentType = 'memory_retention' | 'evidence_collection' | 'report_storage' |
  'third_party_sharing' | 'weekly_review_analysis' | 'report_generation' | 'chat_history_use';

export type RecordUsageScope = 'store_only' | 'analyze_permitted' | 'share_permitted';

export const consentApi = {
  status: () => request<Record<ConsentType, boolean>>('/consent/status'),
  exportData: () => request<Record<string, unknown[]>>('/consent/export'),
  grant: (consentType: ConsentType) => request<{ granted: boolean }>('/consent/grant', {
    method: 'POST',
    body: JSON.stringify({ consent_type: consentType }),
  }),
  revoke: (consentType: ConsentType) => request<{ revoked: boolean }>('/consent/revoke', {
    method: 'POST',
    body: JSON.stringify({ consent_type: consentType }),
  }),
  getRecordScope: () => request<{ scope: RecordUsageScope | 'unset' }>('/consent/record-scope'),
  setRecordScope: (scope: RecordUsageScope) => request<{ scope: RecordUsageScope }>('/consent/record-scope', {
    method: 'POST',
    body: JSON.stringify({ scope }),
  }),
};

export const weeklyExperimentsApi = {
  checkIn: (experimentId: string, body: { outcome: WeeklyExperimentOutcome; note: string | null }) =>
    request<{ experiment: WeeklyExperiment; checkin: { id: string; outcome: WeeklyExperimentOutcome; note: string | null; created_at: string } }>(
      `/weekly-experiments/${experimentId}/checkins`,
      { method: 'POST', body: JSON.stringify(body) },
    ),
};

// ── Retired assessment history (read-only compatibility) ────────────────────
export interface AssessmentRunRecord {
  id: string;
  locale: string;
  script_version: string;
  scenario_set: string;
  result: Record<string, unknown>;
  completed_at: string;
}

export const assessmentApi = {
  latest: () => request<AssessmentRunRecord | null>('/assessment/latest'),
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

export interface AiInsight {
  source: 'ai';
  model: string;
  generated_at: string;
  disclaimer: string;
  paragraphs: Array<{
    text: string;
    evidence_question_ids: string[];
  }>;
}

export interface ThemeRoundResult {
  theme_lens: ThemeLens;
  theme_title: string;
  headline: string;
  summary: string;
  observations: Array<{ focus: string; text: string; evidence_question_id: string; evidence_question_ids?: string[] }>;
  strength: string;
  watchout: string;
  counterevidence: string;
  boundary: string;
  evidence: ThemeRoundEvidence[];
  ai_insight?: AiInsight;
  guest_report?: GuestChapterRecord;
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

/** 进行中轮次的浏览器端暂存：只存续玩入口，不存答案数据（答案仍在服务端） */
export const ACTIVE_ROUND_STORAGE_KEY = 'eva_active_round';

export interface ActiveRoundRef {
  roundId: string;
  themeTitle: string;
  updatedAt: string;
}

export function writeActiveRound(round: { roundId: string; themeTitle: string }) {
  try {
    const payload: ActiveRoundRef = { ...round, updatedAt: new Date().toISOString() };
    window.localStorage.setItem(ACTIVE_ROUND_STORAGE_KEY, JSON.stringify(payload));
  } catch {}
}

export function readActiveRound(): ActiveRoundRef | null {
  try {
    const raw = window.localStorage.getItem(ACTIVE_ROUND_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<ActiveRoundRef>;
    if (!parsed?.roundId) return null;
    return {
      roundId: parsed.roundId,
      themeTitle: parsed.themeTitle ?? '主题测试',
      updatedAt: parsed.updatedAt ?? '',
    };
  } catch {
    return null;
  }
}

export function clearActiveRound() {
  try {
    window.localStorage.removeItem(ACTIVE_ROUND_STORAGE_KEY);
  } catch {}
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
  abandon: (roundId: string) =>
    request<{ round: { id: string; status: string } }>(
      `/v1/assessment-rounds/${roundId}/abandon`,
      { method: 'POST' }
    ),
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

export interface EvolutionDimension {
  key: string;
  baseline: number;
  current: number;
  delta_7d: number;
  confidence: number;
  evidence_count_7d: number;
  correction_count_30d: number;
  last_evidence_at: string | null;
}

export interface ProfileEvolutionResponse {
  dimensions: EvolutionDimension[];
  baseline_vector: Record<string, number>;
  current_vector: Record<string, number>;
  delta_7d: Record<string, number>;
  confidence_by_dim: Record<string, number>;
  last_updated_at: string;
}

export interface ProfileCurrentVectorResponse {
  baseline_vector: Record<string, number>;
  current_vector: Record<string, number>;
  delta_vector: Record<string, number>;
  confidence_vector: Record<string, number>;
  evidence_counts_7d: Record<string, number>;
  correction_counts_30d: Record<string, number>;
  last_updated_at: string;
}

export interface PortraitEvidenceItem {
  id: string;
  sourceType: string;
  evidenceKind: string;
  quote: string | null;
  explanation: string;
  createdAt: string;
}

export interface PortraitObservation {
  id: string;
  dimension: string;
  status: 'insufficient_evidence';
  evidence: PortraitEvidenceItem[];
  limitation: '目前无法判断长期模式。';
}

/** Response shape for GET /profile/portrait */
export interface ProfilePortraitResponse {
  modelStatus: 'legacy';
  deprecated: true;
  observations: PortraitObservation[];
  overallLimitation: '目前无法判断长期模式。';
}

export interface PortraitV1Response {
  model_status: 'unknown' | 'available';
  portrait_id: string | null;
  revision_id: string | null;
  portrait_state: 'unknown' | 'active' | 'quarantined';
  dimensions: Array<{
    dimension_key: string;
    layer: 'tendency' | 'state' | 'situational';
    status: 'unknown' | 'insufficient_evidence' | 'non_comparable' | 'available';
    context_key: Record<string, unknown>;
    limitation_codes: string[];
  }>;
  limitations: string[];
}

export interface PublishedObservationV1 {
  observation_id: string;
  revision_id: string;
  text: string | null;
  published_at: string | null;
  feedback_state: 'uncontested' | 'needs_follow_up';
}

export type ObservationResponseAction = 'confirm' | 'partial' | 'refute' | 'clarify';

export interface ObservationResponseV1 {
  response_id: string;
  correction_id: string | null;
  state: 'recorded' | 'confirmed' | 'pending_validation';
  replayed: boolean;
}

export const profileApi = {
  evolution: () => request<ProfileEvolutionResponse>('/profile/evolution'),
  currentVector: () => request<ProfileCurrentVectorResponse>('/profile/current-vector'),
  getPortrait: () => request<ProfilePortraitResponse>('/profile/portrait'),
};

export const portraitV1Api = {
  current: () => request<PortraitV1Response>('/v1/portrait/current'),
};

// ── Evidence source（2-A3 片段定位：点开原文并高亮触发句）──────────────────
export interface EvidenceSourceFragment {
  field: string;
  start: number;
  end: number;
  locator: string;
}

export interface EvidenceSourceResponse {
  evidence_id: string;
  source_type: string;
  source_id: string | null;
  /** 还原后的字段原文；偏移失效或非 diary 源时为 null */
  content_text: string | null;
  fragment: EvidenceSourceFragment | null;
}

export async function fetchEvidenceSource(evidenceId: string): Promise<EvidenceSourceResponse> {
  return request<EvidenceSourceResponse>(
    `/profile/evidence/${encodeURIComponent(evidenceId)}/source`,
  );
}

// ── 1-2b：按证据驳回（用户第一纠偏权，Portrait 弹层内直达）────────────────
export interface WithdrawEvidenceResponse {
  evidence_id: string;
  dimension: string;
  portrait_status: string;
  recomputed: { dimension: string; confidence: number; value: number } | null;
  already_withdrawn: boolean;
}

export async function withdrawEvidence(evidenceId: string): Promise<WithdrawEvidenceResponse> {
  return request<WithdrawEvidenceResponse>(
    `/profile/evidence/${encodeURIComponent(evidenceId)}/withdraw`,
    { method: 'POST' },
  );
}


export const observationsV1Api = {
  list: () => request<PublishedObservationV1[]>('/v1/observations'),
  respond: (
    observationId: string,
    revisionId: string,
    command: { operation_id: string; action: ObservationResponseAction; explanation?: string }
  ) =>
    request<ObservationResponseV1>(
      `/v1/observations/${observationId}/revisions/${revisionId}/responses`,
      {
        method: 'POST',
        body: JSON.stringify(command),
      }
    ),
};

// ── Captures ─────────────────────────────────────────────────────────────────
export type CaptureEntryType = 'quick_fragment' | 'emotion_log' | 'decision_log';
export type CaptureProcessMode = 'save_only' | 'organize' | 'analyze';
export type CaptureModality = 'text' | 'voice_transcript' | 'image';

export interface CreateCaptureDto {
  entry_type: CaptureEntryType;
  process_mode: CaptureProcessMode;
  modality: CaptureModality;
  raw_text: string;
  mood_label?: string;
  mood_intensity?: number; // 1-5
  local_date?: string; // YYYY-MM-DD
  timezone?: string;
  allow_weekly_review?: boolean;
}

export interface CaptureInterpretation {
  id: string;
  dimension: string;
  ai_explanation: string;
  proposed_delta: number | null;
  status: 'pending' | 'confirmed' | 'refuted';
  support_count: number;
}

export interface CaptureRecord {
  id: string;
  entry_type: CaptureEntryType;
  process_mode: CaptureProcessMode;
  allow_weekly_review: boolean;
  modality: CaptureModality;
  raw_text: string;
  mood_label?: string | null;
  mood_intensity?: number | null;
  local_date: string;
  captured_at: string;
  summary?: string | null;
  interpretations?: CaptureInterpretation[];
}

type RawCaptureRecord = {
  id: string;
  entry_type: CaptureEntryType;
  process_mode: CaptureProcessMode;
  allow_weekly_review: boolean;
  modality: CaptureModality;
  raw_text: string;
  mood_label?: string | null;
  mood_intensity?: number | null;
  local_date: string;
  captured_at: string;
  interpretations?: CaptureInterpretation[];
  summary?: string | null;
};

type RawCaptureCreateResponse = {
  capture: RawCaptureRecord;
  interpretations?: CaptureInterpretation[];
  summary?: string | null;
};

type RawCaptureListResponse = {
  captures: RawCaptureRecord[];
};

function normalizeCaptureRecord(
  capture: RawCaptureRecord,
  interpretations?: CaptureInterpretation[],
  summary?: string | null
): CaptureRecord {
  return {
    id: capture.id,
    entry_type: capture.entry_type,
    process_mode: capture.process_mode,
    allow_weekly_review: capture.allow_weekly_review ?? false,
    modality: capture.modality,
    raw_text: capture.raw_text,
    mood_label: capture.mood_label ?? null,
    mood_intensity: capture.mood_intensity ?? null,
    local_date: capture.local_date,
    captured_at: capture.captured_at,
    summary: summary ?? capture.summary ?? null,
    interpretations: interpretations ?? capture.interpretations ?? [],
  };
}

export const capturesApi = {
  create: async (body: CreateCaptureDto) => {
    const raw = await request<RawCaptureCreateResponse>('/captures', {
      method: 'POST',
      body: JSON.stringify(body),
    });
    return normalizeCaptureRecord(raw.capture, raw.interpretations, raw.summary);
  },
  analyze: async (captureId: string) => {
    const raw = await request<RawCaptureCreateResponse>(`/captures/${captureId}/analyze`, {
      method: 'POST',
    });
    return normalizeCaptureRecord(raw.capture, raw.interpretations, raw.summary);
  },
  list: async (limit = 30, offset = 0) => {
    const raw = await request<RawCaptureListResponse>(`/captures?limit=${limit}${offset ? `&offset=${offset}` : ''}`);
    return raw.captures.map((capture) => normalizeCaptureRecord(capture));
  },
  setWeeklyReviewPermission: async (captureId: string, allowed: boolean) => {
    const raw = await request<RawCaptureRecord>(`/captures/${captureId}/weekly-review-permission`, {
      method: 'PATCH',
      body: JSON.stringify({ allowed }),
    });
    return normalizeCaptureRecord(raw);
  },
  confirmInterpretation: async (captureId: string, interpretationId: string) => {
    await request<Record<string, unknown>>(
      `/captures/${captureId}/interpretations/${interpretationId}/confirm`,
      {
        method: 'POST',
      }
    );
    return { success: true };
  },
  refuteInterpretation: async (captureId: string, interpretationId: string) => {
    await request<Record<string, unknown>>(
      `/captures/${captureId}/interpretations/${interpretationId}/refute`,
      { method: 'POST' },
    );
    return { success: true };
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
  story_replay: string;
  observations: Array<{
    id: string;
    title: string;
    text: string;
    evidence_node_ids: string[];
    evidence: Array<{
      node_id: string;
      node_title: string;
      choice_text: string;
    }>;
    reflection_question: string;
  }>;
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

// --- TELEMETRY & FEEDBACK (same-origin API routes) ---
export const telemetryApi = {
  async emitEvent(event: Partial<Record<string, any>>): Promise<void> {
    await request('/product-events', {
      method: 'POST',
      body: JSON.stringify(event),
    }).catch(e => console.warn('Telemetry event failed:', e));
  },
  
  async submitFeedback(payload: { category: string; content: string; sourcePage: string; severity?: string }): Promise<void> {
    await request('/product-feedback', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }
};
