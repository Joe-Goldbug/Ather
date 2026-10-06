import { Pool as NeonPool } from '@neondatabase/serverless';
import pg from 'pg';

const { Pool: PgPool } = pg;

export interface PoolClient {
  query<T = any>(text: string, params?: unknown[]): Promise<{ rows: T[] }>;
  /**
   * 归还连接到池。传入 `true` 或 Error 时**销毁**连接而非复用（node-postgres / neon 语义）。
   * 用于「连接状态已不可信」的场景——例如 session token 重置失败，此时归还池会让
   * 后续查询继承错误的租户上下文。
   */
  release(destroy?: boolean | Error): void;
}

export interface QueryPool {
  query<T = any>(text: string, params?: unknown[]): Promise<{ rows: T[] }>;
  connect(): Promise<PoolClient>;
  end?(): Promise<void>;
}

function isLocalDatabaseUrl(connectionString: string): boolean {
  try {
    const url = new URL(connectionString);
    return ['localhost', '127.0.0.1', '::1'].includes(url.hostname);
  } catch {
    return false;
  }
}

export function validateDatabaseUrl(connectionString: string | undefined): string {
  if (!connectionString?.trim()) {
    throw new Error('[db] DATABASE_URL is missing');
  }
  let url: URL;
  try {
    url = new URL(connectionString);
  } catch {
    throw new Error('[db] DATABASE_URL is not a valid URL');
  }
  if (!['postgres:', 'postgresql:'].includes(url.protocol) || !url.hostname || !url.pathname.slice(1)) {
    throw new Error('[db] DATABASE_URL must include a PostgreSQL scheme, host, and database name');
  }
  return connectionString;
}

/**
 * Eva-Solana 目标 schema 名。
 *
 * 本项目的数据放在独立 schema
 * （默认 `ather_solana`），避免污染源项目数据。
 *
 * ⚠️ 为什么不写在连接串里？Neon 的池化连接**不支持** search_path 启动参数：
 *    `unsupported startup parameter in options: search_path`。
 *    所以只能在建连之后用 SQL 显式设置。
 *
 * 覆盖方式：环境变量 `DATABASE_SCHEMA`。
 */
const TARGET_SCHEMA = (process.env.DATABASE_SCHEMA ?? 'ather_solana').replace(/[^a-z0-9_]/gi, '');

function applySearchPath(client: { query: (sql: string) => Promise<unknown> }): Promise<unknown> {
  return client.query(`SET search_path TO ${TARGET_SCHEMA}`);
}

