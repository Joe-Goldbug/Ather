import { randomUUID } from 'node:crypto';
import { expect, test } from 'vitest';
import { Pool } from 'pg';
import { ConsentService } from './consent.service.js';
import { AuthService } from '../auth/auth.service.js';
import { MockRedis } from '../../common/mock-redis.js';
import { RedisService } from '../../common/redis.service.js';

const url = process.env.EVA_TEST_DATABASE_URL;
const isolated = process.env.EVA_TEST_DATABASE_ISOLATED === '1';
const queues = { removeUserJobs: async () => ({ status: 'completed' as const, removed: 0, active: 0 }) };

test('account deletion keeps an opaque restore tombstone after removing the user', async ({ skip }) => {
  if (!url || !isolated) skip();
  const pool = new Pool({ connectionString: url! });
  const userId = randomUUID();
  const redis = new RedisService(new MockRedis() as never);
  const service = new ConsentService({ pool } as never, redis, queues as never);
  try {
    await pool.query('INSERT INTO users (id, email) VALUES ($1, $2)',
      [userId, `delete-tombstone-${userId}@example.invalid`]);

    await expect(service.deleteUserData(userId)).resolves.toMatchObject({
      status: 'completed', deleted: true,
    });

    expect((await pool.query('SELECT id FROM users WHERE id = $1', [userId])).rows).toHaveLength(0);
    expect((await pool.query(
      'SELECT user_id, deleted_at FROM account_deletion_tombstones WHERE user_id = $1',
      [userId],
    )).rows).toHaveLength(1);
  } finally {
    await pool.query('DELETE FROM account_deletion_tombstones WHERE user_id = $1', [userId]);
    await pool.query('DELETE FROM users WHERE id = $1', [userId]);
    await pool.end();
  }
});

test('account deletion blocks a feedback insert after its explicit cleanup', async ({ skip }) => {
  if (!url || !isolated) skip();
  const pool = new Pool({ connectionString: url! });
  const userId = randomUUID();
  const feedbackId = randomUUID();
  let resumeDelete!: () => void;
  let feedbackCleared!: () => void;
  const resume = new Promise<void>((resolve) => { resumeDelete = resolve; });
  const cleared = new Promise<void>((resolve) => { feedbackCleared = resolve; });
  const service = new ConsentService({ pool: {
    connect: async () => {
      const client = await pool.connect();
      return {
        query: async (sql: string, params?: unknown[]) => {
          const result = await client.query(sql, params);
          if (sql.includes('DELETE FROM product_feedback WHERE user_id')) {
            feedbackCleared();
            await resume;
          }
          return result;
        },
        release: () => client.release(),
      };
    },
  } } as never, { del: async () => 0 } as never, queues as never);

  let deleting: Promise<void> | undefined;
  try {
    await pool.query('INSERT INTO users (id, email) VALUES ($1, $2)',
      [userId, `delete-race-${userId}@example.invalid`]);
    deleting = service.deleteUserData(userId);
    await cleared;

    const inserted = pool.query(
      `INSERT INTO product_feedback (id, user_id, category, content)
       VALUES ($1, $2, 'test', 'private feedback')`,
      [feedbackId, userId],
    ).then(() => 'inserted' as const, () => 'rejected' as const);
    const early = await Promise.race([
      inserted,
      new Promise<'pending'>((resolve) => setTimeout(() => resolve('pending'), 100)),
    ]);
    expect(early).toBe('pending');

    resumeDelete();
    await deleting;
    expect(await inserted).toBe('rejected');
    const leftovers = await pool.query('SELECT id FROM product_feedback WHERE id = $1', [feedbackId]);
    expect(leftovers.rows).toHaveLength(0);
  } finally {
    resumeDelete();
    await deleting?.catch(() => {});
    await pool.query('DELETE FROM product_feedback WHERE id = $1', [feedbackId]);
    await pool.query('DELETE FROM users WHERE id = $1', [userId]);
    await pool.query('DELETE FROM account_deletion_tombstones WHERE user_id = $1', [userId]);
    await pool.end();
  }
});

test('Redis invalidation failure rolls back a real PostgreSQL account deletion', async ({ skip }) => {
  if (!url || !isolated) skip();
  const pool = new Pool({ connectionString: url! });
  const userId = randomUUID();
  const email = `delete-redis-${userId}@example.invalid`;
  const service = new ConsentService({ pool } as never, {
    del: async () => { throw new Error('redis unavailable'); },
  } as never, queues as never);
  try {
    await pool.query('INSERT INTO users (id, email) VALUES ($1, $2)', [userId, email]);
    await expect(service.deleteUserData(userId)).resolves.toEqual({
      status: 'failed', deleted: false, reason: 'deletion_failed',
    });
    expect((await pool.query('SELECT id FROM users WHERE id = $1', [userId])).rows).toHaveLength(1);
  } finally {
    await pool.query('DELETE FROM users WHERE id = $1', [userId]);
    await pool.query('DELETE FROM account_deletion_tombstones WHERE user_id = $1', [userId]);
    await pool.end();
  }
});

