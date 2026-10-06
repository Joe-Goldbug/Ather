import { describe, expect, it } from 'vitest';
import { PortraitV1Service } from './portrait-v1.service.js';

describe('PortraitV1Service', () => {
  it('returns explicit unknown instead of reading a UBV fallback', async () => {
    let lookup = '';
    const service = new PortraitV1Service({
      pool: { query: async (sql: string) => { lookup = sql; return { rows: [] }; } },
    } as never);

    await expect(service.getCurrent('user-1')).resolves.toEqual({
      model_status: 'unknown',
      portrait_id: null,
      revision_id: null,
      portrait_state: 'unknown',
      dimensions: [],
      limitations: ['目前没有已批准的正式画像规则，因此无法判断长期模式。'],
    });
    expect(lookup).toContain('portrait_eligible_evidence_v2');
  });

  it('reads the requested immutable revision rather than substituting the current head', async () => {
    const calls: unknown[][] = [];
    const service = new PortraitV1Service({
      pool: {
        query: async (_sql: string, params: unknown[]) => {
          calls.push(params);
          if (calls.length === 1) return { rows: [{ portrait_id: 'portrait-1', state: 'active' }] };
          return { rows: [{ dimension_key: 'approved_dimension', layer: 'state', status: 'unknown', context_key: {}, limitation_codes: [] }] };
        },
      },
    } as never);

    const response = await service.getRevision('user-1', 'revision-old');

    expect(calls[1]).toEqual(['revision-old']);
    expect(response?.revision_id).toBe('revision-old');
    expect(response?.model_status).toBe('unknown');
  });

  it('does not serve an invalidated historical revision', async () => {
    let lookup = '';
    const service = new PortraitV1Service({
      pool: {
        query: async (sql: string) => {
          lookup = sql;
          return { rows: [] };
        },
      },
    } as never);

    await expect(service.getRevision('user-1', 'revision-withdrawn')).resolves.toBeNull();
    expect(lookup).toContain("r.state <> 'invalidated'");
  });
});
