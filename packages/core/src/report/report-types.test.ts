import { describe, expect, test } from 'bun:test';
import { ReportSchema } from './report-types.js';

describe('ReportSchema evidence-v1', () => {
  test('defaults to an evidence-first report with no identity fields', () => {
    const report = ReportSchema.parse({
      evidenceHighlights: [{
        claimId: 'C1',
        revisionId: '11111111-2222-4333-8444-555555555555',
        text: '在一次已记录选择中，你先问清楚哪里没有对上。',
        evidenceIds: ['evidence-1'],
        counterevidenceIds: [],
        limitations: ['目前无法判断长期模式。'],
      }],
    });

    expect(report.reportVersion).toBe('evidence-v1');
    expect(report.archetypeName).toBe('');
    expect(report.evidenceHighlights[0]?.evidenceIds).toEqual(['evidence-1']);
    expect(report.evidenceHighlights[0]?.revisionId).toBe('11111111-2222-4333-8444-555555555555');
  });

  test('rejects a new-path archetype label', () => {
    expect(() => ReportSchema.parse({ archetypeName: '稳态连接者' })).toThrow();
  });
});
