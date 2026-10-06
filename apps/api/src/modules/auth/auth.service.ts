// apps/api/src/modules/auth/auth.service.ts
// Auth service — validates tokens and retrieves user context.
// Uses @eva/core for domain logic. DB access via Database module.

import { Injectable, UnauthorizedException, HttpException, HttpStatus, Inject, ServiceUnavailableException } from '@nestjs/common';
import type { Memory } from '@eva/core';
import { CURRENT_MICRO_SCENARIO_SET, CURRENT_SCENARIO_SET, createMemory } from '@eva/core';
import { Database } from '../../common/database.js';
import type { PoolClient } from '../../common/pool.js';
import { RedisService } from '../../common/redis.service.js';
import { Resend } from 'resend';
import * as crypto from 'crypto';
import VerificationEmail from './templates/verification-email.js';
import { render } from '@react-email/render';
export interface AuthUser {
  id: string;
  email: string;
  created_at: Date;
}

export type EntitlementTier = 'free' | 'paid';

@Injectable()
export class AuthService {
  constructor(
    private readonly db: Database,
    private readonly redis: RedisService,
    @Inject('RESEND_CLIENT') private readonly resend: Resend,
  ) {}

  /** Generate a 6-digit OTP */
  generateOTP(): string {
    return crypto.randomInt(100000, 1000000).toString();
  }

