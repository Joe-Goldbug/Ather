// apps/api/src/queue/queue.ts
// BullMQ queue definitions — Phase 5
// All long-running / async tasks go through these queues

export const QUEUE_NAMES = {
  REPORT: 'report-generation',
  WEEKLY_REVIEW: 'weekly-review',
  MEMORY_AGGREGATE: 'memory-aggregate',
  SNAPSHOT: 'personality-snapshot',
  SCRIPT_GENERATION: 'script-generation',
} as const;

// Job payload types
export interface ReportJob {
  reportId: string;
  conversationId: string;
  userId: string;
  locale?: string;
}

export interface WeeklyReviewJob {
  userId: string;
  weekStart: string; // ISO date
  weekEnd: string;
  locale?: string;
}

export interface MemoryAggregateJob {
  userId: string;
}

export interface SnapshotJob {
  userId: string;
  sourceType: 'test' | 'chat_turn' | 'report_gen';
  sourceId?: string;
  conversationId?: string;
  /** Locale for shift narrative generation (default 'zh-CN'). */
  locale?: string;
  /**
   * When true, detection is forced even if the global feature flag is off
   * (e.g. user clicks "check for changes" on the Profile page).
   */
  immediate?: boolean;
}

export interface ScriptGenerationJob {
  generationId: string;
  sessionId: string;
  userId: string;
}

// Queue name → default options
export const QUEUE_CONFIGS = {
  [QUEUE_NAMES.REPORT]: {
    attempts: 3,
    backoff: { type: 'exponential' as const, delay: 5000 },
    removeOnComplete: { count: 100 },
    removeOnFail: { count: 500 },
  },
  [QUEUE_NAMES.WEEKLY_REVIEW]: {
    attempts: 2,
    backoff: { type: 'exponential' as const, delay: 3000 },
    removeOnComplete: { count: 50 },
    removeOnFail: { count: 200 },
  },
  // 此前这两个队列是 attempts:1 + removeOnFail:{count:0} —— 失败即删除，
  // 无死信、无告警、不可重放，造成"数据管线已断但监控显示健康"。
  [QUEUE_NAMES.MEMORY_AGGREGATE]: {
    attempts: 3,
    backoff: { type: 'exponential' as const, delay: 3000 },
    removeOnComplete: { count: 200 },
    removeOnFail: { count: 500 },
  },
  [QUEUE_NAMES.SNAPSHOT]: {
    attempts: 3,
    backoff: { type: 'exponential' as const, delay: 3000 },
    removeOnComplete: { count: 300 },
    removeOnFail: { count: 500 },
  },
  // Dynamic-script: one retry is enough — the user can re-trigger from the UI
  // and longer M3 retries consume quota without much benefit.
  [QUEUE_NAMES.SCRIPT_GENERATION]: {
    attempts: 2,
    backoff: { type: 'exponential' as const, delay: 5000 },
    removeOnComplete: { count: 200 },
    removeOnFail: { count: 500 },
  },
} as const;
