import { describe, expect, it, vi } from 'vitest';
import { Queue } from 'bullmq';
import { createQueryPool } from '../common/pool.js';
import type { ReportJob } from './queue.js';
import { recoverStaleReportsOnce } from './report-recovery.js';

const report = {
  id: 'report-1',
  conversation_id: 'conversation-1',
  user_id: 'user-1',
  report_locale: 'en',
};

function fixture(state?: string, userAdmitted = true) {
  const queries: string[] = [];
  const query = vi.fn(async (sql: string) => {
    queries.push(sql);
    if (sql.includes('FROM conversation_reports')) return { rows: [report] };
    if (sql.includes('FROM users')) return { rows: userAdmitted ? [{ id: report.user_id }] : [] };
    if (sql.includes("SET status = 'failed'")) return { rows: [{ conversation_id: report.conversation_id }] };
    if (sql.includes('UPDATE conversations')) return { rows: [{ id: report.conversation_id }] };
    return { rows: [] };
  });
  const client = { query, release: vi.fn() };
  const pool = { connect: vi.fn(async () => client) };
  const getJob = vi.fn(async () => state ? { getState: async () => state } : undefined);
  const add = vi.fn(async () => { queries.push('ENQUEUE'); return { id: report.id }; });
  return { pool, queue: { getJob, add }, queries };
}

