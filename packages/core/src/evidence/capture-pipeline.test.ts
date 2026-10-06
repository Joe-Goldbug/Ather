import { describe, expect, test } from 'bun:test';
import {
  processCapture,
  captureToEvidenceKind,
  shouldEmitEvidence,
  MODALITY_WEIGHT,
  type CaptureInput,
  type InterpretationResult,
} from './capture-pipeline.js';

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

function makeInput(overrides: Partial<CaptureInput> = {}): CaptureInput {
  return {
    userId: 'user-1',
    entryType: 'quick_fragment',
    processMode: 'save_only',
    modality: 'text',
    rawText: 'I had a meaningful conversation today.',
    ...overrides,
  };
}

function mockInterpret(text: string): InterpretationResult[] {
  return [
    {
      dimension: 'trustBoundaries',
      aiExplanation: `Interpreted from: ${text.slice(0, 20)}`,
      proposedDelta: 0.1,
      aiConfidence: 0.7,
      status: 'pending',
    },
  ];
}

// ─────────────────────────────────────────────────────────────
// MODALITY_WEIGHT constants
// ─────────────────────────────────────────────────────────────

describe('MODALITY_WEIGHT', () => {
  test('text weight is 1.0', () => {
    expect(MODALITY_WEIGHT.text).toBe(1.0);
  });

  test('voice_transcript weight is 0.6', () => {
    expect(MODALITY_WEIGHT.voice_transcript).toBe(0.6);
  });

  test('image weight is 0.2', () => {
    expect(MODALITY_WEIGHT.image).toBe(0.2);
  });
});

// ─────────────────────────────────────────────────────────────
// processCapture — save_only mode
// ─────────────────────────────────────────────────────────────

