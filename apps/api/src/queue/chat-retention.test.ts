import { describe, expect, it, vi } from 'vitest';
import { CHAT_RAW_RETENTION_DAYS, pruneExpiredChatTurns } from './chat-retention.js';

describe('chat raw-turn retention', () => {
  it('removes only expired conversation and hot-memory turns', async () => {
    const calls: Array<{ sql: string; params?: unknown[] }> = [];
    const pool = {
      query: vi.fn(async (sql: string, params?: unknown[]) => {
        calls.push({ sql, params });
        return { rows: [{ count: 2 }] };
      }),
    };
    const now = new Date('2026-09-26T00:00:00.000Z');

    await expect(pruneExpiredChatTurns(pool as never, now)).resolves.toEqual({
      conversations: 2,
      memories: 2,
    });
    expect(CHAT_RAW_RETENTION_DAYS).toBe(90);
    expect(calls).toHaveLength(2);
    expect(calls[0].sql).toContain('UPDATE conversations');
    expect(calls[1].sql).toContain('conversation_history');
    expect(calls[0].sql).toContain("IS DISTINCT FROM 'number'");
    expect(calls[1].sql).toContain("IS DISTINCT FROM 'number'");
    expect(calls.map(({ sql }) => sql).join('\n')).not.toMatch(/diary|capture|evidence/i);
    expect(calls[0].params).toEqual([Date.parse('2026-06-28T00:00:00.000Z')]);
  });
});
