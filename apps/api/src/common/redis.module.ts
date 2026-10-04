// apps/api/src/common/redis.module.ts
// Global Redis module — provides REDIS_CLIENT and RedisService.
//
// Environment modes:
//   MOCK_REDIS=1          → in-memory mock, zero external connections (recommended for local dev)
//   REDIS_URL=redis://... → real Redis/Upstash connection
//   (neither set)         → defaults to redis://localhost:6379

import { Module, Global } from '@nestjs/common';
import { RedisService } from './redis.service.js';
import { createRedisClient } from './redis-client.js';
import { createMockRedisClient } from './mock-redis.js';

function isRemoteRedis(url: string): boolean {
  return url.includes('upstash.io') || url.includes('redis.cloud') || url.includes('amazonaws.com');
}

@Global()
@Module({
  providers: [
    {
      provide: 'REDIS_CLIENT',
      useFactory: () => {
        const useMock = process.env.MOCK_REDIS === '1';
        const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
        const isProd = process.env.NODE_ENV === 'production';

        // Safety: mock is forbidden in production
        if (useMock && isProd) {
          throw new Error('[RedisModule] MOCK_REDIS=1 is forbidden in production');
        }

        // Use in-memory mock — zero external connections
        if (useMock) {
          return createMockRedisClient();
        }

        // Safety: block remote Redis in local dev unless explicitly allowed
        if (!isProd && isRemoteRedis(redisUrl) && process.env.ALLOW_REMOTE_REDIS !== 'YES_I_REALLY_MEAN_IT') {
          throw new Error(
            '[RedisModule] Refusing to connect to remote Redis in local dev.\n' +
            '  This will consume your Upstash quota rapidly.\n' +
            '  Options:\n' +
            '    1. Set MOCK_REDIS=1 for in-memory mock (recommended)\n' +
            '    2. Use local Docker: REDIS_URL=redis://localhost:6379\n' +
            '    3. Set ALLOW_REMOTE_REDIS=YES_I_REALLY_MEAN_IT to override (use with caution)\n'
          );
        }

        return createRedisClient(redisUrl);
      },
    },
    RedisService,
  ],
  exports: ['REDIS_CLIENT', RedisService],
})
export class RedisModule {}
