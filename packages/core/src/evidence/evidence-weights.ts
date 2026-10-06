// packages/core/src/evidence/evidence-weights.ts
// Evidence weight constants and frequency throttle logic [S1-active]

/**
 * Single authoritative evidence classification.
 * Replaces the old `source_type` for weight/frequency/coverage logic.
 */
export type EvidenceKind =
  | 'formal'
  | 'practice'
  | 'calibration'
  | 'reality'
  | 'decision'
  | 'correction';

/**
 * Base weight per evidence kind.
 * Used by the confidence engine and evidence write path.
 */
export const EVIDENCE_BASE_WEIGHT: Readonly<Record<EvidenceKind, number>> = {
  practice: 0.3,
  formal: 1.0,
  calibration: 1.0,
  reality: 1.0,
  decision: 1.2,
  correction: 0.8,
};

/**
 * Context needed for frequency throttle decisions.
 */
export interface FrequencyContext {
  /** Whether this is the user's first-ever baseline assessment */
  isFirstBaseline: boolean;
  /** Timestamp (ms) of the last calibration for the same dimension */
  lastCalibrationAt?: number;
  /** Number of micro-sandbox answers already submitted today */
  microSandboxTodayCount: number;
  /** Current timestamp (ms) */
  now: number;
}

/** Intent categories that map to specific frequency rules */
export type FrequencyIntent =
  | 'baseline'
  | 'calibration'
  | 'practice'
  | 'micro_sandbox'
  | 'shift_verify';

/** 3 days in milliseconds */
const THREE_DAYS_MS = 3 * 24 * 60 * 60 * 1000;

/** Daily micro-sandbox quota */
const MICRO_SANDBOX_DAILY_LIMIT = 3;

/**
 * Determines whether an evidence-producing action should proceed
 * and, if so, which kind/weight to assign.
 *
 * Returns null when the action is throttled (frequency limit hit).
 *
 * Frequency rules:
 * - calibration: rejected if last calibration < 3 days ago
 * - micro_sandbox: rejected if today count >= 3
 * - baseline: always formal ×1.0
 * - practice: always practice ×0.3
 * - shift_verify: always calibration ×1.0
 */
export function resolveFrequencyWeight(
  intent: FrequencyIntent,
  ctx: FrequencyContext,
): { kind: EvidenceKind; weight: number } | null {
  switch (intent) {
    case 'calibration': {
      if (
        ctx.lastCalibrationAt !== undefined &&
        ctx.now - ctx.lastCalibrationAt < THREE_DAYS_MS
      ) {
        return null; // Too recent — can downgrade to practice externally
      }
      return { kind: 'calibration', weight: EVIDENCE_BASE_WEIGHT.calibration };
    }

    case 'micro_sandbox': {
      if (ctx.microSandboxTodayCount >= MICRO_SANDBOX_DAILY_LIMIT) {
        return null; // Daily quota exceeded
      }
      return { kind: 'formal', weight: 0.8 };
    }

    case 'baseline': {
      return { kind: 'formal', weight: EVIDENCE_BASE_WEIGHT.formal };
    }

    case 'practice': {
      return { kind: 'practice', weight: EVIDENCE_BASE_WEIGHT.practice };
    }

    case 'shift_verify': {
      return { kind: 'calibration', weight: EVIDENCE_BASE_WEIGHT.calibration };
    }
  }
}
