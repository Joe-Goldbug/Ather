import { describe, expect, it } from 'vitest';
import { createQueryPool, validateDatabaseUrl } from './pool.js';

describe('DATABASE_URL startup validation', () => {
  it('accepts local and remote PostgreSQL URLs with a database name', () => {
    expect(validateDatabaseUrl('postgresql://ethan@127.0.0.1:55439/postgres'))
      .toBe('postgresql://ethan@127.0.0.1:55439/postgres');
    expect(validateDatabaseUrl('postgresql://user:secret@db.example.test/neondb?sslmode=require'))
      .toContain('/neondb');
  });

  it('fails early on missing or incomplete URLs without exposing credentials', () => {
    expect(() => validateDatabaseUrl(undefined)).toThrow('DATABASE_URL is missing');
    expect(() => validateDatabaseUrl('not a url')).toThrow('DATABASE_URL is not a valid URL');
    expect(() => createQueryPool('postgresql://user:secret@ep-still-grass'))
      .toThrow('DATABASE_URL must include a PostgreSQL scheme, host, and database name');
    expect(() => validateDatabaseUrl('https://user:secret@db.example.test/neondb'))
      .toThrow('DATABASE_URL must include a PostgreSQL scheme, host, and database name');
    try {
      validateDatabaseUrl('postgresql://user:secret@ep-still-grass');
    } catch (error) {
      expect(String(error)).not.toContain('secret');
    }
  });
});
