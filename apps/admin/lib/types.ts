export type AdminDataMode = 'api' | 'mock';

export type AdminDataStatus = 'ready' | 'unavailable' | 'partial' | 'stale' | 'error';

export interface AdminDataEnvelope<T> {
  data: T | null;
  dataStatus: AdminDataStatus;
  updatedAt: string | null;
  source: 'database' | 'derived' | 'mock';
  warnings: string[];
}

export interface MetricCard {
  label: string;
  value: string;
  note: string;
  trend?: string;
  accent?: boolean;
  status?: AdminDataStatus;
}

export interface ActivityPoint {
  day: string;
  users: number;
}

export interface FunnelStep {
  label: string;
  value: number;
  count: number;
  status?: AdminDataStatus;
}

export interface OverviewData {
  metrics: {
    registrations: number;
    activeUsers: number | null; // null if product_events is not yet collecting
    completionRate: number;
    pendingFeedback: number;
  };
  activity: ActivityPoint[];
  funnel: FunnelStep[];
  updatedAt: string;
  excludesSyntheticUsers: boolean;
}

export interface AdminUserSummary {
  id: string;
  maskedEmail: string;
  registeredAt: string;
  lastActiveAt: string | null;
  maskedLastIp: string | null;
  loginCount: number;
  assessmentRoundCount: number;
  feedbackCount: number;
  correctionCount: number;
  portraitConfidence: number | null;
  status: 'active' | 'inactive';
  stage: string;
  device: string;
  location: string;
  isSynthetic?: boolean;
}

export interface AdminUsersPage {
  items: AdminUserSummary[];
  nextCursor: string | null;
  hasMore: boolean;
  totalCount: number;
  excludesSyntheticUsers: boolean;
}

export interface FeedbackItem {
  id: string;
  title: string;
  original: string;
  category: string;
  page: string;
  impact: number;
  severity: '高' | '中' | '低';
  owner: string;
  status: '新反馈' | '处理中' | '已确认' | '计划改进' | '已解决' | '已关闭';
  age: string;
}

export interface QualityDimensionDispute {
  dimension: string;
  dimensionLabel: string;
  disputeCount: number;
  rate: number;
}

export interface QuestionBankVersionComparison {
  version: string;
  isCurrent: boolean;
  sampleCount: number;
  completionRate: number;
  confirmationRate: number;
  rebuttalRate: number;
  status: 'active' | 'deprecated';
}

export interface AdminQualitySummary {
  confirmationRate: number;
  rebuttalRate: number;
  sufficientEvidenceCount: number;
  correctionEffectivenessRate: number | null; // null if correction_records state table not available
  disputedDimensions: QualityDimensionDispute[];
  versionComparisons: QuestionBankVersionComparison[];
}

export interface AdminMetricDefinition {
  key: string;
  label: string;
  description: string;
  numerator: string;
  denominator: string | null;
  sourceTables: string[];
  timeWindow: '24h' | '7d' | '30d' | 'all';
  excludesSyntheticUsers: boolean;
  status: AdminDataStatus;
}

export interface AdminSnapshot {
  mode: AdminDataMode;
  authenticated: boolean;
  overview: OverviewData;
  users: AdminUserSummary[];
  feedback: FeedbackItem[];
  quality: AdminQualitySummary;
  metricDefinitions?: AdminMetricDefinition[];
  usersNextCursor?: string | null;
  usersHasMore?: boolean;
  totalUsersCount?: number;
  warnings?: string[];
}

export interface RevealSensitiveRequest {
  targetUserId: string;
  action: 'reveal_email' | 'reveal_ip' | 'reveal_raw_words';
  reason: string;
}

export interface RevealSensitiveResponse {
  success: boolean;
  revealedValue: string;
  targetUserId: string;
  action: string;
  auditLogId: string;
}
