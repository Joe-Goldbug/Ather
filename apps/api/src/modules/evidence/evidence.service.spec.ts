import { describe, test, expect, jest } from '@jest/globals';
import { EvidenceService, type WriteEvidenceExtendedParams } from './evidence.service.js';
import type { PoolClient } from '../../common/pool.js';

const params: WriteEvidenceExtendedParams = {
  userId: 'user', sourceType: 'chat', sourceId: 'conversation',
  dimension: 'work', explanation: 'observation', evidenceKind: 'practice',
  candidate: true, epistemicSource: 'system_interaction', contentKind: 'simulation_choice',
};

describe('EvidenceService extended transaction write', () => {
  test('ownership and insert use the supplied client, preserving classifications', async () => {
    const poolQuery = jest.fn(async () => ({ rows: [] }));
    const query = jest.fn(async (sql: string, _values?: unknown[]) => ({ rows: [{ id: sql.startsWith('SELECT') ? 'conversation' : 'evidence' }] }));
    const service = new EvidenceService({ pool: { query: poolQuery } } as never);
    const id = await (service.writeEvidence as any)(params, { query, release: jest.fn() } as PoolClient);
    expect(id).toBe('evidence');
    expect(poolQuery).not.toHaveBeenCalled();
    expect(query).toHaveBeenCalledTimes(2);
    expect(query.mock.calls[1][1]).toEqual(expect.arrayContaining(['practice', true, 'system_interaction', 'simulation_choice']));
  });

  test('ownership failure prevents insert on the client', async () => {
    const query = jest.fn(async () => ({ rows: [] }));
    const poolQuery = jest.fn(async () => ({ rows: [{ id: 'wrong-pool' }] }));
    const service = new EvidenceService({ pool: { query: poolQuery } } as never);
    await expect((service.writeEvidence as any)(params, { query, release: jest.fn() })).rejects.toThrow('not owned');
    expect(query).toHaveBeenCalledTimes(1);
    expect(poolQuery).not.toHaveBeenCalled();
  });

  test('propagates transaction insert failure without replay', async () => {
    const error = Object.assign(new Error('serialization failure'), { code: '40001' });
    const query = jest.fn(async () => { throw error; });
    const service = new EvidenceService({ pool: { query: jest.fn(async () => ({ rows: [{ id: 'wrong-pool' }] })) } } as never);
    await expect((service.writeEvidence as any)({ ...params, sourceType: 'test' }, { query, release: jest.fn() })).rejects.toBe(error);
    expect(query).toHaveBeenCalledTimes(1);
  });

  test('keeps the pool write path when no client is supplied', async () => {
    const query = jest.fn(async () => ({ rows: [{ id: 'evidence' }] }));
    const service = new EvidenceService({ pool: { query } } as never);
    expect(await service.writeEvidence({ ...params, sourceType: 'test' })).toBe('evidence');
    expect(query).toHaveBeenCalledTimes(1);
  });
});
