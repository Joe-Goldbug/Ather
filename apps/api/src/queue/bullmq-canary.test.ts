import { existsSync } from 'node:fs';
import { RedisMemoryServer } from 'redis-memory-server';
import Redis from 'ioredis';
import { expect, test } from 'vitest';
import { runBullmqCanary } from './bullmq-canary.js';

const redisBinary = [
  process.env.EVA_TEST_REDIS_BINARY,
  '/opt/homebrew/bin/redis-server',
  '/usr/local/bin/redis-server',
  '/usr/bin/redis-server',
].find((candidate): candidate is string => Boolean(candidate && existsSync(candidate)));

test.skipIf(!redisBinary)('round-trips a synthetic BullMQ job and removes the temporary queue', async () => {
  const redisServer = new RedisMemoryServer({
    instance: { port: 0 },
    binary: { systemBinary: redisBinary },
  });
  await redisServer.start();
  const redisUrl = `redis://${await redisServer.getHost()}:${await redisServer.getPort()}`;
  try {
    const result = await runBullmqCanary(redisUrl, 5_000);

    expect(result).toMatchObject({ status: 'passed' });
    expect(result.queue).toMatch(/^eva-release-canary-/);
    expect(result.job_id).toBeTruthy();

    const redis = new Redis(redisUrl);
    try {
      expect(await redis.keys(`bull:${result.queue}:*`)).toEqual([]);
    } finally {
      await redis.quit();
    }
  } finally {
    await redisServer.stop();
  }
});

test('fails within a bounded time when Redis is unreachable', async () => {
  const startedAt = Date.now();

  await expect(runBullmqCanary('redis://127.0.0.1:1', 50)).rejects.toThrow();
  expect(Date.now() - startedAt).toBeLessThan(1_000);
}, 2_000);
