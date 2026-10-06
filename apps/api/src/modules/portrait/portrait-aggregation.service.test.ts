import { describe, expect, it } from 'vitest';
import { PortraitAggregationService } from './portrait-aggregation.service.js';

describe('PortraitAggregationService', () => {
  it('writes an unknown revision manifest without reading or updating UBV', async () => {
    const statements: string[] = [];
    const client = {
      query: async (sql: string) => {
        statements.push(sql);
        if (sql.includes('portrait_eligible_evidence_v2')) return { rows: [{ id: 'evidence-1', dimension: 'unclassified', status_rule_id: 'rule-1' }] };
        if (sql.includes('SELECT id FROM continuous_portraits')) return { rows: [{ id: 'portrait-1' }] };
        if (sql.includes('revision_number FROM portrait_revisions')) return { rows: [] };
        if (sql.includes('RETURNING id')) return { rows: [{ id: 'revision-1' }] };
        if (sql.includes('operation_id')) return { rows: [] };
        return { rows: [] };
      },
      release: () => undefined,
    };
    const service = new PortraitAggregationService({ pool: { connect: async () => client } } as never);

    const result = await service.aggregateUnknown(
      'user-1',
      'evidence-1',
      '11111111-1111-4111-8111-111111111111',
    );

    expect(result).toEqual({ portrait_id: 'portrait-1', revision_id: 'revision-1', state: 'unknown', replayed: false });
    const allSql = statements.join('\n');
    expect(allSql).toContain('portrait_revision_evidence');
    expect(allSql).toContain('portrait_outbox');
    expect(allSql).not.toContain('memory_state');
    expect(allSql).not.toContain('ubv');
  });
});
