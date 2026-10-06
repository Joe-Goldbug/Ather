import { describe, expect, test } from 'bun:test';
import { aggregateDimensionConfidence, aggregateAllDimensions } from './confidence-aggregator.js';
import type { EvidenceEventRow } from './evidence-types.js';

function makeEvent(overrides: Partial<EvidenceEventRow> = {}): EvidenceEventRow {
  return {
    id: 'ev-' + Math.random().toString(36).slice(2, 8),
    user_id: 'user-1',
    source_type: 'test',
    source_id: null,
    dimension: 'trustBoundaries',
    delta: 10,
    weight: 1.0,
    confidence: 0.8,
    quote: null,
    explanation: 'test evidence',
    created_at: new Date(),
    candidate: false,
    ...overrides,
  };
}

describe('confidence-aggregator: candidate evidence filtering', () => {
  test('candidate=true events are excluded from weighted_value calculation', () => {
    const baseValue = 50;
    const normalEvents = [
      makeEvent({ delta: 10, weight: 1.0, confidence: 0.8 }),
    ];

    // Compute with only the normal event
    const resultWithout = aggregateDimensionConfidence(baseValue, normalEvents);

    // Now add a candidate event — it should be ignored
    const eventsWithCandidate = [
      ...normalEvents,
      makeEvent({ delta: 20, weight: 1.0, confidence: 0.9, candidate: true }),
    ];
    const resultWith = aggregateDimensionConfidence(baseValue, eventsWithCandidate);

    expect(resultWith.weighted_value).toBe(resultWithout.weighted_value);
    expect(resultWith.evidence_count).toBe(resultWithout.evidence_count);
  });

  test('all-candidate events produce empty-set result', () => {
    const baseValue = 50;
    const events = [
      makeEvent({ delta: 15, weight: 1.0, confidence: 0.9, candidate: true }),
      makeEvent({ delta: -5, weight: 0.8, confidence: 0.7, candidate: true }),
    ];

    const result = aggregateDimensionConfidence(baseValue, events);

    // Should behave like empty events: weighted_value = baseValue, count = 0
    expect(result.weighted_value).toBe(baseValue);
    expect(result.evidence_count).toBe(0);
    expect(result.confidence).toBe(0.1); // CONFIDENCE_MIN
  });

  test('candidate=false events are included normally', () => {
    const baseValue = 50;
    const events = [
      makeEvent({ delta: 10, weight: 1.0, confidence: 0.8, candidate: false }),
    ];

    const result = aggregateDimensionConfidence(baseValue, events);

    expect(result.weighted_value).toBe(60);
    expect(result.evidence_count).toBe(1);
  });

  test('candidate=undefined events are included (backward compat)', () => {
    const baseValue = 50;
    const events = [
      makeEvent({ delta: 10, weight: 1.0, confidence: 0.8, candidate: undefined }),
    ];

    const result = aggregateDimensionConfidence(baseValue, events);

    // undefined is falsy, so the event should be included
    expect(result.weighted_value).toBe(60);
    expect(result.evidence_count).toBe(1);
  });

  test('mixed candidate and non-candidate: only non-candidate affect result', () => {
    const baseValue = 50;
    const events = [
      makeEvent({ delta: 5, weight: 1.0, confidence: 0.8, candidate: false }),
      makeEvent({ delta: -30, weight: 1.0, confidence: 0.9, candidate: true }),
      makeEvent({ delta: 5, weight: 1.0, confidence: 0.8, candidate: false }),
    ];

    const result = aggregateDimensionConfidence(baseValue, events);

    // Only the two non-candidate events (delta: 5 each) should be counted
    expect(result.evidence_count).toBe(2);
    // weighted mean delta = (5*1 + 5*1) / (1+1) = 5
    expect(result.weighted_value).toBe(55);
  });

  test('aggregateAllDimensions also filters out candidate events', () => {
    const baseValues = { trustBoundaries: 50 };
    const events = [
      makeEvent({ dimension: 'trustBoundaries', delta: 10, weight: 1.0, confidence: 0.8, candidate: false }),
      makeEvent({ dimension: 'trustBoundaries', delta: -20, weight: 1.0, confidence: 0.9, candidate: true }),
    ];

    const results = aggregateAllDimensions(baseValues, events);
    const dim = results.get('trustBoundaries')!;

    expect(dim.evidence_count).toBe(1);
    expect(dim.weighted_value).toBe(60);
  });

  test('capture source_type is counted in legacy source breakdown', () => {
    const result = aggregateDimensionConfidence(50, [
      makeEvent({ source_type: 'capture', delta: 8, candidate: false }),
    ]);

    expect(result.evidence_count).toBe(1);
    expect(result.source_counts.capture).toBe(1);
    expect(result.source_counts.test).toBe(0);
  });
});
