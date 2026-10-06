import { describe, test, expect, jest } from '@jest/globals';
import { DynamicScriptPlaybackService } from './dynamic-script-playback.service.js';
import { Database } from '../../../../common/database.js';
import { EvidenceBridgeService } from './evidence-bridge.service.js';

const path = [{ scene_id: 's1', choice_id: 'c1' }, { scene_id: 's2', choice_id: 'c2' }];
function setup() {
  const row = {
    id: 'script', user_id: 'user', generation_status: 'ready', session_status: 'completed',
    played_path: null as typeof path | null, play_completed_at: null as Date | null,
    scenes: [
      { scene_id: 's1', choices: [{ choice_id: 'c1', dimension_signals: { conflictResponse: 0.8 } }, { choice_id: 'other', dimension_signals: { growthOrientation: 1 } }], next_scene_map: { c1: 's2', other: 'end' } },
      { scene_id: 's2', choices: [{ choice_id: 'c2', dimension_signals: { growthOrientation: 0 } }], next_scene_map: {} },
    ],
  };
  const query = jest.fn(async (sql: string, params?: unknown[]) => {
    if (sql.includes('FOR UPDATE')) return { rows: row.user_id === params?.[1] ? [row] : [] };
    if (sql.startsWith('UPDATE')) return { rows: [{ id: row.id }] };
    return { rows: [] };
  });
  const client = { query, release: jest.fn() };
  const pool = { connect: jest.fn(async () => client), query: jest.fn() };
  const bridge = { accumulate: jest.fn(async (..._args: unknown[]) => {}), flushIfReady: jest.fn() };
  const service = new DynamicScriptPlaybackService({ pool } as unknown as Database, bridge as unknown as EvidenceBridgeService);
  return { row, client, pool, bridge, service };
}

describe('DynamicScriptPlaybackService', () => {
  test('locks script and commits path plus chosen evidence before releasing and flushing', async () => {
    const { service, row, client, pool, bridge } = setup();
    expect(await service.play('user', 'script', path)).toEqual({ script_id: 'script', played_path: path, completed: true, replayed: false });
    expect(client.query.mock.calls[1][0]).toContain('FOR UPDATE OF d');
    expect(client.query).toHaveBeenCalledWith(expect.stringContaining('play_completed_at = NOW()'), ['script', 'user', JSON.stringify(path)]);
    expect(bridge.accumulate).toHaveBeenCalledWith('user', 'script', row.scenes, path, client);
    expect(client.query).toHaveBeenLastCalledWith('COMMIT');
    expect(pool.query).not.toHaveBeenCalled();
    expect(bridge.flushIfReady).toHaveBeenCalledWith('user');
    expect(client.release.mock.invocationCallOrder[0]).toBeLessThan(bridge.flushIfReady.mock.invocationCallOrder[0]);
    expect(client.release).toHaveBeenCalledTimes(1);
  });

  test('same completed path replays without evidence or update', async () => {
    const { service, row, bridge, client } = setup();
    row.played_path = path; row.play_completed_at = new Date();
    expect((await service.play('user', 'script', path)).replayed).toBe(true);
    expect(bridge.accumulate).not.toHaveBeenCalled();
    expect(bridge.flushIfReady).toHaveBeenCalledWith('user');
    expect(client.query.mock.calls.some(([sql]) => sql.startsWith('UPDATE'))).toBe(false);
  });

  test('flush failure retains committed playback and does not claim an answer rollback', async () => {
    const { service, client, bridge } = setup();
    bridge.flushIfReady.mockImplementationOnce(() => { throw new Error('synthetic flush failure'); });
    expect((await service.play('user', 'script', path)).completed).toBe(true);
    expect(client.query).toHaveBeenLastCalledWith('COMMIT');
    expect(client.query.mock.calls.some(([sql]) => sql === 'ROLLBACK')).toBe(false);
  });

  test('different completed path conflicts', async () => {
    const { service, row } = setup();
    row.played_path = path; row.play_completed_at = new Date();
    await expect(service.play('user', 'script', [{ scene_id: 's1', choice_id: 'other' }])).rejects.toMatchObject({ status: 409 });
  });

  test.each(['generating', 'failed'])('rejects generation %s', async (status) => {
    const { service, row } = setup(); row.generation_status = status;
    await expect(service.play('user', 'script', path)).rejects.toMatchObject({ status: 409 });
  });

  test('rejects abandoned session and foreign script', async () => {
    const { service, row } = setup(); row.session_status = 'abandoned';
    await expect(service.play('user', 'script', path)).rejects.toMatchObject({ status: 409 });
    await expect(service.play('other-user', 'script', path)).rejects.toMatchObject({ status: 404 });
  });

  test.each([
    [], [path[0]], [path[1]], [{ scene_id: 'unknown', choice_id: 'c1' }],
    [{ scene_id: 's1', choice_id: 'unknown' }], [...path, path[0]],
  ])('rejects incomplete, unknown, out of order or overlong path %j', async (...steps) => {
    const { service, bridge, client } = setup();
    await expect(service.play('user', 'script', steps as typeof path)).rejects.toMatchObject({ status: 400 });
    expect(bridge.accumulate).not.toHaveBeenCalled();
    expect(client.query).toHaveBeenLastCalledWith('ROLLBACK');
  });

  test.each(['s1', 'missing'])('rejects loop or missing next scene %s', async (next) => {
    const { service, row } = setup(); row.scenes[0].next_scene_map.c1 = next;
    await expect(service.play('user', 'script', path)).rejects.toMatchObject({ status: 400 });
  });

  test.each([NaN, Infinity, -0.1, 1.1, '0.5', null])('rejects invalid chosen signal %s', async (signal) => {
    const { service, row } = setup(); row.scenes[0].choices[0].dimension_signals = { conflictResponse: signal } as any;
    await expect(service.play('user', 'script', path)).rejects.toMatchObject({ status: 400 });
  });

  test.each([{}, { unknownDimension: 0.5 }, null])('rejects invalid chosen signal map %j', async (signals) => {
    const { service, row } = setup(); row.scenes[0].choices[0].dimension_signals = signals as any;
    await expect(service.play('user', 'script', path)).rejects.toMatchObject({ status: 400 });
  });

  test('accepts explicit end and ignores invalid unchosen signals', async () => {
    const { service, row } = setup(); row.scenes[0].next_scene_map.c1 = 'end';
    row.scenes[0].choices[1].dimension_signals = { invalid: NaN } as any;
    expect((await service.play('user', 'script', [path[0]])).completed).toBe(true);
  });

  test('accepts empty-string terminal consistently with the player', async () => {
    const { service, row } = setup(); row.scenes[0].next_scene_map.c1 = '';
    expect((await service.play('user', 'script', [path[0]])).completed).toBe(true);
  });

  test.each(['bridge', 'update', 'commit'])('rolls back on %s failure and never reports completion', async (failure) => {
    const { service, bridge, client } = setup();
    if (failure === 'bridge') bridge.accumulate.mockRejectedValueOnce(new Error('failed'));
    else {
      const original = client.query.getMockImplementation()!;
      client.query.mockImplementation(async (sql, params) => {
        if (failure === 'update' ? sql.startsWith('UPDATE') : sql === 'COMMIT') throw new Error('failed');
        return original(sql, params);
      });
    }
    await expect(service.play('user', 'script', path)).rejects.toThrow('failed');
    expect(client.query).toHaveBeenLastCalledWith('ROLLBACK');
    expect(client.release).toHaveBeenCalledTimes(1);
  });
});
