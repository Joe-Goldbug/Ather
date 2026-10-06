// apps/api/src/modules/assessment/services/micro-sandbox/evidence-bridge.service.spec.ts
//
// Hermetic tests for EvidenceBridgeService.
//
// We pass an in-memory QueryPool stub into Database (instead of a real
// Postgres pool) so the three required tests exercise:
//   1. accumulate() filters by playedPath and writes only played choices
//   2. flushIfReady() does NOT flush below threshold
//   3. flushIfReady() flushes when threshold reached (and only after
//      per-dimension call to EvidenceService.writeEvidence succeeds)

import { describe, test, expect, beforeEach, jest } from '@jest/globals';
import { Database } from '../../../../common/database.js';
import { EvidenceBridgeService } from './evidence-bridge.service.js';
import { EvidenceService } from '../../../evidence/evidence.service.js';
import type { GeneratedScene } from '../../dto/dynamic-script/shared/generated-script.dto.js';

// ----- In-memory QueryPool stub -------------------------------------------

interface PendingRow {
  id: string;
  user_id: string;
  script_id: string;
  dimension: string;
  delta: number;
  weight: number;
  metadata: Record<string, unknown> | null;
  flushed_at: Date | null;
  created_at: Date;
}

interface ScriptRow {
  id: string;
}

interface QueryPoolStub {
  pending: PendingRow[];
  scripts: ScriptRow[];
  query: jest.Mock;
  connect: jest.Mock;
  clients: Array<{ query: jest.Mock; release: jest.Mock; releaseSpy: jest.Mock }>;
  evidence: unknown[][];
}

