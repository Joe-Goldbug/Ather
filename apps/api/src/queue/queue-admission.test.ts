import { describe, expect, it, vi } from 'vitest';
import { withUserQueueAdmission, UserQueueAdmissionClosedError } from './queue-admission.js';

function fixture(user: { id: string } | null = { id: 'user-1' }) {
  const calls: string[] = [];
  const query = vi.fn(async (sql: string) => {
    calls.push(sql);
    if (sql.includes('FROM users')) return { rows: user ? [user] : [] };
    return { rows: [] };
  });
  const client = { query, release: vi.fn() };
  return { pool: { connect: vi.fn(async () => client) }, client, calls };
}

describe('user queue admission', () => {
  it('holds the user deletion lock until Redis accepts the job', async () => {
    const { pool, calls } = fixture();
    const enqueue = vi.fn(async () => {
      calls.push('ENQUEUE');
      return 'job-1';
    });

    await expect(withUserQueueAdmission(pool as never, 'user-1', enqueue)).resolves.toBe('job-1');
    expect(calls.find((sql) => sql.includes('pg_advisory_xact_lock'))).toContain('$1::text');
    expect(calls.find((sql) => sql.includes('FROM users'))).toContain('deletion_requested_at IS NULL');
    expect(calls.indexOf('ENQUEUE')).toBeLessThan(calls.indexOf('COMMIT'));
  });

  it('rejects the enqueue when the account is missing or deleting', async () => {
    const { pool, calls } = fixture(null);
    const enqueue = vi.fn();

    await expect(withUserQueueAdmission(pool as never, 'user-1', enqueue))
      .rejects.toBeInstanceOf(UserQueueAdmissionClosedError);
    expect(enqueue).not.toHaveBeenCalled();
    expect(calls).toContain('ROLLBACK');
  });
});
