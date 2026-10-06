// apps/api/src/health.controller.ts
import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { Database } from './common/database.js';
import { RedisService } from './common/redis.service.js';

type DependencyStatus = 'ok' | 'unavailable' | 'unsafe_restore';

const RESTORE_SAFETY_QUERY = `SELECT NOT EXISTS (
  SELECT 1
  FROM account_deletion_tombstones tombstone
  JOIN users ON users.id = tombstone.user_id
) AS restore_safe`;

function readinessTimeoutMs(): number {
  const configured = Number(process.env.READINESS_TIMEOUT_MS);
  return Number.isFinite(configured) && configured > 0 ? configured : 3_000;
}

async function withTimeout<T>(promise: Promise<T>): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timeout = setTimeout(() => reject(new Error('readiness timeout')), readinessTimeoutMs());
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

@Controller()
export class HealthController {
  constructor(
    private readonly database: Database,
    private readonly redis: RedisService,
  ) {}

  private gitSha(): string | null {
    return process.env.RAILWAY_GIT_COMMIT_SHA || process.env.VERCEL_GIT_COMMIT_SHA || null;
  }

  @Get('health')
  health() {
    return {
      status: 'ok',
      ts: Date.now(),
      git_sha: this.gitSha(),
    };
  }

  @Get('ready')
  async ready() {
    const [databaseResult, redisResult] = await Promise.allSettled([
      withTimeout(this.database.pool.query<{ restore_safe: boolean }>(RESTORE_SAFETY_QUERY)),
      withTimeout(this.redis.ping()),
    ]);
    const restoreSafe = databaseResult.status === 'fulfilled'
      ? databaseResult.value.rows[0]?.restore_safe
      : undefined;
    const dependencies: Record<'database' | 'redis', DependencyStatus> = {
      database: restoreSafe === true ? 'ok' : restoreSafe === false ? 'unsafe_restore' : 'unavailable',
      redis: redisResult.status === 'fulfilled' ? 'ok' : 'unavailable',
    };
    const response = {
      status: dependencies.database === 'ok' && dependencies.redis === 'ok' ? 'ready' : 'unavailable',
      ts: Date.now(),
      git_sha: this.gitSha(),
      dependencies,
    };

    if (response.status !== 'ready') {
      throw new ServiceUnavailableException(response);
    }
    return response;
  }
}
