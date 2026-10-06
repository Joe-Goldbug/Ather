import { BadRequestException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { ConsentService, validateConsentType } from './consent.service.js';
import { ConsentController } from './consent.controller.js';

function fixture() {
  const calls: string[] = [];
  const advisoryLocks: unknown[] = [];
  const query = vi.fn(async (sql: string, params?: unknown[]) => {
    calls.push(sql);
    if (sql.includes('pg_advisory_xact_lock')) advisoryLocks.push(params?.[0]);
    if (sql === 'SELECT email FROM users WHERE id = $1 FOR UPDATE') return { rows: [{ email: 'test@example.com' }] };
    if (sql === 'SELECT email FROM users WHERE id = $1') return { rows: [{ email: 'test@example.com' }] };
    return { rows: [] };
  });
  const client = { query, release: vi.fn() };
  const db = { pool: { query, connect: vi.fn(async () => client) } };
  const redis = { del: vi.fn(async () => 2) };
  const queues = { removeUserJobs: vi.fn(async () => ({ status: 'completed', removed: 0, active: 0 })) };
  return { service: new ConsentService(db as never, redis as never, queues as never), calls, advisoryLocks, query, client, redis, queues };
}

describe('consent control', () => {
  it('defaults new purposes to false and rejects unknown input', async () => {
    const { service } = fixture();
    const status = await service.getStatus('user-1');
    expect(status.weekly_review_analysis).toBe(false);
    expect(status.report_generation).toBe(false);
    expect(status.chat_history_use).toBe(false);
    expect(() => validateConsentType('unexpected')).toThrow(BadRequestException);
    const controller = new ConsentController(service);
    await expect(controller.grant({ consent_type: 'unexpected' }, { user: { id: 'user-1' } } as never)).rejects.toThrow(BadRequestException);
  });

  it('revokes an explicit purpose grant', async () => {
    let granted = false;
    const query = vi.fn(async (sql: string) => {
      if (sql.includes('INSERT INTO consent_grants')) granted = true;
      if (sql.includes('SET granted = false')) granted = false;
      return { rows: sql.includes('SELECT consent_type, granted')
        ? [{ consent_type: 'weekly_review_analysis', granted }] : [] };
    });
    const service = new ConsentService({ pool: { query } } as never, {} as never, {} as never);
    await service.grant('user-1', 'weekly_review_analysis');
    expect((await service.getStatus('user-1')).weekly_review_analysis).toBe(true);
    await service.revoke('user-1', 'weekly_review_analysis');
    expect((await service.getStatus('user-1')).weekly_review_analysis).toBe(false);
    expect(query.mock.calls[0][0]).toContain('INSERT INTO consent_grants');
    expect(query.mock.calls[2][0]).toContain('SET granted = false');
  });

  it('exports archive, feedback and child records in one snapshot', async () => {
    const { service, calls } = fixture();
    const data = await service.exportUserData('user-1');
    expect(calls[0]).toContain('REPEATABLE READ READ ONLY');
    expect(calls).toContainEqual(expect.stringContaining('FROM evidence_input_archives WHERE user_id = $1'));
    expect(calls).toContainEqual(expect.stringContaining('FROM product_feedback WHERE user_id = $1'));
    expect(calls).toContainEqual(expect.stringContaining('FROM portrait_revision_evidence WHERE'));
    expect(data).toHaveProperty('session_tokens');
    expect(calls.at(-1)).toBe('COMMIT');
  });

  it('exports non-secret account state and every current portrait outbox owner kind', async () => {
    const { service, calls } = fixture();
    await service.exportUserData('user-1');
    const usersQuery = calls.find((sql) => sql.includes('FROM users WHERE id = $1')) ?? '';
    expect(usersQuery).toContain('script_completed');
    expect(usersQuery).toContain('entitlement_tier');
    expect(usersQuery).toContain('anonymous_id');
    expect(usersQuery).toContain('is_synthetic');
    expect(usersQuery).not.toContain('session_token');
    const outboxQuery = calls.find((sql) => sql.includes('FROM portrait_outbox WHERE')) ?? '';
    expect(outboxQuery).toContain('portrait_revisions');
    expect(outboxQuery).toContain('published_observation_revisions');
    expect(outboxQuery).toContain('correction_records');
  });

  it('redacts credentials from user audit snapshots', async () => {
    const { service, query } = fixture();
    query.mockImplementation(async (sql: string) => ({ rows: sql.includes('FROM audit_logs')
      ? [{ table_name: 'users', old_data: { id: 'user-1', session_token: 'secret', email_hash: 'hash' }, new_data: null }]
      : [] }));
    const data = await service.exportUserData('user-1');
    expect(data.audit_logs).toEqual([{ table_name: 'users', old_data: { id: 'user-1' }, new_data: null }]);
  });

  it('deletes independent copies and FK children before parents, then clears trigger audit rows', async () => {
    const { service, calls, advisoryLocks } = fixture();
    await service.deleteUserData('user-1');
    const index = (s: string) => calls.findIndex((sql) => sql.includes(s));
    expect(calls).toContain('SELECT email FROM users WHERE id = $1 FOR UPDATE');
    expect(advisoryLocks).toEqual(['test@example.com', 'user-1']);
    expect(calls.findIndex((sql) => sql.includes('pg_advisory_xact_lock'))).toBeLessThan(index('FOR UPDATE'));
    expect(index('DELETE FROM evidence_input_archives')).toBeLessThan(index('DELETE FROM users'));
    expect(index('DELETE FROM product_feedback')).toBeLessThan(index('DELETE FROM users'));
    expect(index('DELETE FROM observation_responses')).toBeLessThan(index('DELETE FROM published_observations'));
    expect(index('DELETE FROM published_observations')).toBeLessThan(index('DELETE FROM continuous_portraits'));
    expect(index('DELETE FROM continuous_portraits')).toBeLessThan(index('DELETE FROM evidence_events'));
    expect(index('DELETE FROM user_corrections')).toBeLessThan(index('DELETE FROM evidence_events'));
    expect(index('DELETE FROM conversation_reports')).toBeLessThan(index('DELETE FROM conversations'));
    expect(index('INSERT INTO account_deletion_tombstones')).toBeLessThan(index('DELETE FROM users'));
    expect(index('DELETE FROM audit_logs')).toBeLessThan(index('DELETE FROM users'));
    expect(calls.find((sql) => sql.includes('DELETE FROM audit_logs'))).toContain('$1::text');
    expect(calls.at(-1)).toBe('COMMIT');
  });

  it('stores only the opaque user id in the restore deletion ledger', async () => {
    const { service, calls } = fixture();

    await service.deleteUserData('user-1');

    const tombstoneQuery = calls.find((sql) => sql.includes('INSERT INTO account_deletion_tombstones')) ?? '';
    expect(tombstoneQuery).toContain('(user_id)');
    expect(tombstoneQuery).not.toContain('email');
    expect(tombstoneQuery).not.toContain('content');
  });

  it('deletes outbox events for revisions and corrections before their owners', async () => {
    const { service, calls } = fixture();
    await service.deleteUserData('user-1');
    const outboxQuery = calls.find((sql) => sql.includes('DELETE FROM portrait_outbox WHERE')) ?? '';
    expect(outboxQuery).toContain('portrait_revisions');
    expect(outboxQuery).toContain('published_observation_revisions');
    expect(outboxQuery).toContain('correction_records');
    expect(calls.indexOf(outboxQuery)).toBeLessThan(calls.findIndex((sql) => sql.includes('DELETE FROM observation_responses')));
  });

  it('rolls back on a failed child delete and does not delete the user', async () => {
    const { service, query, calls } = fixture();
    query.mockImplementation(async (sql: string) => {
      calls.push(sql);
      if (sql.includes('DELETE FROM product_feedback')) throw new Error('fk failure');
      if (sql === 'SELECT email FROM users WHERE id = $1' || sql === 'SELECT email FROM users WHERE id = $1 FOR UPDATE') {
        return { rows: [{ email: 'test@example.com' }] };
      }
      return { rows: [] };
    });
    await expect(service.deleteUserData('user-1')).resolves.toEqual({
      status: 'failed', deleted: false, reason: 'deletion_failed',
    });
    expect(calls).toContain('ROLLBACK');
    expect(calls.some((sql) => sql.includes('DELETE FROM users'))).toBe(false);
  });

  it('rolls back account deletion when Redis OTP invalidation fails', async () => {
    const { service, redis, calls } = fixture();
    redis.del.mockRejectedValue(new Error('redis unavailable'));
    await expect(service.deleteUserData('user-1')).resolves.toEqual({
      status: 'failed', deleted: false, reason: 'deletion_failed',
    });
    expect(calls).toContain('ROLLBACK');
    expect(calls).not.toContain('COMMIT');
  });

  it('returns pending without deleting PostgreSQL data while a user queue job is active', async () => {
    const { service, queues, calls } = fixture();
    queues.removeUserJobs.mockResolvedValue({ status: 'pending', removed: 2, active: 1 });

    await expect(service.deleteUserData('user-1')).resolves.toEqual({
      status: 'pending',
      deleted: false,
      active_jobs: 1,
    });
    expect(calls.some((sql) => sql.includes('DELETE FROM users'))).toBe(false);
    expect(calls.some((sql) => sql.includes('SET deletion_requested_at'))).toBe(true);
    expect(calls.indexOf('COMMIT')).toBeGreaterThan(calls.findIndex((sql) => sql.includes('SET deletion_requested_at')));
  });

  it('does not claim provider backup expiry before provider verification', async () => {
    const { service } = fixture();
    await expect(service.deleteUserData('user-1')).resolves.toEqual({
      status: 'completed',
      deleted: true,
      backup_deletion: {
        status: 'provider_verification_required',
        maximum_retention_days: 30,
      },
    });
  });

  it('returns failed without deleting the account when queue cleanup is unavailable', async () => {
    const { service, queues, calls } = fixture();
    queues.removeUserJobs.mockRejectedValue(new Error('redis unavailable'));

    await expect(service.deleteUserData('user-1')).resolves.toEqual({
      status: 'failed',
      deleted: false,
      reason: 'queue_cleanup_failed',
    });
    expect(calls.some((sql) => sql.includes('DELETE FROM users'))).toBe(false);
  });
});
