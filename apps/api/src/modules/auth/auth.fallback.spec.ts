// apps/api/src/modules/auth/auth.fallback.spec.ts
// 钉死 "dev-login never fabricates a non-UUID id" 这条不变量。
// 回归保护：如果以后有人把 dev-mock 字符串 id 路径加回来（或重新把 mock
// fallback 加进 controller），这些测试都会挂，提醒其踩坑历史。
//
// 修复记录（2026-09-10）：原实现用 `mockResolvedValueOnce` 链，但
// loginOrRegister 每次成功登录会执行 3 条语句：
//   1) INSERT INTO users ... RETURNING id, email, created_at
//   2) INSERT INTO session_tokens ... RETURNING id
//   3) INSERT INTO login_events ...
// 原链只给了 3 个一次性返回值，且第 2 个返回 `{ rows: [] }`，于是
// `tokenRows.rows[0].id` 取到 undefined 抛 TypeError；重试路径上第 2 次
// 尝试把 mock 用尽后同样 TypeError。现改为按 SQL 内容应答的假 DB，
// 使测试与 loginOrRegister 的语句条数解耦。

import { Test, TestingModule } from '@nestjs/testing';
import { jest } from '@jest/globals';
import { ServiceUnavailableException } from '@nestjs/common';
import { AuthService } from './auth.service.js';
import { Database } from '../../common/database.js';
import { RedisService } from '../../common/redis.service.js';

// UUID 形式：8-4-4-4-12 hex
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DEV_EMAIL = 'dev@eva.local';
const REAL_USER_ID = '205ac0df-19a5-4924-a95d-053b38a34958';

type QueryResult = { rows: unknown[] };

/**
 * 按 SQL 内容应答的假 DB。
 *
 * @param options.failAttempts  前 N 轮登录（每轮以 users INSERT 起算）抛瞬时错误
 * @param options.failCode      瞬时错误码，默认 ECONNREFUSED
 * @param options.alwaysFailCode 若提供，则每一次 users INSERT 都抛该错误
 *                              （用于验证重试窗口耗尽后的行为）
 */
function makeFakeDb(
  options: { failAttempts?: number; failCode?: string; alwaysFailCode?: string } = {},
) {
  const { failAttempts = 0, failCode = 'ECONNREFUSED', alwaysFailCode } = options;
  let attempt = 0;

  const failWith = (code: string) => {
    const err = new Error(`connect ECONNREFUSED 127.0.0.1:5432 (code=${code})`) as Error & {
      code: string;
    };
    err.code = code;
    return Promise.reject(err);
  };

  const query = jest.fn(async (sql: string, params?: unknown[]): Promise<QueryResult> => {
    const text = String(sql);

    if (text.includes('INSERT INTO users')) {
      attempt += 1;
      if (alwaysFailCode) return failWith(alwaysFailCode);
      if (attempt <= failAttempts) return failWith(failCode);
      return { rows: [{ id: REAL_USER_ID, email: params?.[0] ?? DEV_EMAIL, created_at: new Date() }] };
    }
    // session_tokens 必须返回带 id 的行：loginOrRegister 会读 rows[0].id
    if (text.includes('INSERT INTO session_tokens')) {
      return { rows: [{ id: '00000000-0000-4000-8000-000000000001' }] };
    }
    return { rows: [] };
  });

  return { query, attempts: () => attempt };
}

type FakeDb = ReturnType<typeof makeFakeDb>;

describe('AuthService.loginOrRegisterWithDevFallback', () => {
  let service: AuthService;

  async function buildService(fake: FakeDb): Promise<void> {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: Database, useValue: { pool: { query: fake.query } } },
        {
          provide: RedisService,
          useValue: { get: jest.fn(), set: jest.fn(), del: jest.fn() },
        },
        { provide: 'RESEND_CLIENT', useValue: { emails: { send: jest.fn() } } },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  }

  beforeEach(() => {
    // 固定重试次数（4 次）取决于 NODE_ENV !== 'production'，显式钉住以保证确定性。
    process.env.NODE_ENV = 'test';
    // Speed up retries for tests: the retry loop has 250/500/750ms backoff.
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('returns a real UUID user_id and hex token on DB success (happy path)', async () => {
    const fake = makeFakeDb();
    await buildService(fake);

    const result = await service.loginOrRegisterWithDevFallback(DEV_EMAIL);

    expect(result.user_id).toMatch(UUID_RE);
    expect(result.user_id).toBe(REAL_USER_ID);
    expect(result.token).toMatch(/^[0-9a-f]+$/);
    expect(result.token).not.toContain('-');
    expect(result.mode).toBe('db');
    // Critically: the returned id MUST NOT look like the old dev-mock shape
    expect(result.user_id).not.toMatch(/^dev-mock-/);
    expect(result.token).not.toMatch(/^devmock_/);
    // 三次语句都执行过：users → session_tokens → login_events
    expect(fake.query).toHaveBeenCalledTimes(3);
  });

  it('retries transient ECONNREFUSED then succeeds without ever fabricating a non-UUID id', async () => {
    const fake = makeFakeDb({ failAttempts: 1 });
    await buildService(fake);

    // Advance timers so the backoff between retries elapses
    const promise = service.loginOrRegisterWithDevFallback(DEV_EMAIL);
    await jest.advanceTimersByTimeAsync(1000);
    const result = await promise;

    expect(result.user_id).toMatch(UUID_RE);
    expect(result.user_id).not.toMatch(/^dev-mock-/);
    expect(fake.attempts()).toBe(2); // 第 1 轮失败，第 2 轮成功
  });

  it('throws ServiceUnavailableException after the retry window, never returning a non-UUID id', async () => {
    const fake = makeFakeDb({ alwaysFailCode: 'ECONNREFUSED' });
    await buildService(fake);

    const promise = service.loginOrRegisterWithDevFallback(DEV_EMAIL).catch((e) => e);
    await jest.advanceTimersByTimeAsync(5000);
    const err = await promise;

    expect(err).toBeInstanceOf(ServiceUnavailableException);
    // dev 模式重试窗口为 4 次尝试（250/500/750ms 退避）
    expect(fake.attempts()).toBe(4);
  });

  it('surfaces non-transient pg errors as ServiceUnavailableException in dev (no fabricated id)', async () => {
    // In dev, fatal SQL errors are surfaced as 503 so the controller can
    // answer with a friendly "DB unavailable" message instead of leaving
    // the user staring at an opaque 500. We never invent a mock id.
    const fake = makeFakeDb({ alwaysFailCode: '42501' });
    await buildService(fake);

    // Important invariant: the failed attempt must NOT have produced any
    // call that returns a non-UUID id. We assert the error type instead.
    await expect(service.loginOrRegisterWithDevFallback(DEV_EMAIL)).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
    // 非瞬时错误应立刻中断，不进入重试
    expect(fake.attempts()).toBe(1);
  });
});
