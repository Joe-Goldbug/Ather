// apps/api/src/common/mock-redis.ts
// In-memory Redis mock — zero dependencies, zero external connections.
// Used for local development to avoid touching production Upstash quota.
// Implements the subset of ioredis API that RedisService + BullMQ needs.

import { EventEmitter } from 'events';

interface StoredEntry {
  value: string;
  expiresAt?: number; // Unix ms
}

/**
 * Lightweight in-memory Redis implementation.
 * Supports: get, set (with EX), del, ping, quit, disconnect, status.
 * Does NOT support pub/sub, streams, or sorted sets — BullMQ will not work
 * with this mock. That's intentional: local dev should use DISABLE_QUEUES=1.
 */
export class MockRedis extends EventEmitter {
  private store = new Map<string, StoredEntry>();
  status = 'ready';

  constructor(_url?: string, _opts?: unknown) {
    super();
    console.warn('[MockRedis] Using in-memory Redis mock — no external connections');
    // Emit 'ready' async so listeners can attach first
    queueMicrotask(() => this.emit('ready'));
  }

  private isExpired(entry: StoredEntry): boolean {
    return entry.expiresAt !== undefined && Date.now() > entry.expiresAt;
  }

  async ping(): Promise<string> {
    return 'PONG';
  }

  async get(key: string): Promise<string | null> {
    const entry = this.store.get(key);
    if (!entry) return null;
    if (this.isExpired(entry)) {
      this.store.delete(key);
      return null;
    }
    return entry.value;
  }

  async set(key: string, value: string, ...args: unknown[]): Promise<'OK'> {
    let expiresAt: number | undefined;

    // Parse: set(key, value, 'EX', seconds)
    if (args[0] === 'EX' && typeof args[1] === 'number') {
      expiresAt = Date.now() + args[1] * 1000;
    }

    this.store.set(key, { value, expiresAt });
    return 'OK';
  }

  async del(...keys: string[]): Promise<number> {
    let removed = 0;
    for (const key of keys) removed += this.store.delete(key) ? 1 : 0;
    return removed;
  }

  async eval(_script: string, keyCount: number, ...args: string[]): Promise<string | number | null> {
    if (keyCount === 2) {
      const [otpKey, rateLimitKey, value] = args;
      const rate = this.store.get(rateLimitKey);
      if (rate && !this.isExpired(rate)) return 0;
      this.store.set(otpKey, { value, expiresAt: Date.now() + 300_000 });
      this.store.set(rateLimitKey, { value: '1', expiresAt: Date.now() + 60_000 });
      return 1;
    }
    if (keyCount !== 1) throw new Error('Unsupported MockRedis script');
    const [key, code] = args;
    const entry = this.store.get(key);
    if (!entry || this.isExpired(entry) || !entry.value.startsWith(`${code}:`)) return null;
    this.store.delete(key);
    return entry.value;
  }

  async quit(): Promise<'OK'> {
    this.store.clear();
    this.status = 'end';
    return 'OK';
  }

  disconnect(): void {
    this.store.clear();
    this.status = 'end';
  }

  // BullMQ calls duplicate() to create sub-connections; return another mock
  duplicate(): MockRedis {
    return new MockRedis();
  }

  // ioredis .on('error') compatibility — already extended EventEmitter
}

export function createMockRedisClient(): MockRedis {
  return new MockRedis();
}
