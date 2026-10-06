// packages/runtime-sentinel/src/helpers/redis-otp.ts
// Optional helper — read OTP from Redis using the conventional `otp:<email>` key.
// Requires ioredis as a peer dep; throws a useful message if missing.

import type { SentinelContext } from '../types.js';

export interface ReadOtpOptions {
  email: string;
  /** Key template — `{email}` placeholder. Default: 'otp:{email}' */
  keyPattern?: string;
  /** Max retries before giving up (200ms between). Default: 4 */
  retries?: number;
  /** Override URL; falls back to ctx.redisUrl */
  redisUrl?: string;
}

export async function readOtpFromRedis(
  ctx: SentinelContext,
  opts: ReadOtpOptions,
): Promise<string> {
  let RedisClass: any;
  try {
    RedisClass = (await import('ioredis')).default;
  } catch {
    throw new Error('readOtpFromRedis requires `ioredis` to be installed in the project');
  }
  const url = opts.redisUrl ?? ctx.redisUrl;
  if (!url) throw new Error('redisUrl is not configured (pass --redis or set REDIS_URL)');

  const client = new RedisClass(url, { lazyConnect: false, connectTimeout: 5000 });
  const keyPattern = opts.keyPattern ?? 'otp:{email}';
  const key = keyPattern.replace('{email}', opts.email);
  const retries = opts.retries ?? 4;

  try {
    let otp: string | null = null;
    for (let i = 0; i < retries; i++) {
      otp = await client.get(key);
      if (otp) break;
      await new Promise((r) => setTimeout(r, 250));
    }
    if (!otp) throw new Error(`No OTP found at ${key}`);
    return otp;
  } finally {
    await client.quit().catch(() => {});
  }
}