function createPoolStub(): QueryPoolStub {
  const pending: PendingRow[] = [];
  const scripts: ScriptRow[] = [];
  const evidence: unknown[][] = [];
  let nextId = 1;

  const matchesPending = (text: string) =>
    /INSERT INTO pending_dynamic_script_evidence/.test(text);
  const matchesCountUnflushed = (text: string) =>
    /FROM pending_dynamic_script_evidence/.test(text) &&
    /flushed_at IS NULL/.test(text) &&
    !/GROUP BY/.test(text) &&
    !/DISTINCT/.test(text) &&
    /COUNT\(\*\)/.test(text);
  const matchesGroupByDimension = (text: string) =>
    /FROM pending_dynamic_script_evidence/.test(text) &&
    /GROUP BY script_id, dimension/.test(text);
  const matchesMarkFlushed = (text: string) =>
    /UPDATE pending_dynamic_script_evidence\s+SET flushed_at/.test(text);
  const matchesFindStale = (text: string) =>
    /SELECT DISTINCT user_id FROM pending_dynamic_script_evidence/.test(text);

  const queryFn = async (text: string, params: unknown[] = []) => {
    if (/set_config/.test(text)) return { rows: [] };
    if (/INSERT INTO evidence_events/.test(text)) {
      evidence.push(params);
      return { rows: [{ id: `evidence-${evidence.length}` }] };
    }
    if (/SELECT id, script_id, dimension, delta/.test(text)) {
      return { rows: pending.filter((r) => r.user_id === params[0] && r.flushed_at === null).map((r) => ({ ...r })) };
    }
    if (matchesPending(text)) {
      const row: PendingRow = {
        id: `p-${nextId++}`,
        user_id: params[0] as string,
        script_id: params[1] as string,
        dimension: params[2] as string,
        delta: params[3] as number,
        weight: params[4] as number,
        metadata:
          typeof params[5] === 'string' ? JSON.parse(params[5] as string) : (params[5] as Record<string, unknown>) ?? null,
        flushed_at: null,
        created_at: new Date(),
      };
      pending.push(row);
      // Mirror the plan's example: INSERT INTO ... also needs a scripts FK row
      const scriptId = params[1] as string;
      if (!scripts.find((s) => s.id === scriptId)) {
        scripts.push({ id: scriptId });
      }
      return { rows: [] };
    }

    if (matchesCountUnflushed(text)) {
      const userId = params[0] as string;
      const cnt = pending.filter(
        (r) => r.user_id === userId && r.flushed_at === null,
      ).length;
      return { rows: [{ cnt: String(cnt) }] };
    }

    if (matchesGroupByDimension(text)) {
      const userId = params[0] as string;
      const grouped = new Map<
        string,
        { avg_delta: number; cnt: number }
      >();
      for (const r of pending) {
        if (r.user_id !== userId || r.flushed_at !== null) continue;
        const key = `${r.script_id}:${r.dimension}`;
        const cur = grouped.get(key) ?? { avg_delta: 0, cnt: 0 };
        const total = cur.avg_delta * cur.cnt + r.delta;
        const nextCnt = cur.cnt + 1;
        grouped.set(key, { avg_delta: total / nextCnt, cnt: nextCnt });
      }
      return {
        rows: [...grouped.entries()].map(([key, v]) => ({
          script_id: key.split(':')[0],
          dimension: key.split(':')[1],
          avg_delta: v.avg_delta,
          cnt: String(v.cnt),
        })),
      };
    }

    if (matchesMarkFlushed(text)) {
      if (/id = ANY/.test(text)) {
        for (const r of pending) {
          if (r.user_id === params[0] && (params[1] as string[]).includes(r.id)) r.flushed_at = new Date();
        }
        return { rows: (params[1] as string[]).map((id) => ({ id })) };
      }
      // params: [$1=userId, $2=scriptId, $3=dimension]
      const userId = params[0] as string;
      const scriptId = params[1] as string;
      const dimension = params[2] as string;
      for (const r of pending) {
        if (
          r.user_id === userId &&
          r.flushed_at === null &&
          r.script_id === scriptId && r.dimension === dimension
        ) {
          r.flushed_at = new Date();
        }
      }
      return { rows: [] };
    }

    if (matchesFindStale(text)) {
      const cutoff = Date.now() - Number(params[0]) * 24 * 60 * 60 * 1000;
      const uids = new Set<string>();
      for (const r of pending) {
        if (r.flushed_at === null && r.created_at.getTime() < cutoff) {
          uids.add(r.user_id);
        }
      }
      return { rows: Array.from(uids).map((u) => ({ user_id: u })) };
    }

    throw new Error(`Unexpected query: ${text}`);
  };

  const clients: QueryPoolStub['clients'] = [];
  let lock = Promise.resolve();
  return {
    pending,
    scripts,
    query: jest.fn(queryFn),
    clients,
    evidence,
    connect: jest.fn(async () => {
      let unlock: () => void = () => {};
      let snapshot: Array<Date | null> = [];
      let evidenceCount = 0;
      const releaseSpy = jest.fn();
      const client = {
        query: jest.fn(async (text: string, params: unknown[] = []) => {
          if (text === 'BEGIN') return { rows: [] };
          if (/pg_advisory_xact_lock/.test(text)) {
            const previous = lock;
            lock = new Promise<void>((resolve) => { unlock = resolve; });
            await previous;
            snapshot = pending.map((r) => r.flushed_at);
            evidenceCount = evidence.length;
            return { rows: [] };
          }
          if (text === 'ROLLBACK') {
            snapshot.forEach((value, index) => { pending[index].flushed_at = value; });
            evidence.splice(evidenceCount);
            unlock();
            return { rows: [] };
          }
          if (text === 'COMMIT') { unlock(); return { rows: [] }; }
          return queryFn(text, params);
        }),
        release: releaseSpy,
        releaseSpy,
      };
      clients.push(client);
      return client;
    }),
  };
}

// ----- EvidenceService stub -------------------------------------------------

interface EvidenceServiceStub {
  writeEvidence: jest.Mock;
}

function createEvidenceServiceStub(): EvidenceServiceStub {
  return {
    writeEvidence: jest.fn(async () => 'evidence-1'),
  };
}

