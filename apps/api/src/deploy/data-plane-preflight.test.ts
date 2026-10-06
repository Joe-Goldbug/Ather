import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  assertProductionDataPlaneEnvironment,
  inspectDataPlaneEnvironment,
} from './data-plane-preflight.js';

const baseEnv = {
  NODE_ENV: 'production',
  DATABASE_URL: 'postgresql://api_role:db-secret@db.example.test:5432/eva?sslmode=require',
  REDIS_URL: 'rediss://default:redis-secret@redis.example.test:6380/0',
  OPENAI_API_KEY: 'sk-live-model-key',
  OPENAI_BASE_URL: 'https://models.example.test/v1',
  OPENAI_MODEL: 'production-model',
  DYNAMIC_SCRIPT_API_KEY: 'sk-live-dynamic-key',
  DYNAMIC_SCRIPT_API_BASE: 'https://dynamic.example.test',
  DISABLE_QUEUES: '0',
  MOCK_DB: '0',
  MOCK_REDIS: '0',
};

describe('production data-plane preflight', () => {
  it('compares targets without exposing credentials and keeps role fingerprints separate', () => {
    const api = inspectDataPlaneEnvironment('api', {
      ...baseEnv,
      RESEND_API_KEY: 're_live_mail_key',
      RESEND_FROM_EMAIL: 'EVA <hello@eva.example>',
      FRONTEND_URL: 'https://app.eva.example',
    });
    const worker = inspectDataPlaneEnvironment('worker', {
      ...baseEnv,
      DATABASE_URL: 'postgres://worker_role:other-secret@db.example.test:5432/eva?sslmode=require',
      REDIS_URL: 'rediss://worker:other-redis-secret@redis.example.test:6380/0',
    });

    expect(api.ok).toBe(true);
    expect(worker.ok).toBe(true);
    expect(api.fingerprints.database_target).toBe(worker.fingerprints.database_target);
    expect(api.fingerprints.redis_target).toBe(worker.fingerprints.redis_target);
    expect(api.fingerprints.database_role).not.toBe(worker.fingerprints.database_role);
    expect(JSON.stringify([api, worker])).not.toMatch(/db-secret|redis-secret|mail_key|model-key|dynamic-key|api_role|worker_role/);
  });

  it('fails closed for local targets, disabled queues, mock resources and placeholder secrets', () => {
    const result = inspectDataPlaneEnvironment('worker', {
      ...baseEnv,
      NODE_ENV: 'development',
      DATABASE_URL: 'postgresql://user:secret@127.0.0.1:5432/eva',
      REDIS_URL: 'redis://localhost:6379/0',
      OPENAI_API_KEY: 'test-key',
      DYNAMIC_SCRIPT_API_KEY: 'placeholder',
      DISABLE_QUEUES: '1',
      MOCK_DB: '1',
    });

    expect(result.ok).toBe(false);
    expect(result.checks.filter((check) => !check.ok).map((check) => check.name)).toEqual(expect.arrayContaining([
      'node_env',
      'database_url',
      'redis_url',
      'queues_enabled',
      'mocks_disabled',
      'llm_api_key',
      'dynamic_script_api_key',
    ]));
  });

  it('requires API-only email and browser-origin configuration', () => {
    const api = inspectDataPlaneEnvironment('api', baseEnv);
    const worker = inspectDataPlaneEnvironment('worker', baseEnv);

    expect(api.ok).toBe(false);
    expect(api.checks.filter((check) => !check.ok).map((check) => check.name)).toEqual(expect.arrayContaining([
      'resend_api_key',
      'resend_from_email',
      'frontend_url',
    ]));
    expect(worker.ok).toBe(true);
    expect(worker.checks.map((check) => check.name)).not.toContain('resend_api_key');
  });

  it('returns no target fingerprint when a URL is incomplete or has the wrong scheme', () => {
    const result = inspectDataPlaneEnvironment('worker', {
      ...baseEnv,
      DATABASE_URL: 'postgresql://user:secret@db.example.test',
      REDIS_URL: 'https://redis.example.test/0',
    });

    expect(result.ok).toBe(false);
    expect(result.fingerprints.database_target).toBeNull();
    expect(result.fingerprints.redis_target).toBeNull();
  });

  it('fails production startup with check names only, never secret values', () => {
    const env = {
      ...baseEnv,
      DATABASE_URL: 'postgresql://user:must-never-print@127.0.0.1:5432/eva',
      DYNAMIC_SCRIPT_API_KEY: 'placeholder',
    };

    expect(() => assertProductionDataPlaneEnvironment('worker', env)).toThrow(
      'database_url, dynamic_script_api_key',
    );
    try {
      assertProductionDataPlaneEnvironment('worker', env);
    } catch (error) {
      expect(String(error)).not.toContain('must-never-print');
      expect(String(error)).not.toContain('placeholder');
    }
  });

  it('is enforced by both production process entrypoints', () => {
    const apiMain = readFileSync(resolve(import.meta.dirname, '../main.ts'), 'utf8');
    const workerMain = readFileSync(resolve(import.meta.dirname, '../queue/worker.ts'), 'utf8');

    expect(apiMain).toContain("assertProductionDataPlaneEnvironment('api', process.env)");
    expect(workerMain).toContain("assertProductionDataPlaneEnvironment('worker', process.env)");
  });
});
