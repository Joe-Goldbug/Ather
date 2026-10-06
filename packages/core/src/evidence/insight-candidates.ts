// packages/core/src/evidence/insight-candidates.ts
// Candidate generation + rough ranking + output gate (pure functions)

export interface InsightDimensionInput {
  dimension: string;
  confidence: number; // [0,1]
  evidence_count_7d: number;
  correction_count_14d: number;
  weighted_delta_7d: number; // expected range [-1, 1]
  conflict_detected?: boolean;
  last_evidence_at?: string | null;
}

export type InsightCandidateLabel = 'strong' | 'tentative' | 'conflicted' | 'hold';

export interface InsightCandidate {
  candidate_id: string;
  dimension: string;
  evidence_count_7d: number;
  correction_count_14d: number;
  evidence_strength: number; // [0,1]
  confidence: number; // [0,1]
  recency_score: number; // [0,1]
  correction_penalty: number; // [0,1]
  conflict_penalty: number; // [0,1]
  weighted_delta_7d: number; // [-1, 1]
  final_score: number; // [0,1]
  label: InsightCandidateLabel;
  show_in_ui: boolean;
  gate_reason: 'ok' | 'low_confidence' | 'high_correction' | 'conflicted';
}

const DAY_MS = 24 * 60 * 60 * 1000;

const GATE_MIN_CONFIDENCE = 0.35;
const GATE_HIGH_CORRECTION_COUNT = 3;
const RECENCY_DECAY_DAYS = 14;

function clamp01(v: number): number {
  if (!Number.isFinite(v)) return 0;
  return Math.max(0, Math.min(1, v));
}

function recencyScore(lastEvidenceAt?: string | null, nowTs = Date.now()): number {
  if (!lastEvidenceAt) return 0.25;
  const ts = new Date(lastEvidenceAt).getTime();
  if (!Number.isFinite(ts)) return 0.25;
  const ageDays = Math.max(0, (nowTs - ts) / DAY_MS);
  return clamp01(Math.exp(-ageDays / RECENCY_DECAY_DAYS));
}

function buildCandidateId(dimension: string): string {
  return `insight_${dimension}`;
}

export function buildInsightCandidates(
  inputs: InsightDimensionInput[],
  nowTs = Date.now(),
): InsightCandidate[] {
  const ranked = inputs.map((it) => {
    const confidence = clamp01(it.confidence);
    const evidence_strength = clamp01(it.evidence_count_7d / 5);
    const recent = recencyScore(it.last_evidence_at, nowTs);
    const correction_penalty = clamp01(it.correction_count_14d / 5);
    const conflict_penalty = it.conflict_detected ? 0.35 : 0;

    const gateLowConfidence = confidence < GATE_MIN_CONFIDENCE;
    const gateHighCorrection = it.correction_count_14d >= GATE_HIGH_CORRECTION_COUNT;
    const gateConflicted = Boolean(it.conflict_detected);

    let label: InsightCandidateLabel = 'strong';
    let gate_reason: InsightCandidate['gate_reason'] = 'ok';
    let show_in_ui = true;

    if (gateLowConfidence) {
      label = 'hold';
      gate_reason = 'low_confidence';
      show_in_ui = false;
    } else if (gateConflicted) {
      label = 'conflicted';
      gate_reason = 'conflicted';
      show_in_ui = true;
    } else if (gateHighCorrection) {
      label = 'tentative';
      gate_reason = 'high_correction';
      show_in_ui = true;
    }

    const final_score = clamp01(
      confidence * 0.4 +
      evidence_strength * 0.3 +
      recent * 0.2 +
      clamp01(1 - correction_penalty) * 0.1 -
      conflict_penalty,
    );

    return {
      candidate_id: buildCandidateId(it.dimension),
      dimension: it.dimension,
      evidence_count_7d: Math.max(0, it.evidence_count_7d),
      correction_count_14d: Math.max(0, it.correction_count_14d),
      evidence_strength,
      confidence,
      recency_score: recent,
      correction_penalty,
      conflict_penalty,
      weighted_delta_7d: clamp01((it.weighted_delta_7d + 1) / 2) * 2 - 1,
      final_score,
      label,
      show_in_ui,
      gate_reason,
    };
  });

  ranked.sort((a, b) => b.final_score - a.final_score);
  return ranked;
}

export function topLowConfidenceDimensions(
  candidates: InsightCandidate[],
  topN = 3,
): string[] {
  return [...candidates]
    .sort((a, b) => a.confidence - b.confidence)
    .slice(0, topN)
    .map((c) => c.dimension);
}
