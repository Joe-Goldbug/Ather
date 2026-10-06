import { ServiceUnavailableException } from '@nestjs/common';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { HealthController } from './health.controller.js';

afterEach(() => vi.unstubAllEnvs());

describe('HealthController', () => {
  const createController = () => {
    const database = {
      pool: {
        query: vi.fn().mockResolvedValue({ rows: [{ restore_safe: true }] }),
      },
    };
    const redis = {
      ping: vi.fn().mockResolvedValue('PONG'),
    };

    return {
      controller: new HealthController(database as never, redis as never),
      database,
      redis,
    };
  };

  it('reports the platform-provided Railway commit SHA', () => {
    vi.stubEnv('RAILWAY_GIT_COMMIT_SHA', 'railway-sha');
    vi.stubEnv('VERCEL_GIT_COMMIT_SHA', 'vercel-sha');
    expect(createController().controller.health().git_sha).toBe('railway-sha');
  });

  it('fails closed when no platform commit SHA is available', () => {
    vi.stubEnv('RAILWAY_GIT_COMMIT_SHA', '');
    vi.stubEnv('VERCEL_GIT_COMMIT_SHA', '');
    expect(createController().controller.health().git_sha).toBeNull();
  });

  it('keeps liveness independent from database and Redis availability', () => {
    const { controller, database, redis } = createController();

    expect(controller.health().status).toBe('ok');
    expect(database.pool.query).not.toHaveBeenCalled();
    expect(redis.ping).not.toHaveBeenCalled();
  });

  it('reports ready only after both database and Redis respond', async () => {
    vi.stubEnv('RAILWAY_GIT_COMMIT_SHA', 'ready-sha');
    const { controller, database, redis } = createController();

    await expect(controller.ready()).resolves.toMatchObject({
      status: 'ready',
      git_sha: 'ready-sha',
      dependencies: { database: 'ok', redis: 'ok' },
    });
    expect(database.pool.query).toHaveBeenCalledWith(expect.stringContaining('account_deletion_tombstones'));
    expect(redis.ping).toHaveBeenCalledOnce();
  });

  it('returns a safe 503 response when the database is unavailable', async () => {
    const { controller, database } = createController();
    database.pool.query.mockRejectedValue(new Error('postgresql://user:secret@private-host/db'));

    const error = await controller.ready().catch((caught) => caught);

    expect(error).toBeInstanceOf(ServiceUnavailableException);
    expect(error.getResponse()).toMatchObject({
      status: 'unavailable',
      dependencies: { database: 'unavailable', redis: 'ok' },
    });
    expect(JSON.stringify(error.getResponse())).not.toContain('secret');
    expect(JSON.stringify(error.getResponse())).not.toContain('private-host');
  });

  it('returns a safe 503 response when Redis is unavailable', async () => {
    const { controller, redis } = createController();
    redis.ping.mockRejectedValue(new Error('rediss://default:secret@private-host'));

    const error = await controller.ready().catch((caught) => caught);

    expect(error).toBeInstanceOf(ServiceUnavailableException);
    expect(error.getResponse()).toMatchObject({
      status: 'unavailable',
      dependencies: { database: 'ok', redis: 'unavailable' },
    });
    expect(JSON.stringify(error.getResponse())).not.toContain('secret');
    expect(JSON.stringify(error.getResponse())).not.toContain('private-host');
  });

  it('blocks readiness when a restored deleted account is still active', async () => {
    const { controller, database } = createController();
    database.pool.query.mockResolvedValue({ rows: [{ restore_safe: false }] });

    const error = await controller.ready().catch((caught) => caught);

    expect(error).toBeInstanceOf(ServiceUnavailableException);
    expect(error.getResponse()).toMatchObject({
      status: 'unavailable',
      dependencies: { database: 'unsafe_restore', redis: 'ok' },
    });
  });

  it('fails readiness instead of hanging when a dependency does not respond', async () => {
    vi.stubEnv('READINESS_TIMEOUT_MS', '5');
    const { controller, database } = createController();
    database.pool.query.mockReturnValue(new Promise(() => undefined));

    const error = await controller.ready().catch((caught) => caught);

    expect(error).toBeInstanceOf(ServiceUnavailableException);
    expect(error.getResponse()).toMatchObject({
      dependencies: { database: 'unavailable', redis: 'ok' },
    });
  });
});