  /** Rate limit check and send OTP via Resend */
  async sendOTP(email: string): Promise<void> {
    const rateLimitKey = `rate_limit:otp:${email}`;
    const otpKey = `otp:${email}`;

    const otp = this.generateOTP();
    const client = await this.db.pool.connect();
    let issued = false;
    try {
      await client.query('BEGIN');
      await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1::text, 0))', [email]);
      const user = await client.query<{ id: string }>(
        'SELECT id FROM users WHERE email = $1 AND deletion_requested_at IS NULL',
        [email],
      );
      issued = await this.redis.issueOtp(otpKey, rateLimitKey, `${otp}:${user.rows[0]?.id ?? 'new'}`);
      if (!issued) {
        throw new HttpException('Please wait before requesting a new OTP', HttpStatus.TOO_MANY_REQUESTS);
      }
      await client.query('COMMIT');
    } catch (error) {
      try {
        if (issued) await this.redis.del(otpKey, rateLimitKey);
      } finally {
        await client.query('ROLLBACK');
      }
      throw error;
    } finally {
      client.release();
    }

    if (process.env.RESEND_API_KEY === 're_123456789' || !process.env.RESEND_API_KEY) {
      console.log(`[MOCK EMAIL] To: ${email}, OTP: ${otp}`);
      return;
    }

    const html = await render(VerificationEmail({ validationCode: otp }));

    const { error } = await this.resend.emails.send({
      from: 'EVA <noreply@eva.live>',
      to: email,
      subject: 'EVA 登录验证码',
      html,
    });

    if (error) {
      console.error('[AuthService] sendOTP Resend Error:', error);
      throw new HttpException('Failed to send OTP email', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  /** Verify OTP and log in / register */
  async verifyOTP(
    email: string, 
    code: string,
    clientEnv?: { ip?: string; device?: string; browser?: string; os?: string; }
  ): Promise<{ user_id: string; email: string; token: string }> {
    const otpKey = `otp:${email}`;
    const client = await this.db.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1::text, 0))', [email]);
      const stored = await this.redis.consumeIfMatches(otpKey, code);
      if (!stored || !/^\d{6}:(new|[0-9a-f-]{36})$/i.test(stored)) {
        throw new UnauthorizedException('Invalid or expired OTP');
      }
      const issuedTo = stored.slice(7);
      const userRows = issuedTo === 'new'
        ? await client.query<AuthUser>(`INSERT INTO users (email) VALUES ($1)
            ON CONFLICT (email) DO NOTHING RETURNING id, email, created_at`, [email])
        : await client.query<AuthUser>(`SELECT id, email, created_at FROM users
            WHERE id = $1 AND email = $2 AND deletion_requested_at IS NULL FOR UPDATE`, [issuedTo, email]);
      const user = userRows.rows[0];
      if (!user) throw new UnauthorizedException('Invalid or expired OTP');

      const token = crypto.randomUUID().replace(/-/g, '');
      const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
      const tokenRows = await client.query<{ id: string }>(
        'INSERT INTO session_tokens (user_id, token, expires_at) VALUES ($1, $2, $3) RETURNING id',
        [user.id, token, expiresAt],
      );
      await client.query(
        `INSERT INTO login_events (user_id, session_token_id, event_type, ip_address, device_type, browser, operating_system)
         VALUES ($1, $2, 'login_success', $3, $4, $5, $6)`,
        [user.id, tokenRows.rows[0].id, clientEnv?.ip || null, clientEnv?.device || null, clientEnv?.browser || null, clientEnv?.os || null],
      );
      await client.query('COMMIT');
      return { user_id: user.id, email: user.email, token };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /** Dev helper: read the active OTP from Redis. */
  async getStoredOTP(email: string): Promise<string> {
    const storedOTP = await this.redis.get(`otp:${email}`);
    if (!storedOTP) {
      throw new UnauthorizedException('Invalid or expired OTP');
    }
    if (!/^\d{6}:(new|[0-9a-f-]{36})$/i.test(storedOTP)) {
      throw new UnauthorizedException('Invalid or expired OTP');
    }
    return storedOTP.slice(0, 6);
  }

  /** Revoke token */
  async revokeToken(token: string): Promise<void> {
    await this.db.pool.query(
      'UPDATE session_tokens SET revoked = true WHERE token = $1',
      [token],
    );
  }

  /** Validate session token and return user */
  async validateToken(
    token: string,
    options: { includeDeleting?: boolean } = {},
  ): Promise<AuthUser | null> {
    const deletionPredicate = options.includeDeleting ? '' : 'AND u.deletion_requested_at IS NULL';
    const result = await this.db.pool.query<AuthUser>(
      `SELECT u.id, u.email, u.created_at
       FROM users u
       JOIN session_tokens st ON st.user_id = u.id
       WHERE st.token = $1 AND st.expires_at > NOW() AND (st.revoked IS NULL OR st.revoked = false)
         ${deletionPredicate}
       LIMIT 1`,
      [token],
    );
    return result.rows[0] ?? null;
  }

  /** Get user by email */
  async getUserByEmail(email: string): Promise<AuthUser | null> {
    const result = await this.db.pool.query<AuthUser>(
      'SELECT id, email, created_at FROM users WHERE email = $1 AND deletion_requested_at IS NULL LIMIT 1',
      [email],
    );
    return result.rows[0] ?? null;
  }

  /** Whether the user has completed the fixed Level 1 baseline. */
  async getBaselineCompleted(userId: string): Promise<boolean> {
    const result = await this.db.pool.query<{ exists: boolean }>(
      `SELECT EXISTS (
         SELECT 1
         FROM assessment_runs
         WHERE user_id = $1
           AND scenario_set = $2
       ) AS exists`,
      [userId, CURRENT_SCENARIO_SET],
    );
    return result.rows[0]?.exists === true;
  }

  /** Whether the user has already completed today's calibration micro-sandbox. */
  async getSandboxCompletedToday(userId: string): Promise<boolean> {
    const result = await this.db.pool.query<{ exists: boolean }>(
      `SELECT EXISTS (
         SELECT 1
         FROM assessment_runs
         WHERE user_id = $1
           AND scenario_set = $2
           AND date(created_at) = current_date
       ) AS exists`,
      [userId, CURRENT_MICRO_SCENARIO_SET],
    );
    return result.rows[0]?.exists === true;
  }

  async getEntitlementTier(userId: string): Promise<EntitlementTier> {
    try {
      const result = await this.db.pool.query<{ entitlement_tier: string | null }>(
        `SELECT entitlement_tier FROM users WHERE id = $1 LIMIT 1`,
        [userId],
      );
      return result.rows[0]?.entitlement_tier === 'paid' ? 'paid' : 'free';
    } catch (err) {
      if ((err as { code?: string }).code === '42703') return 'free';
      throw err;
    }
  }

  async canUseCorrections(userId: string): Promise<boolean> {
    return (await this.getEntitlementTier(userId)) === 'paid';
  }

  /** Create or retrieve user, generate session token and log login_event */
  async loginOrRegister(
    email: string,
    clientEnv?: { ip?: string; device?: string; browser?: string; os?: string; }
  ): Promise<{ user_id: string; email: string; token: string }> {
    try {
      const userRows = await this.db.pool.query<AuthUser>(
        `INSERT INTO users (email)
         VALUES ($1)
         ON CONFLICT (email) DO UPDATE SET email = EXCLUDED.email
         RETURNING id, email, created_at`,
        [email],
      );

      const user = userRows.rows[0];

      const token = crypto.randomUUID().replace(/-/g, '');
      const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days

      const tokenRows = await this.db.pool.query(
        `INSERT INTO session_tokens (user_id, token, expires_at) VALUES ($1, $2, $3) RETURNING id`,
        [user.id, token, expiresAt],
      );
      
      const tokenId = tokenRows.rows[0].id;

      // Log login event
      await this.db.pool.query(
        `INSERT INTO login_events (user_id, session_token_id, event_type, ip_address, device_type, browser, operating_system)
         VALUES ($1, $2, 'login_success', $3, $4, $5, $6)`,
        [user.id, tokenId, clientEnv?.ip || null, clientEnv?.device || null, clientEnv?.browser || null, clientEnv?.os || null]
      );

      return { user_id: user.id, email: user.email, token };
    } catch (err) {
      console.error('[AuthService] loginOrRegister Error:', err);
      throw err;
    }
  }

  /**
   * [DEV-ONLY] Bridge wrapper used by the /auth/dev-login controller.
   *
   * Tries the real DB-backed loginOrRegister first. If the DB is unreachable
   * (typical during local dev when Postgres is still booting), retries with
   * a short backoff so the dev-login button just works once PG is ready.
   *
   * Unlike the previous "dev-mock in-memory fallback" we never fabricate a
   * non-UUID id (e.g. "dev-mock-…") — that caused every downstream endpoint
   * (/profile/portrait, /evidence, etc.) to crash with `22P02 invalid input
   * syntax for type uuid`, surfacing as 500 to the browser.
   *
   * If Postgres still isn't reachable after the retry window, we surface a
   * ServiceUnavailableException so the controller can answer 503 (not 500).
   *
   * Production calls keep the original throw-and-error behavior.
   *
   * Important: this is ONLY for the dev-login surface. /auth/send-code and
   * /auth/verify-code still require a real DB to keep the auth path honest.
   */
  async loginOrRegisterWithDevFallback(
    email: string,
  ): Promise<{ user_id: string; email: string; token: string; mode: 'db' }> {
    const maxAttempts = process.env.NODE_ENV === 'production' ? 1 : 4;
    let lastErr: unknown = null;
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        const result = await this.loginOrRegister(email);
        return { ...result, mode: 'db' };
      } catch (err) {
        lastErr = err;
        const code = (err as { code?: string })?.code;
        const isTransient =
          code === 'ECONNREFUSED' ||
          code === 'ETIMEDOUT' ||
          code === 'ENOTFOUND' ||
          code === 'EAI_AGAIN' ||
          code === '08006' || // pg: connection_failure
          code === '08001' || // pg: sqlclient_unable_to_establish_sqlconnection
          code === '57P01' || // pg: admin_shutdown
          code === '57P02' || // pg: crash_shutdown
          code === '57P03';   // pg: cannot_connect_now
        if (!isTransient || attempt === maxAttempts) break;
        await new Promise((r) => setTimeout(r, 250 * attempt));
      }
    }

    if (process.env.NODE_ENV === 'production') {
      throw lastErr;
    }
    throw new ServiceUnavailableException(
      'Database is unavailable. Run ./scripts/start-dev.sh to start PostgreSQL, then retry dev-login.',
    );
  }

  /** Get user's Memory from DB (loads from dynamic_profiles JSONB) */
  async getUserMemory(userId: string): Promise<Memory | null> {
    try {
      const base = createMemory(userId);
      const userRows = await this.db.pool.query<{ memory_state: unknown }>(
        'SELECT memory_state FROM users WHERE id = $1 LIMIT 1',
        [userId],
      );

      const stored = userRows.rows[0]?.memory_state;
      const storedMemory = stored && typeof stored === 'object'
        ? (stored as Partial<Memory>)
        : null;
      const merged: Memory = storedMemory
        ? {
          ...base,
          ...storedMemory,
          meta: {
            ...base.meta,
            ...(storedMemory.meta ?? {}),
          },
        }
        : base;

      return merged;
    } catch {
      return null;
    }
  }

  /** Save user's updated Memory to DB */
  async saveUserMemory(userId: string, memory: Memory, client?: PoolClient): Promise<void> {
    await (client ?? this.db.pool).query(
      `UPDATE users SET memory_state = $2::jsonb, updated_at = NOW() WHERE id = $1`,
      [userId, JSON.stringify(memory)],
    );
  }
}
