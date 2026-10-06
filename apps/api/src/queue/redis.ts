// apps/api/src/queue/redis.ts
// Redis connection singleton — Phase 5
// Used by BullMQ for queue operations
//
// When DISABLE_QUEUES=1, getRedis() still returns a connection (for type safety)
// but QueueService never calls it. The lazy connect means no actual TCP connection
// is established unless a command is issued.

import Redis from 'ioredis';
import { createRedisClient } from '../common/redis-client.js';

let _redis: Redis | null = null;

export function getRedis(): Redis {
  if (!_redis) {
    // If queues are disabled AND no REDIS_URL, use a dummy that never connects
    const url = process.env.REDIS_URL ?? 'redis://localhost:6379';
    _redis = createRedisClient(url, {
      lazyConnect: true,
      // Don't retry connections if queues are disabled — fail fast
      ...(process.env.DISABLE_QUEUES === '1' ? { maxRetriesPerRequest: 0, retryStrategy: () => null } : {}),
    });
  }
  return _redis;
}

export async function closeRedis(): Promise<void> {
  if (_redis) {
    await _redis.quit().catch(() => {});
    _redis = null;
  }
}
