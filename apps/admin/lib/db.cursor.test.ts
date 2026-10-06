import { describe, expect, it } from 'vitest';
import { decodeUserCursor, encodeUserCursor } from './db';

describe('user pagination cursor', () => {
  it('round-trips both timestamp and id so equal timestamps have a stable boundary', () => {
    const cursor = encodeUserCursor({
      createdAt: '2026-09-02T00:00:00.000Z',
      id: '11111111-1111-4111-8111-111111111111',
    });

    expect(decodeUserCursor(cursor)).toEqual({
      createdAt: '2026-09-02T00:00:00.000Z',
      id: '11111111-1111-4111-8111-111111111111',
    });
  });

  it('rejects malformed cursor input instead of silently skipping users', () => {
    expect(() => decodeUserCursor('not-a-cursor')).toThrow('Invalid user cursor');
  });
});
