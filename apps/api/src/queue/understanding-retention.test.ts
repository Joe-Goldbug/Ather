import { describe, expect, it, vi } from 'vitest';
import { pruneExpiredUnderstandingSessions } from './understanding-retention.js';

describe('understanding session retention', () => {
  it('removes only unsaved sessions after their explicit expiry', async () => {
    const query = vi.fn(async () => ({ rows: [{ count: 3 }] }));
    await expect(pruneExpiredUnderstandingSessions({ query } as never)).resolves.toEqual({ sessions: 3 });
    expect(query).toHaveBeenCalledOnce();
    expect(query.mock.calls[0][0]).toMatch(/DELETE FROM understanding_sessions/i);
    expect(query.mock.calls[0][0]).toMatch(/expires_at < NOW\(\)/i);
    expect(query.mock.calls[0][0]).toMatch(/saved_at IS NULL/i);
  });
});
