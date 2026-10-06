import { describe, expect, it, vi } from 'vitest';
import { createQueryPool } from '../common/pool.js';
import { runAuthorizedWeeklyReview } from './weekly-review-authorization.js';

function fixture(states: Array<{ granted: boolean; eligible_count: string }>) {
  const query = vi.fn(async () => ({ rows: [states.shift() ?? { granted: false, eligible_count: '0' }] }));
  const generate = vi.fn(async () => 'review');
  return { pool: { query }, generate, query };
}

describe('weekly review model-use authorization', () => {
  it('does not call the model after global consent is revoked', async () => {
    const { pool, generate } = fixture([{ granted: false, eligible_count: '1' }]);
    await expect(runAuthorizedWeeklyReview(pool as never, 'user-1', ['capture-1'], generate)).resolves.toEqual({
      status: 'skipped', reason: 'weekly_review_permission_revoked',
    });
    expect(generate).not.toHaveBeenCalled();
  });

  it('does not call the model after a selected record is revoked', async () => {
    const { pool, generate, query } = fixture([{ granted: true, eligible_count: '0' }]);
    await expect(runAuthorizedWeeklyReview(pool as never, 'user-1', ['capture-1'], generate)).resolves.toEqual({
      status: 'skipped', reason: 'record_permission_revoked',
    });
    expect(generate).not.toHaveBeenCalled();
    expect(query.mock.calls[0][0]).toContain("process_mode <> 'save_only'");
    expect(query.mock.calls[0][0]).toContain('allow_weekly_review = true');
  });

  it('discards output if permission changes while the model runs', async () => {
    const { pool, generate } = fixture([
      { granted: true, eligible_count: '1' },
      { granted: true, eligible_count: '0' },
    ]);
    await expect(runAuthorizedWeeklyReview(pool as never, 'user-1', ['capture-1'], generate)).resolves.toEqual({
      status: 'skipped', reason: 'record_permission_revoked',
    });
    expect(generate).toHaveBeenCalledOnce();
  });

  it('returns the narrative only while both permissions remain active', async () => {
    const { pool, generate, query } = fixture([
      { granted: true, eligible_count: '1' },
      { granted: true, eligible_count: '1' },
    ]);
    await expect(runAuthorizedWeeklyReview(pool as never, 'user-1', ['capture-1'], generate)).resolves.toEqual({
      status: 'ready', narrative: 'review',
    });
    expect(generate).toHaveBeenCalledOnce();
    expect(query).toHaveBeenCalledTimes(2);
  });

  it.skipIf(!process.env.EVA_TEST_DATABASE_URL)('enforces record revocation against PostgreSQL', async () => {
    const pool = createQueryPool(process.env.EVA_TEST_DATABASE_URL!);
    const userId = crypto.randomUUID();
    const captureId = crypto.randomUUID();
    const generate = vi.fn(async () => 'review');
    try {
      await pool.query('INSERT INTO users (id, email) VALUES ($1, $2)', [userId, `${userId}@example.test`]);
      await pool.query(
        `INSERT INTO consent_grants (user_id, consent_type, granted)
         VALUES ($1, 'weekly_review_analysis', true)`, [userId],
      );
      await pool.query(
        `INSERT INTO captures (id, user_id, entry_type, process_mode, allow_weekly_review)
         VALUES ($1, $2, 'quick_fragment', 'organize', true)`, [captureId, userId],
      );
      expect(await runAuthorizedWeeklyReview(pool, userId, [captureId], generate)).toEqual({
        status: 'ready', narrative: 'review',
      });
      await pool.query('UPDATE captures SET allow_weekly_review = false WHERE id = $1', [captureId]);
      generate.mockClear();
      expect(await runAuthorizedWeeklyReview(pool, userId, [captureId], generate)).toEqual({
        status: 'skipped', reason: 'record_permission_revoked',
      });
      expect(generate).not.toHaveBeenCalled();
      await pool.query('UPDATE captures SET allow_weekly_review = true WHERE id = $1', [captureId]);
      expect(await runAuthorizedWeeklyReview(pool, userId, [captureId], async () => {
        await pool.query('UPDATE captures SET allow_weekly_review = false WHERE id = $1', [captureId]);
        return 'discard me';
      })).toEqual({ status: 'skipped', reason: 'record_permission_revoked' });
    } finally {
      await pool.query('DELETE FROM captures WHERE id = $1', [captureId]);
      await pool.query('DELETE FROM consent_grants WHERE user_id = $1', [userId]);
      await pool.query('DELETE FROM users WHERE id = $1', [userId]);
      await pool.end?.();
    }
  });
});