export function createQueryPool(connectionString: string | undefined): QueryPool {
  const validatedUrl = validateDatabaseUrl(connectionString);
  if (isLocalDatabaseUrl(validatedUrl)) {
    const localPool = new PgPool({
      connectionString: validatedUrl,
      ssl: false,
      max: 5,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 15_000,
    }) as unknown as QueryPool;
    // 本地库同样隔离：建池时先把schema 建出来
    void localPool
      .query(`CREATE SCHEMA IF NOT EXISTS ${TARGET_SCHEMA}`)
      .then(() => localPool.query(`SET search_path TO ${TARGET_SCHEMA}`))
      .then(() => localPool.query(`SET search_path TO ${TARGET_SCHEMA}`))
      .catch((err: unknown) => {
        const message = err instanceof Error ? err.message : String(err);
        console.warn(`[db] failed to set search_path (continuing): ${message}`);
      });
    return localPool;
  }

  // [fix 2026-07-26] NeonPool extends EventEmitter. When the underlying
  // HTTP/WebSocket connection to Neon drops, it emits `error` on the pool.
  // With no listener attached, `@neondatabase/serverless` rethrows via
  // `process.nextTick(() => { throw err })` which kills the Node process.
  // Attach a listener so transient connection blips just get logged.
  function createNeonPool(connStr: string): NeonPool {
    const p = new NeonPool({ connectionString: connStr });
    p.on('error', (err: unknown) => {
      const message = err instanceof Error ? err.message : String(err);
      // eslint-disable-next-line no-console
      console.warn(`[db] NeonPool socket error (suppressed): ${message}`);
    });
    return p;
  }

  // 可变引用：重建时整体替换（见 rebuildPool）。
  // ⚠️ 必须是 let + 工厂，不能对单例调用 end() 后继续复用——
  //    NeonPool 一旦 end 就永久不可用，会报
  //    "Cannot use a pool after calling end on the pool" 并锁死整个 API。
  let neonPool: NeonPool = createNeonPool(validatedUrl);
  const pool = neonPool as unknown as QueryPool;

  /**
   * 2026-10-04 补充：Neon 池化连接被耗尽或网络抖动后，
   * 池不会自愈——后续所有请求持续抛 `ErrorEvent { type: 'error' }`，
   * 表现为 dev-login 返回 503「Database is unavailable」，
   * **必须重启进程才能恢复**。这在开发调试时非常致命
   *（一次密集的接口自测就能把连接池打满）。
   *
   * 这里对 connect() 加有限重试 + 退避，让瞬时故障自愈；
   * 仍失败则把池标记为「已污染」，后续每次尝试都先重建池。
   */
  let poolGeneration = 0;

  const isConnectionError = (err: unknown): boolean => {
    if (err === null || err === undefined) return true;
    // Neon serverless 的 socket 错误是 ErrorEvent 而非 Error
    if (!(err instanceof Error)) return true;
    const msg = err.message;
    // 覆盖三类：连接中断 / TLS 被代理掐断 / 池已end
    return /terminated|ECONNRESET|ETIMEDOUT|ENOTFOUND|socket|WebSocket|Connection closed|not open|fetch failed|after calling end|network socket disconnected|TLS connection|EPIPE/i.test(
      msg,
    );
  };

  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

  const rebuildPool = async (): Promise<void> => {
    poolGeneration += 1;
    // eslint-disable-next-line no-console
    console.warn(`[db] rebuilding Neon pool (generation ${poolGeneration})`);
    const old = neonPool;
    // ⚠️ 必须新建实例再关旧的。若对单例调用 end() 后继续复用，
    //    池会永久不可用 → "Cannot use a pool after calling end on the pool"，
    //    且该消息原本不匹配连接类正则 → 被当成 SQL 错误抛出 → API 锁死。
    neonPool = createNeonPool(validatedUrl);
    void old.end?.().catch(() => {});
  };

  // Neon 的池化连接不保证 search_path 持久化，而 database.ts 的 query 代理
  // 在「无 session token」时会走basePool.query() 直连路径（绕过 connect()），
  // 所以两条路径都要设 search_path。
  // ⚠️ 关键：`pool` 与 `neonPool` 是**同一个对象**（见上面的 as unknown as QueryPool）。
  //    下面的 `pool.connect = ...` 会直接覆盖 `neonPool.connect`，
  //    若 rawConnect 再去调 `neonPool.connect()` 就是无限递归
  //    → "RangeError: Maximum call stack size exceeded"。
  //
  // 正确做法：保留一份「未被包装」的原始方法引用。
  //   1) 包装前先从原型链上取原始 connect
  //   2) rebuildPool 换新实例后，rawConnect 从「当前实例的原型」取，
  //      而不是从被覆盖的实例属性取。
  const rawConnect = () => {
    // NeonPool.prototype.connect 未被覆盖（我们只覆盖了实例属性 pool.connect）
    return NeonPool.prototype.connect.call(neonPool);
  };
  pool.connect = async () => {
    const attempts = 3;
    let lastErr: unknown;
    for (let i = 0; i < attempts; i += 1) {
      try {
        const client = await rawConnect();
        try {
          await applySearchPath(
            client as unknown as { query: (sql: string) => Promise<unknown> },
          );
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          console.warn(`[db] failed to set search_path on connect: ${message}`);
        }
        return client;
      } catch (err) {
        lastErr = err;
        // eslint-disable-next-line no-console
        console.warn(`[db] connect attempt ${i + 1}/${attempts} failed: ${String(err)}`);
        if (!isConnectionError(err)) break;
        if (i < attempts - 1) await sleep(400 * (i + 1));
        else await rebuildPool();
      }
    }
    throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
  };

  // ⚠️ 同理：不能用 `neonPool.query(...)`——那已被下面的包装覆盖，会无限递归。
  // 走原型上的原始实现。
  const originalQuery = (t: string, p?: unknown[]) =>
    (NeonPool.prototype.query as (q: string, params?: unknown[]) => Promise<{ rows: unknown[] }>).call(
      neonPool,
      t,
      p,
    );
  pool.query = (async (text: string, params?: unknown[]) => {
    if (/^\s*(set|show)\b/i.test(text)) {
      return originalQuery(text, params);
    }
    // 借用一条 connect() 拿到的连接执行，顺带完成 search_path 注入。
    // 外层再包一层重试：connect() 内部已有重试，但 client.query 本身
    // 仍可能在连接被服务端关闭的瞬间失败。
    const attempts = 3;
    let lastErr: unknown;
    for (let i = 0; i < attempts; i += 1) {
      let client: Awaited<ReturnType<typeof pool.connect>> | undefined;
      try {
        client = await rawConnect();
        await applySearchPath(client as unknown as { query: (sql: string) => Promise<unknown> });
        return await client.query(text, params);
      } catch (err) {
        lastErr = err;
        if (!isConnectionError(err)) throw err;
        console.warn(`[db] query attempt ${i + 1}/${attempts} failed: ${String(err)}`);
        if (i < attempts - 1) await sleep(400 * (i + 1));
        else await rebuildPool();
      } finally {
        try {
          client?.release();
        } catch {
          /* 连接已断，release 失败可忽略 */
        }
      }
    }
    throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
  }) as QueryPool['query'];

  return pool;
}
