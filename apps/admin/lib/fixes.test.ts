import { describe, it, expect } from 'vitest';
import { METRIC_DEFINITIONS } from './db';
import { authenticateAdmin } from './admin-auth';
import { NextRequest } from 'next/server';

describe('Admin Fixes Regression Verification', () => {
  it('METRIC_DEFINITIONS contains pending_feedback with valid schema', () => {
    const pf = METRIC_DEFINITIONS.find((m) => m.key === 'pending_feedback');
    expect(pf).toBeDefined();
    expect(pf?.label).toBe('待处理反馈');
    expect(pf?.sourceTables).toContain('product_feedback');
    expect(pf?.status).toBe('ready');
  });

  it('authenticateAdmin falls back to admin@eva.local when ADMIN_ACTOR_EMAIL is omitted in dev mode', async () => {
    const prevActor = process.env.ADMIN_ACTOR_EMAIL;
    const prevSecret = process.env.ADMIN_SECRET;
    const prevMode = process.env.ADMIN_DATA_MODE;
    const prevNodeEnv = process.env.NODE_ENV;

    try {
      delete process.env.ADMIN_ACTOR_EMAIL;
      process.env.ADMIN_SECRET = 'unit-test-secret';
      process.env.ADMIN_DATA_MODE = 'mock'; // mock mode doesn't touch live postgres
      (process.env as any).NODE_ENV = 'development';

      const req = new NextRequest('http://localhost:3102/api/snapshot', {
        headers: { 'x-admin-key': 'unit-test-secret' },
      });

      const principal = await authenticateAdmin(req);
      expect(principal).toBeDefined();
      expect(principal?.email).toBe('admin@eva.local');
      expect(principal?.role).toBe('admin');
    } finally {
      process.env.ADMIN_ACTOR_EMAIL = prevActor;
      process.env.ADMIN_SECRET = prevSecret;
      process.env.ADMIN_DATA_MODE = prevMode;
      (process.env as any).NODE_ENV = prevNodeEnv;
    }
  });

  it('authenticateAdmin strictly rejects when credentials mismatch', async () => {
    process.env.ADMIN_SECRET = 'unit-test-secret';
    const req = new NextRequest('http://localhost:3102/api/snapshot', {
      headers: { 'x-admin-key': 'wrong-secret' },
    });

    const principal = await authenticateAdmin(req);
    expect(principal).toBeNull();
  });
});