test('send and delete serialize: old OTP cannot recreate the account, fresh OTP can', async ({ skip }) => {
  if (!url || !isolated) skip();
  const pool = new Pool({ connectionString: url! });
  const userId = randomUUID();
  const email = `delete-otp-${userId}@example.invalid`;
  const redis = new RedisService(new MockRedis() as never);
  const auth = new AuthService({ pool } as never, redis, {
    emails: { send: async () => ({ data: { id: 'local-test' }, error: null }) },
  } as never);
  const consent = new ConsentService({ pool } as never, redis, queues as never);
  const originalIssue = redis.issueOtp.bind(redis);
  let releaseIssue!: () => void;
  let issued!: () => void;
  const issueGate = new Promise<void>((resolve) => { releaseIssue = resolve; });
  const afterIssue = new Promise<void>((resolve) => { issued = resolve; });
  let gateFirst = true;
  redis.issueOtp = async (...args) => {
    const result = await originalIssue(...args);
    if (gateFirst) {
      gateFirst = false;
      issued();
      await issueGate;
    }
    return result;
  };
  const previousKey = process.env.RESEND_API_KEY;
  process.env.RESEND_API_KEY = 'isolated-test-key';
  let sending: Promise<void> | undefined;
  let deleting: Promise<void> | undefined;
  let newUserId: string | undefined;
  try {
    await pool.query('INSERT INTO users (id, email) VALUES ($1, $2)', [userId, email]);
    auth.generateOTP = () => '123456';
    sending = auth.sendOTP(email);
    await afterIssue;
    deleting = consent.deleteUserData(userId);
    const early = await Promise.race([
      deleting.then(() => 'deleted' as const),
      new Promise<'pending'>((resolve) => setTimeout(() => resolve('pending'), 100)),
    ]);
    expect(early).toBe('pending');
    releaseIssue();
    await sending;
    await deleting;
    expect(await redis.get(`otp:${email}`)).toBeNull();
    await redis.set(`otp:${email}`, `123456:${userId}`, 300);
    await expect(auth.verifyOTP(email, '123456')).rejects.toThrow('Invalid or expired OTP');
    auth.generateOTP = () => '654321';
    await auth.sendOTP(email);
    expect(await redis.get(`otp:${email}`)).toBe('654321:new');
    const result = await auth.verifyOTP(email, '654321');
    newUserId = result.user_id;
    expect(newUserId).not.toBe(userId);
    await redis.set(`otp:${email}`, `123456:${userId}`, 300);
    await expect(auth.verifyOTP(email, '123456')).rejects.toThrow('Invalid or expired OTP');
  } finally {
    releaseIssue();
    await sending?.catch(() => {});
    await deleting?.catch(() => {});
    if (previousKey === undefined) delete process.env.RESEND_API_KEY;
    else process.env.RESEND_API_KEY = previousKey;
    if (newUserId) await pool.query('DELETE FROM users WHERE id = $1', [newUserId]);
    await pool.query('DELETE FROM users WHERE id = $1', [userId]);
    await pool.query('DELETE FROM account_deletion_tombstones WHERE user_id = $1', [userId]);
    await pool.end();
  }
});

test('send started during deletion issues a fresh unbound OTP only after commit', async ({ skip }) => {
  if (!url || !isolated) skip();
  const pool = new Pool({ connectionString: url! });
  const userId = randomUUID();
  const email = `delete-first-${userId}@example.invalid`;
  const redis = new RedisService(new MockRedis() as never);
  let releaseDelete!: () => void;
  let reachedDelete!: () => void;
  const deleteGate = new Promise<void>((resolve) => { releaseDelete = resolve; });
  const afterDelete = new Promise<void>((resolve) => { reachedDelete = resolve; });
  const consent = new ConsentService({ pool: {
    connect: async () => {
      const client = await pool.connect();
      return {
        query: async (sql: string, params?: unknown[]) => {
          const result = await client.query(sql, params);
          if (sql === 'DELETE FROM users WHERE id = $1') {
            reachedDelete();
            await deleteGate;
          }
          return result;
        },
        release: () => client.release(),
      };
    },
  } } as never, redis, queues as never);
  const auth = new AuthService({ pool } as never, redis, {
    emails: { send: async () => ({ data: { id: 'local-test' }, error: null }) },
  } as never);
  const previousKey = process.env.RESEND_API_KEY;
  process.env.RESEND_API_KEY = 'isolated-test-key';
  let deleting: Promise<void> | undefined;
  let sending: Promise<void> | undefined;
  try {
    await pool.query('INSERT INTO users (id, email) VALUES ($1, $2)', [userId, email]);
    deleting = consent.deleteUserData(userId);
    await afterDelete;
    auth.generateOTP = () => '654321';
    sending = auth.sendOTP(email);
    const early = await Promise.race([
      sending.then(() => 'sent' as const),
      new Promise<'pending'>((resolve) => setTimeout(() => resolve('pending'), 100)),
    ]);
    expect(early).toBe('pending');
    releaseDelete();
    await deleting;
    await sending;
    expect(await redis.get(`otp:${email}`)).toBe('654321:new');
  } finally {
    releaseDelete();
    await deleting?.catch(() => {});
    await sending?.catch(() => {});
    if (previousKey === undefined) delete process.env.RESEND_API_KEY;
    else process.env.RESEND_API_KEY = previousKey;
    await pool.query('DELETE FROM users WHERE id = $1', [userId]);
    await pool.query('DELETE FROM account_deletion_tombstones WHERE user_id = $1', [userId]);
    await pool.end();
  }
});
