// packages/core/src/evidence/evidence-types.ts
// Pure domain types for evidence layer

import type { PersonalityDimension, EvidenceSourceType } from '../shared/personalityDimensions.js';
import type { EpistemicSource, EvidenceContentKind, SubjectAttribution } from './evidence-semantics.js';

export type { EvidenceSourceType };

export type EvidenceDimension =
  | 'trustBoundaries'
  | 'conflictResponse'
  | 'attachment'
  | 'emotionRegulation'
  | 'stressResponse'
  | 'achievementMotivation'
  | 'selfCognition'
  | 'socialEnergy'
  | 'emotionalGranularity'
  | 'shameSensitivity'
  | 'helpSeekingPattern'
  | 'linguisticExtraversion'
  | 'narrativeCoherence'
  | 'growthOrientation';

/**
 * 证据在原始输入中的定位片段（阶段 2-A 片段定位）。
 * 落库到 evidence_source_fragments.fragment_locator，供前端"点开原文并高亮"。
 */
export interface EvidenceFragment {
  /** 原始输入的字段名（diary: detail/highPoint/lowPoint/patternNoticed/connectionOrDistance） */
  field: string;
  /** 字段文本内的字符区间 [start, end)，`fieldText.slice(start, end)` 可重算验证 */
  start: number;
  end: number;
  /** 区间文本（触发词所在句） */
  text: string;
  /** 地址格式：`${field}:${start}-${end}` */
  locator: string;
}

/** 主语归因（2-B1）：命中描述的是本人、他人还是假设场景 */
export type EvidenceAttribution = 'self' | 'about_other' | 'hypothetical';

/** Parameters for writing a single evidence event */
export interface WriteEvidenceParams {
  userId: string;
  /** Legacy storage source tag. Prefer evidence_kind for current product semantics. */
  sourceType: 'test' | 'chat' | 'diary' | 'user_correction' | 'capture';
  sourceId?: string | null;
  dimension: EvidenceDimension;
  delta?: number | null;
  weight?: number;
  confidence?: number;
  quote?: string | null;
  explanation: string;
  /** 可选：片段定位信息（存在时由写入方同步落 evidence_source_fragments） */
  fragment?: EvidenceFragment;
  /**
   * 可选：主语归因（2-B，当前仅 diary 抽取产出）。
   * 非 self 的事件由写入方置 candidate=true + quality_metadata.attribution，
   * 数据保留但被 1-3 过滤器与 formal 晋升排除出本人画像计算（D2-1）。
   */
  attribution?: EvidenceAttribution;
}

/** Raw evidence row (from DB query) */
export interface EvidenceEventRow {
  id: string;
  user_id: string;
  source_type: 'test' | 'chat' | 'diary' | 'user_correction' | 'capture';
  source_id: string | null;
  dimension: string;
  delta: number | null;
  weight: number;
  confidence: number;
  quote: string | null;
  explanation: string;
  created_at: Date;
  /** [S1] Single authoritative evidence classification for current product semantics */
  evidence_kind?: 'formal' | 'practice' | 'calibration' | 'reality' | 'decision' | 'correction' | 'chat_legacy';
  /** [S1] Local date for same-day diminishing logic */
  local_date?: string | null;
  /** [S1] Candidate evidence does not enter formal aggregation */
  candidate?: boolean;
  /** [S1] Evidence mode: choice selection or free-text input */
  evidence_mode?: 'choice' | 'input';
  epistemic_source?: EpistemicSource;
  content_kind?: EvidenceContentKind;
  source_independence_group?: string | null;
  attribution?: SubjectAttribution;
  portrait_status?: string;
}

/** Summary for one dimension */
export interface DimensionEvidenceSummary {
  dimension: EvidenceDimension;
  totalEvidence: number;
  evidenceBySource: Record<'test' | 'chat' | 'diary' | 'user_correction' | 'capture', number>;
  avgConfidence: number;
  weightedDeltaSum: number;
  weightConfidenceSum: number;
  latestEvidence: EvidenceEventRow | null;
}
