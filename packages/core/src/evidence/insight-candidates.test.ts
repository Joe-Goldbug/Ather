import { describe, expect, test } from 'bun:test';
import { buildInsightCandidates, topLowConfidenceDimensions } from './insight-candidates.js';

describe('insight-candidates', () => {
  test('gates low confidence candidates', () => {
    const out = buildInsightCandidates([
      {
        dimension: 'trustBoundaries',
        confidence: 0.2,
        evidence_count_7d: 3,
        correction_count_14d: 0,
        weighted_delta_7d: 0.1,
      },
    ]);
    expect(out[0]?.show_in_ui).toBe(false);
    expect(out[0]?.gate_reason).toBe('low_confidence');
  });

  test('marks high correction as tentative', () => {
    const out = buildInsightCandidates([
      {
        dimension: 'stressResponse',
        confidence: 0.7,
        evidence_count_7d: 4,
        correction_count_14d: 3,
        weighted_delta_7d: -0.2,
      },
    ]);
    expect(out[0]?.show_in_ui).toBe(true);
    expect(out[0]?.label).toBe('tentative');
    expect(out[0]?.gate_reason).toBe('high_correction');
  });

  test('preserves raw evidence and correction counts for downstream prompts', () => {
    const out = buildInsightCandidates([
      {
        dimension: 'attachment',
        confidence: 0.8,
        evidence_count_7d: 7,
        correction_count_14d: 4,
        weighted_delta_7d: 0.35,
      },
    ]);
    expect(out[0]?.evidence_count_7d).toBe(7);
    expect(out[0]?.correction_count_14d).toBe(4);
    expect(out[0]?.weighted_delta_7d).toBeCloseTo(0.35);
  });

  test('returns lowest confidence dimensions', () => {
    const out = buildInsightCandidates([
      { dimension: 'a', confidence: 0.9, evidence_count_7d: 4, correction_count_14d: 0, weighted_delta_7d: 0 },
      { dimension: 'b', confidence: 0.3, evidence_count_7d: 4, correction_count_14d: 0, weighted_delta_7d: 0 },
      { dimension: 'c', confidence: 0.4, evidence_count_7d: 4, correction_count_14d: 0, weighted_delta_7d: 0 },
      { dimension: 'd', confidence: 0.2, evidence_count_7d: 4, correction_count_14d: 0, weighted_delta_7d: 0 },
    ]);
    expect(topLowConfidenceDimensions(out, 2)).toEqual(['d', 'b']);
  });
});
