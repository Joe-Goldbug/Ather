import { describe, expect, it } from 'vitest';
import { isPortraitSemanticsComplete } from './evidence-semantics.js';
import { computeDimensionConfidence } from './confidence-engine.js';
import type { EvidenceEventRow } from './evidence-types.js';

describe('portrait evidence semantics', () => {
  const real = {
    epistemic_source: 'user_self_report' as const,
    content_kind: 'recalled_event' as const,
    source_independence_group: 'capture:one',
    attribution: 'self' as const,
  };

  it('requires explicit source, content, provenance group and self attribution', () => {
    expect(isPortraitSemanticsComplete(real)).toBe(true);
    expect(isPortraitSemanticsComplete({ ...real, content_kind: 'simulation_choice' })).toBe(false);
    expect(isPortraitSemanticsComplete({ ...real, epistemic_source: 'unknown' })).toBe(false);
    expect(isPortraitSemanticsComplete({ ...real, source_independence_group: ' ' })).toBe(false);
    expect(isPortraitSemanticsComplete({ ...real, attribution: 'hypothetical' })).toBe(false);
  });

  it('does not let a simulation or withdrawn row change confidence when passed directly', () => {
    const event = {
      id: 'one', user_id: 'user', source_type: 'test', source_id: null,
      dimension: 'trustBoundaries', delta: 40, weight: 1, confidence: 1,
      quote: null, explanation: 'choice', created_at: new Date('2026-09-26'),
      candidate: false, evidence_kind: 'formal', content_kind: 'simulation_choice',
    } as EvidenceEventRow;
    const input = { dimension: 'trustBoundaries', baseValue: 50, events: [event], calibrationTimestamps: [], now: Date.now() };
    expect(computeDimensionConfidence(input).value).toBe(50);
    expect(computeDimensionConfidence({ ...input, events: [{ ...event, content_kind: 'recalled_event', portrait_status: 'withdrawn' }] }).value).toBe(50);
  });
});