// ----- Helpers --------------------------------------------------------------

function makeScenes(): GeneratedScene[] {
  return [
    {
      scene_id: 's1',
      scene_number: 1,
      narrative: 'x',
      choices: [
        {
          choice_id: 'c1',
          text: 'confront',
          weight: 1,
          dimension_signals: { conflictResponse: 0.8, emotionalRegulation: 0.3 },
        },
        {
          choice_id: 'c2',
          text: 'silence',
          weight: 1,
          dimension_signals: { conflictResponse: 0.4 },
        },
      ],
      next_scene_map: { c1: 's2', c2: 's2' },
    },
    {
      scene_id: 's2',
      scene_number: 2,
      narrative: 'y',
      choices: [
        {
          choice_id: 'c3',
          text: 'reflect',
          weight: 1,
          dimension_signals: { selfPerception: 0.7 },
        },
      ],
      next_scene_map: {},
    },
  ];
}

// ----- Tests ---------------------------------------------------------------

describe('EvidenceBridgeService', () => {
  let pool: QueryPoolStub;
  let db: Database;
  let evidenceService: EvidenceServiceStub;
  let bridge: EvidenceBridgeService;

  beforeEach(() => {
    pool = createPoolStub();
    db = new Database(
      pool as unknown as ConstructorParameters<typeof Database>[0],
    );
    evidenceService = createEvidenceServiceStub();
    bridge = new EvidenceBridgeService(
      db,
      evidenceService as unknown as EvidenceService,
      { flushThreshold: 3 },
    );
  });

  test('accumulate uses optional transaction client instead of pool', async () => {
    const client = { query: jest.fn(async () => ({ rows: [] })) };
    await (bridge.accumulate as any)('user', 'script', makeScenes(), [{ scene_id: 's1', choice_id: 'c1' }], client);
    expect(client.query).toHaveBeenCalledTimes(2);
    expect(pool.query).not.toHaveBeenCalled();
  });

  test('accumulate writes pending rows only for played choices', async () => {
    // Only c1 and c3 are in the user's played path; c2 is unchosen
    const playedPath = [
      { scene_id: 's1', choice_id: 'c1' },
      { scene_id: 's2', choice_id: 'c3' },
    ];

    await bridge.accumulate('test-user', 'script-1', makeScenes(), playedPath);

    // Should write: conflictResponse (from c1), emotionalRegulation (from c1),
    //               selfPerception (from c3)
    // Should NOT write: conflictResponse from c2 (since c2 was not played)
    expect(pool.pending).toHaveLength(3);

    const dims = pool.pending.map((r) => r.dimension).sort();
    expect(dims).toEqual(
      ['conflictResponse', 'emotionalRegulation', 'selfPerception'],
    );

    const conflictRows = pool.pending.filter(
      (r) => r.dimension === 'conflictResponse',
    );
    expect(conflictRows).toHaveLength(1);
    expect(conflictRows[0].delta).toBeCloseTo(0.8);
    expect(conflictRows[0].weight).toBeCloseTo(0.3);
    expect(conflictRows[0].flushed_at).toBeNull();
    expect(conflictRows[0].metadata).toEqual(
      expect.objectContaining({ script_id: 'script-1', scene_id: 's1', choice_id: 'c1' }),
    );

    const emotionalRow = pool.pending.find(
      (r) => r.dimension === 'emotionalRegulation',
    );
    expect(emotionalRow?.delta).toBeCloseTo(0.3);
    expect(emotionalRow?.weight).toBeCloseTo(0.3);
    expect(emotionalRow?.metadata).toEqual(
      expect.objectContaining({ scene_id: 's1', choice_id: 'c1' }),
    );
  });

  test('flushIfReady does NOT flush below threshold', async () => {
    // One script worth of dimensions = 3 rows, but threshold is 3 ROWS
    // (count of unflushed must be >= 3). With only 3 rows, threshold is met
    // (not below). So use 2 dimensions per choice → 4 rows from 2 scripts.
    // To stay BELOW threshold, write a single scene with 1 dimension via
    // a played path with 1 choice.
    await bridge.accumulate(
      'test-user',
      'script-1',
      [
        {
          scene_id: 's1',
          scene_number: 1,
          narrative: 'x',
          choices: [
            {
              choice_id: 'c1',
              text: 'x',
              weight: 1,
              dimension_signals: { conflictResponse: 0.5 },
            },
          ],
          next_scene_map: {},
        },
      ],
      [{ scene_id: 's1', choice_id: 'c1' }],
    );

    expect(pool.pending).toHaveLength(1);

    await bridge.flushIfReady('test-user');

    expect(evidenceService.writeEvidence).not.toHaveBeenCalled();
    expect(pool.pending.every((r) => r.flushed_at === null)).toBe(true);
  });

  test('flushIfReady flushes when threshold reached', async () => {
    // 3 separate scripts × 1 dimension each = 3 pending rows.
    // After flush, each dimension is grouped & written via writeEvidence,
    // and the corresponding pending rows are marked flushed.
    for (let i = 0; i < 3; i++) {
      await bridge.accumulate(
        'test-user',
        `script-${i}`,
        [
          {
            scene_id: 's1',
            scene_number: 1,
            narrative: 'x',
            choices: [
              {
                choice_id: 'c1',
                text: 'x',
                weight: 1,
                dimension_signals: { conflictResponse: 0.5 },
              },
            ],
            next_scene_map: {},
          },
        ],
        [{ scene_id: 's1', choice_id: 'c1' }],
      );
    }

    expect(pool.pending).toHaveLength(3);
    expect(pool.pending.every((r) => r.flushed_at === null)).toBe(true);

    await bridge.flushIfReady('test-user');

    // One source group per script, even when dimensions match.
    expect(evidenceService.writeEvidence).toHaveBeenCalledTimes(3);
    const call = evidenceService.writeEvidence.mock.calls[0][0] as {
      evidenceKind: string;
      weight: number;
      userId: string;
      dimension: string;
      delta: number;
    };
    expect(call.evidenceKind).toBe('practice');
    expect(call.weight).toBeCloseTo(0.3);
    expect(call.userId).toBe('test-user');
    expect(call.dimension).toBe('conflictResponse');
    expect(call.delta).toBeCloseTo(0.5);
    expect(call).toMatchObject({ candidate: true, contentKind: 'simulation_choice', sourceIndependenceGroup: 'dynamic-script:script-0' });

    // All 3 rows for that dimension should now be marked flushed
    const flushed = pool.pending.filter((r) => r.flushed_at !== null);
    expect(flushed).toHaveLength(3);
  });

  test('flushIfReady rolls back all groups on writer failure and can retry', async () => {
    // Simulate a per-dimension writeEvidence failure: throw for "bad"
    // dimension, but a different dimension should succeed.
    evidenceService.writeEvidence = jest.fn(async (p: { dimension: string }) => {
      if (p.dimension === 'bad') throw new Error('write failed');
      return 'evidence-1';
    });
    bridge = new EvidenceBridgeService(
      db,
      evidenceService as unknown as EvidenceService,
      { flushThreshold: 2 },
    );

    // Two scripts, each with TWO dimensions ("ok" and "bad"). One played
    // choice per script → 4 rows total. Threshold = 2 so we flush.
    for (let i = 0; i < 2; i++) {
      await bridge.accumulate(
        'test-user',
        `script-${i}`,
        [
          {
            scene_id: 's1',
            scene_number: 1,
            narrative: 'x',
            choices: [
              {
                choice_id: 'c1',
                text: 'x',
                weight: 1,
                dimension_signals: { ok: 0.5, bad: 0.2 },
              },
            ],
            next_scene_map: {},
          },
        ],
        [{ scene_id: 's1', choice_id: 'c1' }],
      );
    }

    await expect(bridge.flushIfReady('test-user')).rejects.toThrow('write failed');

    const okRows = pool.pending.filter((r) => r.dimension === 'ok');
    const badRows = pool.pending.filter((r) => r.dimension === 'bad');
    expect(okRows.every((r) => r.flushed_at === null)).toBe(true);
    expect(badRows.every((r) => r.flushed_at === null)).toBe(true);
    expect(pool.clients[0].query).toHaveBeenCalledWith('ROLLBACK');
    evidenceService.writeEvidence = jest.fn(async () => 'evidence-1');
    await bridge.flushIfReady('test-user');
    expect(pool.pending.every((r) => r.flushed_at !== null)).toBe(true);
  });

  test('concurrent flushes write each snapshot group once on a locked transaction', async () => {
    await bridge.accumulate('user', 'script', makeScenes(), [{ scene_id: 's1', choice_id: 'c1' }, { scene_id: 's2', choice_id: 'c3' }]);
    await Promise.all([bridge.flushIfReady('user'), bridge.flushIfReady('user')]);
    expect(evidenceService.writeEvidence).toHaveBeenCalledTimes(3);
    expect(pool.connect).toHaveBeenCalledTimes(2);
    const queryCalls = pool.clients[0].query.mock.calls;
    expect(queryCalls.some(([sql]) => /pg_advisory_xact_lock/.test(String(sql)))).toBe(true);
    expect(queryCalls.some(([sql]) => /FOR UPDATE/.test(String(sql)))).toBe(true);
    expect(evidenceService.writeEvidence.mock.calls[0][1]).toBe(pool.clients[0]);
  });

  test('only marks selected IDs and averages the locked snapshot, not late arrivals', async () => {
    await bridge.accumulate('user', 'script', makeScenes(), [{ scene_id: 's1', choice_id: 'c1' }]);
    await bridge.accumulate('user', 'script', makeScenes(), [{ scene_id: 's1', choice_id: 'c2' }]);
    evidenceService.writeEvidence = jest.fn(async () => {
      await bridge.accumulate('user', 'script', makeScenes(), [{ scene_id: 's1', choice_id: 'c2' }]);
      return 'evidence-1';
    });
    await bridge.flushIfReady('user');
    expect((evidenceService.writeEvidence.mock.calls[0][0] as { delta: number }).delta).toBeCloseTo(0.6);
    expect(pool.pending.slice(0, 3).every((r) => r.flushed_at !== null)).toBe(true);
    expect(pool.pending.slice(3).every((r) => r.flushed_at === null)).toBe(true);
  });

  test('mark failure rolls back and releases the client', async () => {
    bridge = new EvidenceBridgeService(db, new EvidenceService(db), { flushThreshold: 3 });
    await bridge.accumulate('user', 'script', makeScenes(), [{ scene_id: 's1', choice_id: 'c1' }, { scene_id: 's2', choice_id: 'c3' }]);
    const connect = pool.connect.getMockImplementation()!;
    pool.connect.mockImplementation(async () => {
      const client = await connect() as QueryPoolStub['clients'][number];
      const query = client.query.getMockImplementation()!;
      client.query.mockImplementation(async (...args: unknown[]) => {
        if (/UPDATE pending/.test(String(args[0]))) throw new Error('mark failed');
        return query(...args);
      });
      return client;
    });
    await expect(bridge.flushIfReady('user')).rejects.toThrow('mark failed');
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(pool.clients[0].query).toHaveBeenCalledWith('ROLLBACK');
    expect(pool.clients[0].releaseSpy).toHaveBeenCalled();
    expect(pool.pending.every((r) => r.flushed_at === null)).toBe(true);
    expect(pool.evidence).toHaveLength(0);
    expect(pool.clients[0].query.mock.calls.filter(([sql]) => /INSERT INTO evidence_events/.test(String(sql)))).toHaveLength(3);
    pool.connect.mockImplementation(connect);
    await bridge.flushIfReady('user');
    expect(pool.evidence).toHaveLength(3);
    expect(pool.pending.every((r) => r.flushed_at !== null)).toBe(true);
  });

  test.each([undefined, {}, '', '   '])('invalid writer ID %p cannot mark pending flushed', async (id) => {
    await bridge.accumulate('user', 'script', makeScenes(), [{ scene_id: 's1', choice_id: 'c1' }, { scene_id: 's2', choice_id: 'c3' }]);
    evidenceService.writeEvidence = jest.fn(async () => id);
    await expect(bridge.flushIfReady('user')).rejects.toThrow('evidence ID');
    expect(pool.pending.every((r) => r.flushed_at === null)).toBe(true);
    expect(pool.clients[0].query).toHaveBeenCalledWith('ROLLBACK');
    expect(pool.clients[0].query.mock.calls.some(([sql]) => /UPDATE pending/.test(String(sql)))).toBe(false);
  });

  test('rollback failure does not mask the original writer error', async () => {
    const original = new Error('original write failure');
    await bridge.accumulate('user', 'script', makeScenes(), [{ scene_id: 's1', choice_id: 'c1' }, { scene_id: 's2', choice_id: 'c3' }]);
    evidenceService.writeEvidence = jest.fn(async () => { throw original; });
    const connect = pool.connect.getMockImplementation()!;
    pool.connect.mockImplementation(async () => {
      const client = await connect() as QueryPoolStub['clients'][number];
      const query = client.query.getMockImplementation()!;
      client.query.mockImplementation(async (...args: unknown[]) => {
        if (args[0] === 'ROLLBACK') throw new Error('rollback connection failure');
        return query(...args);
      });
      return client;
    });
    await expect(bridge.flushIfReady('user')).rejects.toBe(original);
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(pool.clients[0].releaseSpy).toHaveBeenCalled();
  });

  test.each([0, 2])('silent or incomplete UPDATE (%i rows) rolls back evidence and pending', async (count) => {
    bridge = new EvidenceBridgeService(db, new EvidenceService(db), { flushThreshold: 3 });
    await bridge.accumulate('user', 'script', makeScenes(), [{ scene_id: 's1', choice_id: 'c1' }, { scene_id: 's2', choice_id: 'c3' }]);
    const connect = pool.connect.getMockImplementation()!;
    pool.connect.mockImplementation(async () => {
      const client = await connect() as QueryPoolStub['clients'][number];
      const query = client.query.getMockImplementation()!;
      client.query.mockImplementation(async (...args: unknown[]) => {
        if (/UPDATE pending/.test(String(args[0]))) {
          const ids = (args[1] as unknown[])[1] as string[];
          return query(args[0], ['user', ids.slice(0, count)]);
        }
        return query(...args);
      });
      return client;
    });
    await expect(bridge.flushIfReady('user')).rejects.toThrow('mark');
    expect(pool.evidence).toHaveLength(0);
    expect(pool.pending.every((r) => r.flushed_at === null)).toBe(true);
    expect(pool.clients[0].query).toHaveBeenCalledWith('ROLLBACK');
  });

  test('flushStale finds stale users and delegates to flushIfReady', async () => {
    // Make one script's row stale (8 days ago), another fresh (today).
    const flushSpy = jest.spyOn(bridge, 'flushIfReady');

    // Stale user
    pool.pending.push({
      id: 'p-stale',
      user_id: 'user-stale',
      script_id: 'script-stale',
      dimension: 'conflictResponse',
      delta: 0.4,
      weight: 0.3,
      metadata: null,
      flushed_at: null,
      created_at: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000),
    });

    await bridge.flushStale(7);

    expect(flushSpy).toHaveBeenCalledWith('user-stale');
  });
});
