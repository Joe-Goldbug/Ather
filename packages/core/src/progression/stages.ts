// packages/core/src/progression/stages.ts
// Stage unlock engine [S1-active]
// Defines StageId, Stage2/Stage3 capability placeholders, and unlock evaluation

// ─────────────────────────────────────────────────────────────
// Stage types
// ─────────────────────────────────────────────────────────────

export type StageId = 1 | 2 | 3;

// ─────────────────────────────────────────────────────────────
// [S2/3-reserved] Capability placeholders — not implemented in S1
// ─────────────────────────────────────────────────────────────

/** [S2/3-reserved] Stage 2 digital-self capability placeholder */
export interface Stage2Capability {
  simulateSelfResponse: () => never;
}

/** [S2/3-reserved] Stage 3 digital-twin capability placeholder */
export interface Stage3Capability {
  actAsTwin: () => never;
}

// ─────────────────────────────────────────────────────────────
// Unlock input/output interfaces
// ─────────────────────────────────────────────────────────────

export interface Stage2UnlockInput {
  /** Number of core dimensions with confidence >= 0.60 */
  dimensionsAtThreshold: number;
  /** Whether any dimension has unresolved contradictions */
  hasContradictions: boolean;
  /** Number of distinct evidence source categories (test/capture/decision) */
  distinctSourceCount: number;
  /** Number of corrections submitted by user */
  correctionCount: number;
  /** Days since first evidence was recorded */
  daysSinceFirstEvidence: number;
}

export interface UnlockResult {
  unlocked: boolean;
  stage: StageId;
  /** When locked, describes what's missing */
  gaps: string[];
}

// ─────────────────────────────────────────────────────────────
// Constants (thresholds)
// ─────────────────────────────────────────────────────────────

export const STAGE2_MIN_DIMENSIONS = 4;
export const STAGE2_MIN_SOURCES = 2;
export const STAGE2_MIN_CORRECTIONS = 1;
export const STAGE2_MIN_DAYS = 7;

// ─────────────────────────────────────────────────────────────
// Stage 2 unlock evaluation
// ─────────────────────────────────────────────────────────────

/**
 * Evaluate Stage 2 unlock conditions. ALL five must be met:
 * 1. dimensionsAtThreshold >= 4 (at least 4 core dims have confidence >= 0.60)
 * 2. hasContradictions === false (no unresolved contradictions)
 * 3. distinctSourceCount >= 2 (evidence from at least 2 source categories)
 * 4. correctionCount >= 1 (user has engaged with the correction mechanism)
 * 5. daysSinceFirstEvidence >= 7 (minimum time for model to mature)
 *
 * If ALL pass → unlocked=true, stage=2, gaps=[]
 * Otherwise → unlocked=false, stage=1, gaps describes what's missing
 */
export function evaluateStage2Unlock(input: Stage2UnlockInput): UnlockResult {
  const gaps: string[] = [];

  if (input.dimensionsAtThreshold < STAGE2_MIN_DIMENSIONS) {
    gaps.push('需要更多维度达到可信阈值');
  }

  if (input.hasContradictions) {
    gaps.push('存在未解决的矛盾证据');
  }

  if (input.distinctSourceCount < STAGE2_MIN_SOURCES) {
    gaps.push('需要更多来源类型的证据');
  }

  if (input.correctionCount < STAGE2_MIN_CORRECTIONS) {
    gaps.push('需要至少一次纠正反馈');
  }

  if (input.daysSinceFirstEvidence < STAGE2_MIN_DAYS) {
    gaps.push('模型需要更多时间成熟');
  }

  const unlocked = gaps.length === 0;

  return {
    unlocked,
    stage: unlocked ? 2 : 1,
    gaps,
  };
}

// ─────────────────────────────────────────────────────────────
// Stage 3 unlock evaluation [S2/3-reserved]
// ─────────────────────────────────────────────────────────────

/**
 * Stage 3 unlock — always returns locked (reserved for future).
 * [S2/3-reserved] This will be implemented when Stage 3 is ready.
 */
export function evaluateStage3Unlock(): UnlockResult {
  return {
    unlocked: false,
    stage: 2,
    gaps: ['stage3_reserved'],
  };
}
