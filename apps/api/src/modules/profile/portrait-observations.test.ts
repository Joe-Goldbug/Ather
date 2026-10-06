import { describe, expect, it } from 'vitest';
import { buildPortraitObservations } from './portrait-observations.js';

describe('buildPortraitObservations', () => {
  it('returns only evidence-backed observations and never a score or fixed label', () => {
    const observations = buildPortraitObservations({
      trustBoundaries: [
        {
          id: 'evidence-1',
          sourceType: 'baseline',
          evidenceKind: 'formal',
          quote: '我会先问清楚哪里没有对上。',
          explanation: '来自一次情境选择。',
          createdAt: '2026-07-29T00:00:00.000Z',
        },
      ],
      attachment: [],
    });

    expect(observations).toEqual([
      expect.objectContaining({
        id: 'observation:trustBoundaries:evidence-1',
        dimension: 'trustBoundaries',
        status: 'insufficient_evidence',
        limitation: '目前无法判断长期模式。',
      }),
    ]);
    expect(observations[0].evidence[0].quote).toContain('先问清楚');
    expect(observations[0]).not.toHaveProperty('value');
    expect(observations[0]).not.toHaveProperty('confidence');
    expect(JSON.stringify(observations)).not.toMatch(/archetype|UBV|人格类型/i);
  });

  it('returns no observations when there is no formal evidence to show', () => {
    expect(buildPortraitObservations({ trustBoundaries: [] })).toEqual([]);
  });
});
