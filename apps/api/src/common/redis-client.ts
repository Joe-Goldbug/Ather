import Redis, { type RedisOptions } from 'ioredis';

function shouldUseTls(redisUrl: string): boolean {
  try {
    const parsed = new URL(redisUrl);
    return parsed.protocol === 'rediss:' || parsed.hostname.includes('upstash.io');
  } catch {
    return redisUrl.includes('upstash.io');
  }
}

function normalizeRedisUrl(redisUrl: string): string {
  try {
    const parsed = new URL(redisUrl);
    if (parsed.hostname.includes('upstash.io') && parsed.protocol === 'redis:') {
      parsed.protocol = 'rediss:';
      return parsed.toString();
    }
    return redisUrl;
  } catch {
    return redisUrl;
  }
}

export function createRedisClient(
  redisUrl: string,
  options: RedisOptions = {},
): Redis {
  const normalizedUrl = normalizeRedisUrl(redisUrl);
  const normalizedOptions: RedisOptions = {
    maxRetriesPerRequest: null,
    lazyConnect: true,
    ...options,
  };

  if (shouldUseTls(normalizedUrl)) {
    normalizedOptions.tls = {
      servername: new URL(normalizedUrl).hostname,
      ...(normalizedOptions.tls ?? {}),
    };
  }

  const client = new Redis(normalizedUrl, normalizedOptions);
  client.on('error', (err) => {
    console.error('[Redis] connection error:', err.message);
  });
  return client;
}