describe('stale report recovery', () => {
  it('claims missing jobs under a row lock, then requeues after commit', async () => {
    const { pool, queue, queries } = fixture();
    await expect(recoverStaleReportsOnce(pool as never, queue as never)).resolves.toBe(1);
    expect(queries.find((sql) => sql.includes('FROM conversation_reports'))).toContain('FOR UPDATE SKIP LOCKED');
    expect(queue.add).toHaveBeenCalledWith('generate', {
      reportId: report.id,
      conversationId: report.conversation_id,
      userId: report.user_id,
      locale: report.report_locale,
    }, { jobId: report.id });
    expect(queries.indexOf('COMMIT')).toBeLessThan(queries.indexOf('ENQUEUE'));
  });

  it('does not duplicate a waiting or active job', async () => {
    const { pool, queue, queries } = fixture('active');
    await expect(recoverStaleReportsOnce(pool as never, queue as never)).resolves.toBe(0);
    expect(queue.add).not.toHaveBeenCalled();
    expect(queries.some((sql) => sql.includes('UPDATE conversation_reports'))).toBe(true);
  });

  it('does not revive a report job after account deletion starts', async () => {
    const { pool, queue } = fixture(undefined, false);
    await expect(recoverStaleReportsOnce(pool as never, queue as never)).resolves.toBe(0);
    expect(queue.add).not.toHaveBeenCalled();
  });

  it('closes a report whose Redis job ended without a stored result', async () => {
    const { pool, queue, queries } = fixture('completed');
    await expect(recoverStaleReportsOnce(pool as never, queue as never)).resolves.toBe(1);
    expect(queue.add).not.toHaveBeenCalled();
    expect(queries.some((sql) => sql.includes("status = 'failed'"))).toBe(true);
    expect(queries.some((sql) => sql.includes('UPDATE conversations'))).toBe(true);
  });

  it('rolls back and retries later when Redis rejects the enqueue', async () => {
    const { pool, queue, queries } = fixture();
    queue.add.mockRejectedValueOnce(new Error('redis unavailable'));
    await expect(recoverStaleReportsOnce(pool as never, queue as never)).rejects.toThrow('redis unavailable');
    expect(queries).toContain('COMMIT');
  });

  it.skipIf(!process.env.EVA_TEST_DATABASE_URL)('recovers committed rows against PostgreSQL', async () => {
    const pool = createQueryPool(process.env.EVA_TEST_DATABASE_URL!);
    const userId = crypto.randomUUID();
    const conversationId = crypto.randomUUID();
    const reportId = crypto.randomUUID();
    const queue = { getJob: vi.fn(async () => undefined), add: vi.fn(async () => ({ id: reportId })) };
    try {
      await pool.query('INSERT INTO users (id, email) VALUES ($1, $2)', [userId, `${userId}@example.test`]);
      await pool.query('INSERT INTO conversations (id, user_id) VALUES ($1, $2)', [conversationId, userId]);
      await pool.query(
        `INSERT INTO conversation_reports (id, conversation_id, user_id, report_locale, status, updated_at)
         VALUES ($1, $2, $3, 'ja', 'generating', NOW() - INTERVAL '3 minutes')`,
        [reportId, conversationId, userId],
      );
      expect(await recoverStaleReportsOnce(pool, queue as never)).toBeGreaterThanOrEqual(1);
      expect(queue.add).toHaveBeenCalledWith('generate', {
        reportId, conversationId, userId, locale: 'ja',
      }, { jobId: reportId });
      const saved = await pool.query<{ status: string; report_locale: string }>(
        'SELECT status, report_locale FROM conversation_reports WHERE id = $1', [reportId],
      );
      expect(saved.rows[0]).toEqual({ status: 'generating', report_locale: 'ja' });
      expect(await recoverStaleReportsOnce(pool, queue as never)).toBe(0);

      await pool.query(
        `UPDATE conversation_reports SET updated_at = NOW() - INTERVAL '3 minutes' WHERE id = $1`,
        [reportId],
      );
      queue.add.mockClear();
      await Promise.all([
        recoverStaleReportsOnce(pool, queue as never),
        recoverStaleReportsOnce(pool, queue as never),
      ]);
      expect(queue.add.mock.calls.filter(([, payload]) => payload.reportId === reportId)).toHaveLength(1);

      await pool.query(
        `UPDATE conversation_reports SET updated_at = NOW() - INTERVAL '3 minutes' WHERE id = $1`,
        [reportId],
      );
      queue.getJob.mockResolvedValue({ getState: async () => 'completed' } as never);
      await recoverStaleReportsOnce(pool, queue as never);
      const failed = await pool.query<{ status: string; error_message: string }>(
        'SELECT status, error_message FROM conversation_reports WHERE id = $1', [reportId],
      );
      expect(failed.rows[0]).toEqual({
        status: 'failed', error_message: 'report_job_completed_without_result',
      });
      const conversation = await pool.query<{ meta: { report?: { status?: string } } }>(
        'SELECT meta FROM conversations WHERE id = $1', [conversationId],
      );
      expect(conversation.rows[0].meta.report?.status).toBe('failed');
    } finally {
      await pool.query('DELETE FROM conversation_reports WHERE id = $1', [reportId]);
      await pool.query('DELETE FROM conversations WHERE id = $1', [conversationId]);
      await pool.query('DELETE FROM users WHERE id = $1', [userId]);
      await pool.end?.();
    }
  });

  it.skipIf(!process.env.EVA_TEST_DATABASE_URL || !process.env.EVA_TEST_REDIS_URL)(
    'requeues a missing job against real PostgreSQL and BullMQ Redis', async () => {
      const pool = createQueryPool(process.env.EVA_TEST_DATABASE_URL!);
      const redisUrl = new URL(process.env.EVA_TEST_REDIS_URL!);
      const queue = new Queue<ReportJob>(`report-recovery-test-${crypto.randomUUID()}`, {
        connection: { host: redisUrl.hostname, port: Number(redisUrl.port) },
      });
      const userId = crypto.randomUUID();
      const conversationId = crypto.randomUUID();
      const reportId = crypto.randomUUID();
      try {
        await pool.query('INSERT INTO users (id, email) VALUES ($1, $2)', [userId, `${userId}@example.test`]);
        await pool.query('INSERT INTO conversations (id, user_id) VALUES ($1, $2)', [conversationId, userId]);
        await pool.query(
          `INSERT INTO conversation_reports (id, conversation_id, user_id, report_locale, status, updated_at)
           VALUES ($1, $2, $3, 'es', 'generating', NOW() - INTERVAL '3 minutes')`,
          [reportId, conversationId, userId],
        );
        await recoverStaleReportsOnce(pool, queue);
        const job = await queue.getJob(reportId);
        expect(job?.data).toEqual({ reportId, conversationId, userId, locale: 'es' });
        await pool.query(
          `UPDATE conversation_reports SET updated_at = NOW() - INTERVAL '3 minutes' WHERE id = $1`,
          [reportId],
        );
        await recoverStaleReportsOnce(pool, queue);
        expect((await queue.getJob(reportId))?.id).toBe(job?.id);
      } finally {
        await queue.close();
        await pool.query('DELETE FROM conversation_reports WHERE id = $1', [reportId]);
        await pool.query('DELETE FROM conversations WHERE id = $1', [conversationId]);
        await pool.query('DELETE FROM users WHERE id = $1', [userId]);
        await pool.end?.();
      }
    },
  );

  it.skipIf(!process.env.EVA_TEST_DATABASE_URL || !process.env.EVA_TEST_REDIS_URL)(
    'releases the database claim when Redis is unavailable, then retries after recovery', async () => {
      const pool = createQueryPool(process.env.EVA_TEST_DATABASE_URL!);
      const queueName = `report-recovery-outage-${crypto.randomUUID()}`;
      const badQueue = new Queue<ReportJob>(queueName, {
        connection: {
          host: '127.0.0.1', port: 55443, connectTimeout: 500,
          maxRetriesPerRequest: 1, retryStrategy: () => null,
        },
      });
      const redisUrl = new URL(process.env.EVA_TEST_REDIS_URL!);
      const goodQueue = new Queue<ReportJob>(queueName, {
        connection: { host: redisUrl.hostname, port: Number(redisUrl.port) },
      });
      const userId = crypto.randomUUID();
      const conversationId = crypto.randomUUID();
      const reportId = crypto.randomUUID();
      try {
        await pool.query('INSERT INTO users (id, email) VALUES ($1, $2)', [userId, `${userId}@example.test`]);
        await pool.query('INSERT INTO conversations (id, user_id) VALUES ($1, $2)', [conversationId, userId]);
        await pool.query(
          `INSERT INTO conversation_reports (id, conversation_id, user_id, report_locale, status, updated_at)
           VALUES ($1, $2, $3, 'en', 'generating', NOW() - INTERVAL '3 minutes')`,
          [reportId, conversationId, userId],
        );
        await expect(recoverStaleReportsOnce(pool, badQueue)).rejects.toThrow();
        const claimed = await pool.query<{ status: string }>(
          'SELECT status FROM conversation_reports WHERE id = $1', [reportId],
        );
        expect(claimed.rows[0].status).toBe('generating');
        await pool.query(
          `UPDATE conversation_reports SET updated_at = NOW() - INTERVAL '3 minutes' WHERE id = $1`,
          [reportId],
        );
        await recoverStaleReportsOnce(pool, goodQueue);
        expect((await goodQueue.getJob(reportId))?.data.locale).toBe('en');
      } finally {
        await badQueue.close().catch(() => {});
        await goodQueue.close();
        await pool.query('DELETE FROM conversation_reports WHERE id = $1', [reportId]);
        await pool.query('DELETE FROM conversations WHERE id = $1', [conversationId]);
        await pool.query('DELETE FROM users WHERE id = $1', [userId]);
        await pool.end?.();
      }
    }, 10_000,
  );
});
