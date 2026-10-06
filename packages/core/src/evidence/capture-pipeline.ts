// packages/core/src/evidence/capture-pipeline.ts
// Reality fragment capture processing pipeline [S1-active]
// Pure function module — no database calls, no network calls.
// The `interpret` parameter is a dependency-injection hook for AI interpretation.

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

/** Three processing modes for captured fragments */
export type ProcessMode = 'save_only' | 'organize' | 'analyze';

/** Input modality with associated source weight */
export type Modality = 'text' | 'voice_transcript' | 'image';

/** Three capture entry types */
export type EntryType = 'quick_fragment' | 'emotion_log' | 'decision_log';

// ─────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────

/**
 * Source weight by modality.
 * text = highest fidelity; voice_transcript = partial loss; image = context only.
 */
export const MODALITY_WEIGHT: Readonly<Record<Modality, number>> = {
  text: 1.0,
  voice_transcript: 0.6,
  image: 0.2,
};

// ─────────────────────────────────────────────────────────────
// Interfaces
// ─────────────────────────────────────────────────────────────

export interface CaptureInput {
  userId: string;
  entryType: EntryType;
  processMode: ProcessMode;
  modality: Modality;
  rawText?: string;
  mediaUrl?: string;
  moodLabel?: string;
  moodIntensity?: number;
  localDate?: string;
  timezone?: string;
}

export interface InterpretationResult {
  dimension: string;
  aiExplanation: string;
  proposedDelta: number;
  aiConfidence: number;
  status: 'pending';
}

export interface CaptureProcessResult {
  /** Source weight based on modality */
  sourceWeight: number;
  /** Evidence kind for this capture type */
  evidenceKind: 'reality' | 'decision';
  /** Processing output varies by mode */
  interpretations: InterpretationResult[];
  /** Summary text (only for organize/analyze modes) */
  summary?: string;
}

// ─────────────────────────────────────────────────────────────
// Implementation
// ─────────────────────────────────────────────────────────────

/**
 * Process a capture through the pipeline.
 * Pure function — no DB, no AI calls.
 *
 * - save_only: no interpretations, no summary
 * - organize: produces summary (placeholder), no interpretations
 * - analyze: produces pending interpretations via the interpret callback
 *
 * The `interpret` callback simulates AI interpretation (for testing/DI).
 * In production, the API layer provides the real AI integration.
 */
export function processCapture(
  input: CaptureInput,
  interpret?: (text: string) => InterpretationResult[],
): CaptureProcessResult {
  const sourceWeight = MODALITY_WEIGHT[input.modality];
  const evidenceKind = captureToEvidenceKind(input.entryType);

  switch (input.processMode) {
    case 'save_only': {
      return {
        sourceWeight,
        evidenceKind,
        interpretations: [],
      };
    }

    case 'organize': {
      const summary = input.rawText
        ? input.rawText.slice(0, 100)
        : undefined;
      return {
        sourceWeight,
        evidenceKind,
        interpretations: [],
        summary,
      };
    }

    case 'analyze': {
      const text = input.rawText ?? '';
      const interpretations =
        interpret && text.length > 0 ? interpret(text) : [];
      const summary = text.length > 0
        ? text.slice(0, 100)
        : undefined;
      return {
        sourceWeight,
        evidenceKind,
        interpretations,
        summary,
      };
    }
  }
}

/**
 * Map entry type to evidence_kind.
 * - decision_log → 'decision' (base weight ×1.2)
 * - quick_fragment, emotion_log → 'reality' (base weight ×1.0)
 */
export function captureToEvidenceKind(entryType: EntryType): 'reality' | 'decision' {
  if (entryType === 'decision_log') {
    return 'decision';
  }
  return 'reality';
}

/**
 * Determine if an interpretation should emit evidence.
 *
 * Interpretation promotion rules:
 * - status = 'confirmed' → emit at weight 1.0
 * - support_count >= 3 → emit at weight 0.8
 * - otherwise → don't emit (return null)
 */
export function shouldEmitEvidence(
  status: 'pending' | 'confirmed' | 'refuted',
  supportCount: number,
): { emit: boolean; weight: number } | null {
  if (status === 'confirmed') {
    return { emit: true, weight: 1.0 };
  }

  if (status === 'refuted') {
    return null;
  }

  // status === 'pending'
  if (supportCount >= 3) {
    return { emit: true, weight: 0.8 };
  }

  return null;
}
