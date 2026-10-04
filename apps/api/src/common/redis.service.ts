import { Injectable, Inject } from '@nestjs/common';
import { Redis } from 'ioredis';

@Injectable()
export class RedisService {
  private cacheHits = 0;
  private cacheMisses = 0;

  constructor(@Inject('REDIS_CLIENT') private readonly redisClient: Redis) {}

  async ping(): Promise<string> {
    return this.redisClient.ping();
  }

  async set(key: string, value: string, expirySeconds?: number): Promise<'OK'> {
    if (expirySeconds !== undefined) {
      return this.redisClient.set(key, value, 'EX', expirySeconds);
    }
    return this.redisClient.set(key, value);
  }

  async get(key: string): Promise<string | null> {
    const result = await this.redisClient.get(key);
    if (result !== null) {
      this.cacheHits++;
    } else {
      this.cacheMisses++;
    }
    return result;
  }

  async del(...keys: string[]): Promise<number> {
    return this.redisClient.del(...keys);
  }

  async issueOtp(otpKey: string, rateLimitKey: string, value: string): Promise<boolean> {
    const script = `if redis.call('GET', KEYS[2]) then return 0 end
redis.call('SET', KEYS[1], ARGV[1], 'EX', 300)
redis.call('SET', KEYS[2], '1', 'EX', 60)
return 1`;
    return (await this.redisClient.eval(script, 2, otpKey, rateLimitKey, value)) === 1;
  }

  async consumeIfMatches(key: string, code: string): Promise<string | null> {
    const script = `local value = redis.call('GET', KEYS[1])
if value and string.sub(value, 1, 7) == ARGV[1] .. ':' then
  redis.call('DEL', KEYS[1])
  return value
end
return nil`;
    return (await this.redisClient.eval(script, 1, key, code)) as string | null;
  }

  getCacheStats(): { hits: number; misses: number; ratio: number } {
    const total = this.cacheHits + this.cacheMisses;
    return {
      hits: this.cacheHits,
      misses: this.cacheMisses,
      ratio: total > 0 ? this.cacheHits / total : 0,
    };
  }
}
