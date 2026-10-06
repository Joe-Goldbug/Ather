import { describe, expect, it, vi } from 'vitest';
import { EvidenceService } from './evidence.service.js';

describe('evidence batch transaction', () => {
  it('checks ownership and writes on the supplied transaction client', async () => {
    const poolQuery = vi.fn(async () => { throw new Error('pool query escaped transaction'); });
    const clientQuery = vi.fn(async (sql: string) => ({
      rows: sql.includes('SELECT id FROM conversations')
        ? [{ id: 'conversation-1' }]
        : [{ id: 'evidence-1' }],
    }));
    const service = new EvidenceService({ pool: { query: poolQuery } } as never);

    const ids = await service.writeMany([{
      userId: 'user-1', sourceType: 'chat', sourceId: 'conversation-1',
      dimension: 'work', explanation: 'bounded observation',
    }], { query: clientQuery, release: vi.fn() } as never);

    expect(ids).toEqual(['evidence-1']);
    expect(clientQuery).toHaveBeenCalledTimes(2);
    expect(poolQuery).not.toHaveBeenCalled();
  });
});