describe('processCapture — save_only mode', () => {
  test('returns empty interpretations and no summary', () => {
    const result = processCapture(makeInput({ processMode: 'save_only' }));
    expect(result.interpretations).toEqual([]);
    expect(result.summary).toBeUndefined();
  });

  test('returns correct sourceWeight for text modality', () => {
    const result = processCapture(makeInput({ processMode: 'save_only', modality: 'text' }));
    expect(result.sourceWeight).toBe(1.0);
  });

  test('returns correct sourceWeight for voice_transcript', () => {
    const result = processCapture(makeInput({ processMode: 'save_only', modality: 'voice_transcript' }));
    expect(result.sourceWeight).toBe(0.6);
  });

  test('returns correct sourceWeight for image', () => {
    const result = processCapture(makeInput({ processMode: 'save_only', modality: 'image' }));
    expect(result.sourceWeight).toBe(0.2);
  });

  test('returns reality evidenceKind for quick_fragment', () => {
    const result = processCapture(makeInput({ entryType: 'quick_fragment', processMode: 'save_only' }));
    expect(result.evidenceKind).toBe('reality');
  });

  test('returns decision evidenceKind for decision_log', () => {
    const result = processCapture(makeInput({ entryType: 'decision_log', processMode: 'save_only' }));
    expect(result.evidenceKind).toBe('decision');
  });

  test('does not call interpret callback even if provided', () => {
    let called = false;
    processCapture(makeInput({ processMode: 'save_only' }), () => {
      called = true;
      return [];
    });
    expect(called).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────
// processCapture — organize mode
// ─────────────────────────────────────────────────────────────

describe('processCapture — organize mode', () => {
  test('returns empty interpretations', () => {
    const result = processCapture(makeInput({ processMode: 'organize' }));
    expect(result.interpretations).toEqual([]);
  });

  test('returns a literal excerpt rather than a generated summary', () => {
    const result = processCapture(makeInput({ processMode: 'organize', rawText: 'Some text' }));
    expect(result.summary).toBe('Some text');
  });

  test('returns no excerpt when rawText is empty/missing', () => {
    const result = processCapture(makeInput({ processMode: 'organize', rawText: undefined }));
    expect(result.summary).toBeUndefined();
  });

  test('does not call interpret callback', () => {
    let called = false;
    processCapture(makeInput({ processMode: 'organize' }), () => {
      called = true;
      return [];
    });
    expect(called).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────
// processCapture — analyze mode
// ─────────────────────────────────────────────────────────────

describe('processCapture — analyze mode', () => {
  test('calls interpret callback and returns pending interpretations', () => {
    const result = processCapture(
      makeInput({ processMode: 'analyze', rawText: 'I decided to set a boundary.' }),
      mockInterpret,
    );
    expect(result.interpretations.length).toBe(1);
    expect(result.interpretations[0].status).toBe('pending');
    expect(result.interpretations[0].dimension).toBe('trustBoundaries');
  });

  test('returns empty interpretations when no interpret callback provided', () => {
    const result = processCapture(makeInput({ processMode: 'analyze', rawText: 'Some text' }));
    expect(result.interpretations).toEqual([]);
  });

  test('returns empty interpretations when rawText is empty', () => {
    const result = processCapture(
      makeInput({ processMode: 'analyze', rawText: '' }),
      mockInterpret,
    );
    expect(result.interpretations).toEqual([]);
  });

  test('returns only a literal excerpt for analyze mode with text', () => {
    const result = processCapture(
      makeInput({ processMode: 'analyze', rawText: 'Some analysis text' }),
      mockInterpret,
    );
    expect(result.summary).toBe('Some analysis text');
  });

  test('returns no summary when rawText is empty', () => {
    const result = processCapture(
      makeInput({ processMode: 'analyze', rawText: '' }),
      mockInterpret,
    );
    expect(result.summary).toBeUndefined();
  });
});

// ─────────────────────────────────────────────────────────────
// captureToEvidenceKind
// ─────────────────────────────────────────────────────────────

describe('captureToEvidenceKind', () => {
  test('quick_fragment maps to reality', () => {
    expect(captureToEvidenceKind('quick_fragment')).toBe('reality');
  });

  test('emotion_log maps to reality', () => {
    expect(captureToEvidenceKind('emotion_log')).toBe('reality');
  });

  test('decision_log maps to decision', () => {
    expect(captureToEvidenceKind('decision_log')).toBe('decision');
  });
});

// ─────────────────────────────────────────────────────────────
// shouldEmitEvidence
// ─────────────────────────────────────────────────────────────

describe('shouldEmitEvidence', () => {
  test('confirmed status emits at weight 1.0', () => {
    const result = shouldEmitEvidence('confirmed', 0);
    expect(result).toEqual({ emit: true, weight: 1.0 });
  });

  test('confirmed status emits at weight 1.0 regardless of supportCount', () => {
    const result = shouldEmitEvidence('confirmed', 10);
    expect(result).toEqual({ emit: true, weight: 1.0 });
  });

  test('refuted status does not emit', () => {
    const result = shouldEmitEvidence('refuted', 0);
    expect(result).toBeNull();
  });

  test('refuted status does not emit even with high supportCount', () => {
    const result = shouldEmitEvidence('refuted', 5);
    expect(result).toBeNull();
  });

  test('pending with supportCount >= 3 emits at weight 0.8', () => {
    const result = shouldEmitEvidence('pending', 3);
    expect(result).toEqual({ emit: true, weight: 0.8 });
  });

  test('pending with supportCount > 3 emits at weight 0.8', () => {
    const result = shouldEmitEvidence('pending', 5);
    expect(result).toEqual({ emit: true, weight: 0.8 });
  });

  test('pending with supportCount < 3 does not emit', () => {
    const result = shouldEmitEvidence('pending', 2);
    expect(result).toBeNull();
  });

  test('pending with supportCount 0 does not emit', () => {
    const result = shouldEmitEvidence('pending', 0);
    expect(result).toBeNull();
  });
});
