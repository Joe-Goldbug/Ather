// apps/api/src/modules/runtime-sentinel/runtime-sentinel.service.ts
//
// Phase A — backend probe surface for the Runtime Sentinel CLI.
// Snapshot is read-only but token-gated because it exposes internal dependency
// health and domain counters. No PII is returned.

import { Injectable, Inject } from '@nestjs/common';
import type Redis from 'ioredis';
import { Database } from '../../common/database.js';
import { resolveLlmRuntimeConfig } from '../../common/llm-config.js';

export interface SentinelDeps {
  db: 'ok' | 'down';
  redis: 'ok' | 'down';
  llm_configured: boolean;
  email_configured: boolean;
}

export interface SentinelDomain {
  /** assessment_runs created in the last 24h (test users excluded) */
  assessment_runs_24h: number;
  /** evidence_events written in the last 24h */
  evidence_events_24h: number;
  /** distinct dimensions covered by evidence in the last 24h (target ≥ 8) */
  evidence_dimensions_24h: number;
  /** corrections submitted in the last 24h */
  corrections_24h: number;
  /** chat conversations updated in the last 24h */
  chat_active_24h: number;
}

export interface SentinelTestData {
  /** test accounts present (email LIKE '%@test.eva.live') */
  test_users_total: number;
  /** test users older than 7 days that should be cleaned up */
  test_users_stale: number;
}

export interface SentinelSnapshot {
  generated_at: string;
  service: string;
  version: string;
  uptime_s: number;
  git_sha?: string;
  deps: SentinelDeps;
  domain: SentinelDomain;
  test_data: SentinelTestData;
}

const STARTUP_TS = Date.now();

@Injectable()
export class RuntimeSentinelService {
  constructor(
    private readonly db: Database,
    @Inject('REDIS_CLIENT') private readonly redis: Redis,
  ) {}

  async snapshot(): Promise<SentinelSnapshot> {
    const [deps, domain, test_data] = await Promise.all([
      this.checkDeps(),
      this.computeDomain().catch((err) => {
        console.error('[sentinel] domain query failed:', err);
        return {
          assessment_runs_24h: -1,
          evidence_events_24h: -1,
          evidence_dimensions_24h: -1,
          corrections_24h: -1,
          chat_active_24h: -1,
        };
      }),
      this.checkTestData().catch((err) => {
        console.error('[sentinel] test_data query failed:', err);
        return { test_users_total: -1, test_users_stale: -1 };
      }),
    ]);

    return {
      generated_at: new Date().toISOString(),
      service: 'eva-api',
      version: process.env.npm_package_version ?? 'unknown',
      uptime_s: Math.round((Date.now() - STARTUP_TS) / 1000),
      git_sha: process.env.GIT_SHA,
      deps,
      domain,
      test_data,
    };
  }

  /** Delete test users older than `olderThanDays` (default 7). Returns counts. */
  async cleanupTestData(olderThanDays = 7): Promise<{ deleted_users: number }> {
    if (process.env.NODE_ENV === 'production' && process.env.SENTINEL_ALLOW_PROD_CLEANUP !== '1') {
      throw new Error(
        'cleanupTestData is disabled in production. Set SENTINEL_ALLOW_PROD_CLEANUP=1 to override.',
      );
    }
    // FK ON DELETE CASCADE handles related rows (assessment_runs / evidence_events / etc.)
    const r = await this.db.pool.query<{ count: string }>(
      `WITH del AS (
         DELETE FROM users
         WHERE email LIKE '%@test.eva.live'
           AND created_at < NOW() - ($1::int || ' days')::interval
         RETURNING id
       )
       SELECT COUNT(*)::text AS count FROM del`,
      [olderThanDays],
    );
    return { deleted_users: Number(r.rows[0]?.count ?? 0) };
  }

  // ── private ────────────────────────────────────────────────────────────────

  private async checkDeps(): Promise<SentinelDeps> {
    const dbOk = await this.pingDb();
    const redisOk = await this.pingRedis();
    return {
      db: dbOk ? 'ok' : 'down',
      redis: redisOk ? 'ok' : 'down',
      llm_configured: Boolean(resolveLlmRuntimeConfig().apiKey),
      email_configured: Boolean(process.env.RESEND_API_KEY) || process.env.EVA_LOCAL_MOCK_LLM === '1',
    };
  }

  private async pingDb(): Promise<boolean> {
    try {
      await this.db.pool.query('SELECT 1', []);
      return true;
    } catch {
      return false;
    }
  }

  private async pingRedis(): Promise<boolean> {
    try {
      const reply = await this.redis.ping();
      return reply === 'PONG';
    } catch {
      return false;
    }
  }

  private async computeDomain(): Promise<SentinelDomain> {
    // Single round-trip — Postgres scalar subqueries
    const sql = `
      SELECT
        (SELECT COUNT(*) FROM assessment_runs r
           JOIN users u ON u.id = r.user_id
           WHERE r.completed_at > NOW() - INTERVAL '24 hours'
             AND u.email NOT LIKE '%@test.eva.live')::text AS assessment_runs_24h,
        (SELECT COUNT(*) FROM evidence_events e
           JOIN users u ON u.id = e.user_id
           WHERE e.created_at > NOW() - INTERVAL '24 hours'
             AND u.email NOT LIKE '%@test.eva.live')::text AS evidence_events_24h,
        (SELECT COUNT(DISTINCT e.dimension) FROM evidence_events e
           JOIN users u ON u.id = e.user_id
           WHERE e.created_at > NOW() - INTERVAL '24 hours'
             AND u.email NOT LIKE '%@test.eva.live')::text AS evidence_dimensions_24h,
        (SELECT COUNT(*) FROM user_corrections c
           JOIN users u ON u.id = c.user_id
           WHERE c.created_at > NOW() - INTERVAL '24 hours'
             AND u.email NOT LIKE '%@test.eva.live')::text AS corrections_24h,
        (SELECT COUNT(*) FROM conversations c
           JOIN users u ON u.id = c.user_id
           WHERE c.updated_at > NOW() - INTERVAL '24 hours'
             AND u.email NOT LIKE '%@test.eva.live')::text AS chat_active_24h
    `;
    const r = await this.db.pool.query<{
      assessment_runs_24h: string;
      evidence_events_24h: string;
      evidence_dimensions_24h: string;
      corrections_24h: string;
      chat_active_24h: string;
    }>(sql);
    const row = r.rows[0];
    return {
      assessment_runs_24h: Number(row?.assessment_runs_24h ?? 0),
      evidence_events_24h: Number(row?.evidence_events_24h ?? 0),
      evidence_dimensions_24h: Number(row?.evidence_dimensions_24h ?? 0),
      corrections_24h: Number(row?.corrections_24h ?? 0),
      chat_active_24h: Number(row?.chat_active_24h ?? 0),
    };
  }

  private async checkTestData(): Promise<SentinelTestData> {
    const r = await this.db.pool.query<{ total: string; stale: string }>(
      `SELECT
         COUNT(*)::text AS total,
         COUNT(*) FILTER (WHERE created_at < NOW() - INTERVAL '7 days')::text AS stale
       FROM users
       WHERE email LIKE '%@test.eva.live'`,
    );
    return {
      test_users_total: Number(r.rows[0]?.total ?? 0),
      test_users_stale: Number(r.rows[0]?.stale ?? 0),
    };
  }
}
