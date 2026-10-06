import { describe, expect, it } from '@jest/globals';
import { MockRedis } from './mock-redis.js';
import { RedisService } from './redis.service.js';

describe('MockRedis OTP operations', () => {
  it('issues both keys atomically and consumes a matching code only once', async () => {
    const redis = new RedisService(new MockRedis() as never);
    expect(await redis.issueOtp('otp:a', 'rate_limit:otp:a', '123456:user-id')).toBe(true);
    expect(await redis.issueOtp('otp:a', 'rate_limit:otp:a', '999999:new')).toBe(false);
    expect(await redis.consumeIfMatches('otp:a', '999999')).toBeNull();
    expect(await redis.consumeIfMatches('otp:a', '123456')).toBe('123456:user-id');
    expect(await redis.consumeIfMatches('otp:a', '123456')).toBeNull();
  });

  it('does not consume a legacy bare code', async () => {
    const redis = new RedisService(new MockRedis() as never);
    await redis.set('otp:a', '123456', 300);
    expect(await redis.consumeIfMatches('otp:a', '123456')).toBeNull();
  });

  it('accepts only one of two concurrent consumes', async () => {
    const redis = new RedisService(new MockRedis() as never);
    await redis.issueOtp('otp:a', 'rate_limit:otp:a', '123456:user-id');
    const results = await Promise.all([
      redis.consumeIfMatches('otp:a', '123456'),
      redis.consumeIfMatches('otp:a', '123456'),
    ]);
    expect(results).toEqual(expect.arrayContaining(['123456:user-id', null]));
  });
});
