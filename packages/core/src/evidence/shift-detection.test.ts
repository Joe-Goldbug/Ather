// packages/core/src/evidence/shift-detection.test.ts
// Unit tests for the five-gate shift detection module

import { describe, test, expect } from 'bun:test';
import {
  detectShift,
  CONFIDENCE_THRESHOLD,
  RECENT_EVIDENCE_MIN,
  NO_CORRECTION_DAYS,
  RCI_THRESHOLD,
  SHIFT_MESSAGE,
  type ShiftGateInput,
} from './shift-detection.js';

// ─────────────────────────────────────────────────────────────
// Helper: input that passes all five gates
// ─────────────────────────────────────────────────────────────

function allPassInput(): ShiftGateInput {
  return {
    dimension: 'trustBoundaries',
    hasParallelItem: true,
    confidence: 0.70,
    recentEvidenceCount: 3,
    daysSinceLastCorrection: null, // never corrected
    rci: 2.5,
  };
}

// ─────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────

describe('shift-detection: detectShift', () => {
  test('returns shifted=true when ALL five gates pass', () => {
    const result = detectShift(allPassInput());
    expect(result.shifted).toBe(true);
    expect(result.message).toBe(SHIFT_MESSAGE);
    expect(result.dimension).toBe('trustBoundaries');
    expect(result.gates.parallelItem).toBe(true);
    expect(result.gates.confidence).toBe(true);
    expect(result.gates.recentEvidence).toBe(true);
    expect(result.gates.noCorrectionRecent).toBe(true);
    expect(result.gates.rciSignificant).toBe(true);
  });

  test('gate 1 failure: no parallel item', () => {
    const input = { ...allPassInput(), hasParallelItem: false };
    const result = detectShift(input);
    expect(result.shifted).toBe(false);
    expect(result.gates.parallelItem).toBe(false);
    // All other gates still pass
    expect(result.gates.confidence).toBe(true);
    expect(result.gates.recentEvidence).toBe(true);
    expect(result.gates.noCorrectionRecent).toBe(true);
    expect(result.gates.rciSignificant).toBe(true);
  });

  test('gate 2 failure: confidence below threshold', () => {
    const input = { ...allPassInput(), confidence: 0.49 };
    const result = detectShift(input);
    expect(result.shifted).toBe(false);
    expect(result.gates.confidence).toBe(false);
  });

  test('gate 2 boundary: confidence exactly at threshold passes', () => {
    const input = { ...allPassInput(), confidence: CONFIDENCE_THRESHOLD };
    const result = detectShift(input);
    expect(result.gates.confidence).toBe(true);
  });

  test('gate 3 failure: insufficient recent evidence', () => {
    const input = { ...allPassInput(), recentEvidenceCount: 1 };
    const result = detectShift(input);
    expect(result.shifted).toBe(false);
    expect(result.gates.recentEvidence).toBe(false);
  });

  test('gate 3 boundary: exactly minimum recent evidence passes', () => {
    const input = { ...allPassInput(), recentEvidenceCount: RECENT_EVIDENCE_MIN };
    const result = detectShift(input);
    expect(result.gates.recentEvidence).toBe(true);
  });

  test('gate 4 failure: correction within 14 days', () => {
    const input = { ...allPassInput(), daysSinceLastCorrection: 10 };
    const result = detectShift(input);
    expect(result.shifted).toBe(false);
    expect(result.gates.noCorrectionRecent).toBe(false);
  });

  test('gate 4 boundary: correction exactly 14 days ago fails', () => {
    const input = { ...allPassInput(), daysSinceLastCorrection: NO_CORRECTION_DAYS };
    const result = detectShift(input);
    expect(result.shifted).toBe(false);
    expect(result.gates.noCorrectionRecent).toBe(false);
  });

  test('gate 4 passes: correction 15 days ago', () => {
    const input = { ...allPassInput(), daysSinceLastCorrection: 15 };
    const result = detectShift(input);
    expect(result.gates.noCorrectionRecent).toBe(true);
  });

  test('gate 4 passes: never corrected (null)', () => {
    const input = { ...allPassInput(), daysSinceLastCorrection: null };
    const result = detectShift(input);
    expect(result.gates.noCorrectionRecent).toBe(true);
  });

  test('gate 5 failure: RCI not significant (positive side)', () => {
    const input = { ...allPassInput(), rci: 1.5 };
    const result = detectShift(input);
    expect(result.shifted).toBe(false);
    expect(result.gates.rciSignificant).toBe(false);
  });

  test('gate 5 failure: RCI exactly at threshold (boundary)', () => {
    const input = { ...allPassInput(), rci: RCI_THRESHOLD };
    const result = detectShift(input);
    // |rci| > 1.96 means strictly greater than, so 1.96 exactly fails
    expect(result.shifted).toBe(false);
    expect(result.gates.rciSignificant).toBe(false);
  });

  test('gate 5 passes: negative RCI exceeds threshold', () => {
    const input = { ...allPassInput(), rci: -2.1 };
    const result = detectShift(input);
    expect(result.gates.rciSignificant).toBe(true);
    expect(result.shifted).toBe(true);
  });

  test('multiple gates fail simultaneously', () => {
    const input: ShiftGateInput = {
      dimension: 'attachment',
      hasParallelItem: false,
      confidence: 0.3,
      recentEvidenceCount: 0,
      daysSinceLastCorrection: 5,
      rci: 0.5,
    };
    const result = detectShift(input);
    expect(result.shifted).toBe(false);
    expect(result.gates.parallelItem).toBe(false);
    expect(result.gates.confidence).toBe(false);
    expect(result.gates.recentEvidence).toBe(false);
    expect(result.gates.noCorrectionRecent).toBe(false);
    expect(result.gates.rciSignificant).toBe(false);
  });

  test('message is always the fixed Chinese wording', () => {
    const result = detectShift(allPassInput());
    expect(result.message).toBe('EVA 发现一个可能的变化，需要你确认');
  });
});
