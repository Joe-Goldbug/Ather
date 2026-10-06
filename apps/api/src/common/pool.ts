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

export function createQueryPool(connectionString: string | undefined): QueryPool {
  const validatedUrl = validateDatabaseUrl(connectionString);
  if (isLocalDatabaseUrl(validatedUrl)) {
    return new PgPool({
      connectionString: validatedUrl,
      ssl: false,
    }) as unknown as QueryPool;
  }

  // [fix 2026-07-26] NeonPool extends EventEmitter. When the underlying
  // HTTP/WebSocket connection to Neon drops, it emits `error` on the pool.
  // With no listener attached, `@neondatabase/serverless` rethrows via
  // `process.nextTick(() => { throw err })` which kills the Node process.
  // Attach a listener so transient connection blips just get logged; the
  // next query will trigger a reconnect automatically.
  const pool = new NeonPool({ connectionString: validatedUrl });
  pool.on('error', (err: unknown) => {
    const message = err instanceof Error ? err.message : String(err);
    // eslint-disable-next-line no-console
    console.warn(`[db] NeonPool socket error (suppressed): ${message}`);
  });
  return pool as unknown as QueryPool;
}
