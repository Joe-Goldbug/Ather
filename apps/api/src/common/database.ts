// apps/api/src/common/database.ts
// Shared Neon PostgreSQL Pool provider for all modules.
// Import Database into services to get a pre-configured Pool.

import 'dotenv/config'; // Ensure dotenv is loaded before pool initializes
import { Global, Module } from '@nestjs/common';
import { AsyncLocalStorage } from 'async_hooks';
import { createQueryPool, type QueryPool } from './pool.js';

// Per-request token storage — set by SessionInterceptor after AuthGuard validates
const tokenStorage = new AsyncLocalStorage<string>();

const CLIENT_ERROR_GUARD = Symbol.for('ather.clientErrorGuard');

/**
 * [Ather-Solana 2026-10-04] 连接故障重试。
 *
 * 背景：Neon 池化连接被耗尽或网络抖动后，池不会自愈——
 * 后续请求持续抛 `ErrorEvent { type: 'error' }`，表现为
 * dev-login 返回 503「Database is unavailable」，**必须重启进程才能恢复**。
 * 实测一次密集的接口自测就能把连接池打满，调试时极具破坏性。
 *
 * 这里对 query 与 connect 都加有限重试 + 退避，让瞬时故障自愈。
 * 只对「连接类」错误重试；SQL 语法/约束错误立即抛出，避免掩盖真实 bug。
 */
const RETRYABLE =
  /terminated|ECONNRESET|ETIMEDOUT|ENOTFOUND|socket|websocket|connection closed|not open|fetch failed|timeout exceeded/i;

function isRetryable(err: unknown): boolean {
  if (err === null || err === undefined) return true;
  if (!(err instanceof Error)) return true; // Neon 的 socket 错误是 ErrorEvent
  return RETRYABLE.test(err.message);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function withRetry<T>(
  label: string,
  attempts: number,
  fn: () => Promise<T>,
): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i += 1) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (!isRetryable(err)) throw err;
      const message = err instanceof Error ? err.message : String(err);
      console.warn(
        `[db] ${label} attempt ${i + 1}/${attempts} failed: ${message}`,
      );
      if (i < attempts - 1) await sleep(400 * (i + 1));
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

/**
 * [fix 2026-08-01] A pooled client is an EventEmitter. When PG returns an
 * ErrorResponse that cannot be attributed to an active query, pg/neon emits
 * `error` on the client; with no listener attached that is rethrown from
 * `process.nextTick` and takes the whole process down. The pool-level guard in
 * pool.ts does not cover clients checked out via `connect()`, so attach a
 * per-client guard as a last line of defence.
 */
function attachClientErrorGuard(client: unknown): void {
  const emitter = client as { on?: (event: string, cb: (err: unknown) => void) => void } & Record<
    symbol,
    unknown
  >;
  if (typeof emitter.on !== 'function' || emitter[CLIENT_ERROR_GUARD]) return;
  emitter[CLIENT_ERROR_GUARD] = true;
  emitter.on('error', (err: unknown) => {
    const message = err instanceof Error ? err.message : String(err);
    // eslint-disable-next-line no-console
    console.warn(`[db] pooled client error (suppressed): ${message}`);
  });
}

export class Database {
  /**
   * Proxied pool: when a session token is stored in AsyncLocalStorage (set by
   * SessionInterceptor), every query and connect() call automatically injects
   * `app.session_token` on the connection, so audit_trigger + RLS see the
   * correct caller.  Without a token (background workers, health checks) the
   * pool is used as-is.
   */
  readonly pool: QueryPool;

  constructor(basePool: QueryPool) {
    this.pool = {
      query: async <T = unknown>(text: string, params?: unknown[]) => {
        const token = tokenStorage.getStore();
        if (!token) return withRetry('query(anon)', 3, () => basePool.query<T>(text, params));
        // Use a dedicated client so set_config is scoped to this connection
        return withRetry('query', 3, async () => {
          const client = await basePool.connect();
          attachClientErrorGuard(client);
          try {
            await client.query(`SELECT set_config('app.session_token', $1, false)`, [token]);
            // [fix 2026-08-01] MUST await here. A bare `return client.query(...)`
            // lets the `finally` block run immediately, which resets the session
            // token and releases the client while the query is still in flight.
            // Any PG error then arrives on an idle client with no activeQuery,
            // so pg emits `error` on the client instead of rejecting the promise
            // — with no listener that becomes an uncaught throw and kills the
            // whole API process (repro: SELECT on a missing column).
            return await client.query<T>(text, params);
          } finally {
            // Reset before returning to pool so next caller never sees a stale token.
            // 若重置失败，连接仍可能带着上一个用户的 token —— 此时必须**销毁**该连接
            // 而不是归还连接池（node-postgres: release(true) 销毁而非复用），
            // 否则后续查询会继承错误的租户上下文（RLS 策略正是读这个 token）。
            let resetFailed = false;
            try {
              await client.query(`SELECT set_config('app.session_token', '', false)`);
            } catch {
              resetFailed = true;
            }
            client.release(resetFailed ? true : undefined);
          }
        });
      },
      connect: async () => {
        const client = await withRetry('connect', 3, () => basePool.connect());
        attachClientErrorGuard(client);
        const token = tokenStorage.getStore();
        if (token) {
          await client.query(`SELECT set_config('app.session_token', $1, false)`, [token]);
        }
        // Wrap release() in-place so pg's prototype methods stay intact.
        const originalRelease = client.release.bind(client);
        client.release = () => {
          client
            .query(`SELECT set_config('app.session_token', '', false)`)
            .then(
              () => originalRelease(),
              // 重置失败 → 销毁连接，绝不把带 token 的连接归还池
              () => originalRelease(true),
            );
        };
        return client;
      },
      ...(basePool.end ? { end: () => basePool.end!() } : {}),
    };
  }

  /** Run fn in a context where every pool.query/connect carries the session token */
  runWithToken<T>(token: string, fn: () => Promise<T>): Promise<T> {
    return tokenStorage.run(token, fn);
  }
}

@Global()
@Module({
  providers: [
    {
      provide: Database,
      useFactory: () => {
        const connectionString = process.env.DATABASE_URL;
        return new Database(createQueryPool(connectionString));
      },
    },
  ],
  exports: [Database],
})
export class DatabaseModule {}
