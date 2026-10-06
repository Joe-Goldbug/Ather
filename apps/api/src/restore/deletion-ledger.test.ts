import { describe, expect, it, vi } from 'vitest';
import { replayDeletionLedger } from './deletion-ledger.js';

const sourceIdentity = { database_name: 'eva', server_address: 'source', server_port: 5432 };
const targetIdentity = { database_name: 'eva_restore', server_address: 'target', server_port: 5432 };

describe('replayDeletionLedger', () => {
  it('refuses to use the same database as source and restore target', async () => {
    const pool = { query: vi.fn(async () => ({ rows: [sourceIdentity] })) };

    await expect(replayDeletionLedger(pool as never, pool as never, false)).rejects.toThrow(
      'Source and restore target must be different databases',
    );
  });

  it('dry-runs without mutating the restore target', async () => {
    const source = { query: vi.fn()
      .mockResolvedValueOnce({ rows: [sourceIdentity] })
      .mockResolvedValueOnce({ rows: [
        { user_id: '11111111-1111-4111-8111-111111111111', deleted_at: new Date('2026-09-26T00:00:00Z') },
      ] }) };
    const target = {
      query: vi.fn()
        .mockResolvedValueOnce({ rows: [targetIdentity] })
        .mockResolvedValueOnce({ rows: [{ matched_users: 1 }] }),
      connect: vi.fn(),
    };

    await expect(replayDeletionLedger(source as never, target as never, false)).resolves.toEqual({
      mode: 'dry_run', tombstones: 1, matched_users: 1, promotion_safe: false,
    });
    expect(target.connect).not.toHaveBeenCalled();
  });

  it('applies opaque tombstones and blocks restored users before promotion', async () => {
    const source = { query: vi.fn()
      .mockResolvedValueOnce({ rows: [sourceIdentity] })
      .mockResolvedValueOnce({ rows: [
        { user_id: '11111111-1111-4111-8111-111111111111', deleted_at: new Date('2026-09-26T00:00:00Z') },
      ] }) };
    const calls: Array<{ sql: string; params?: unknown[] }> = [];
    const client = { query: vi.fn(async (sql: string, params?: unknown[]) => {
      calls.push({ sql, params });
      return { rows: sql.includes('matched_users') ? [{ matched_users: 1 }] : [] };
    }), release: vi.fn() };
    const target = {
      query: vi.fn().mockResolvedValueOnce({ rows: [targetIdentity] }),
      connect: vi.fn(async () => client),
    };

    await expect(replayDeletionLedger(source as never, target as never, true)).resolves.toEqual({
      mode: 'apply', tombstones: 1, matched_users: 1, promotion_safe: false,
    });
    expect(calls.some(({ sql }) => sql.includes('INSERT INTO account_deletion_tombstones'))).toBe(true);
    expect(calls.some(({ sql }) => sql.includes('UPDATE users'))).toBe(true);
    expect(calls.some(({ sql }) => sql.includes('UPDATE session_tokens'))).toBe(true);
    expect(calls.at(-1)?.sql).toBe('COMMIT');
    expect(client.release).toHaveBeenCalledOnce();
    expect(JSON.stringify(calls)).not.toContain('email');
  });
});
