// apps/api/src/modules/auth/auth.controller.ts
// Auth endpoints — login, verify, me
// Phase 4 NestJS migration from old auth backend

import { Controller, Post, Get, Body, UseGuards, Req, Res, UnauthorizedException, HttpCode, HttpStatus } from '@nestjs/common';
import { Response, Request } from 'express';
import { AuthGuard } from './auth.guard.js';
import { AuthService } from './auth.service.js';
import type { AuthUser } from './auth.service.js';

function isLocalDevelopmentAutoLogin(req: Request): boolean {
  if (process.env.NODE_ENV !== 'development') return false;
  if (process.env.MOCK_DB === '1') return true;

  const forwardedHost = (req.headers['x-forwarded-host'] ?? '').toString().toLowerCase();
  const host = (req.headers.host ?? '').toString().toLowerCase();
  const origin = (req.headers.origin ?? '').toString().toLowerCase();
  const referer = (req.headers.referer ?? '').toString().toLowerCase();

  const localHostPattern = /^(localhost|127\.0\.0\.1)(:\d+)?$/;
  const localUrlPattern = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?(?:\/|$)/;

  return (
    localHostPattern.test(forwardedHost) ||
    localHostPattern.test(host) ||
    localUrlPattern.test(origin) ||
    localUrlPattern.test(referer)
  );
}

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  /** Get current user info */
  @Get('me')
  @UseGuards(AuthGuard)
  async me(@Req() req: { user: AuthUser }) {
    const baseline_completed = await this.auth.getBaselineCompleted(req.user.id);
    const sandbox_completed_today = await this.auth.getSandboxCompletedToday(req.user.id);
    const entitlement_tier = await this.auth.getEntitlementTier(req.user.id);
    const canUseCorrections = entitlement_tier === 'paid';
    return {
      id: req.user.id,
      email: req.user.email,
      created_at: req.user.created_at,
      name: req.user.name ?? null,
      avatar_url: req.user.avatar_url ?? null,
      baseline_completed,
      sandbox_completed_today,
      entitlement_tier,
      capabilities: {
        canUseCorrections,
        canContinueTesting: true,
      },
    };
  }

  /**
   * DEV ONLY: 一键登录，无需邮箱、无需验证码。
   * 仅在 NODE_ENV !== 'production' 时开放，生产环境直接拒绝。
   * 生成一个固定 dev 账号 + session token + cookie，立即登录。
   *
   * Uses loginOrRegisterWithDevFallback so that local browser testing still
   * works while Postgres is still booting: the fallback retries the real DB
   * INSERT with backoff and surfaces a 503 (not 500) only when Postgres is
   * truly unreachable. Returns a real UUID user_id in every success case so
   * downstream endpoints (e.g. /profile/portrait) never receive a non-UUID
   * id that would trigger `22P02 invalid input syntax for type uuid`.
   */
  @Post('dev-login')
  @HttpCode(HttpStatus.OK)
  async devLogin(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    if (process.env.NODE_ENV === 'production') {
      throw new UnauthorizedException('dev-login is disabled in production');
    }

    const devEmail = 'dev@eva.local';
    // May throw ServiceUnavailableException (→ 503). Bubbles to Nest's default
    // exception filter which returns `{ statusCode: 503, message, error: 'Service Unavailable' }`.
    const result = await this.auth.loginOrRegisterWithDevFallback(devEmail);

    const forwardedProto = (req.headers['x-forwarded-proto'] ?? '').toString();
    const isHttps = req.secure || forwardedProto === 'https';
    res.cookie('eva_session', result.token, {
      httpOnly: true,
      secure: isHttps,
      sameSite: isHttps ? 'none' : 'lax',
      path: '/',
      maxAge: 30 * 24 * 60 * 60 * 1000,
    });

    return {
      user_id: result.user_id,
      email: result.email,
      message: 'Dev auto login successful',
      session_mode: result.mode,
    };
  }

  /** Send OTP code to email */
  @Post('send-code')
  @HttpCode(HttpStatus.OK)
  async sendCode(
    @Body() body: { email: string },
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    if (!body || !body.email) throw new UnauthorizedException('Email is required');
    await this.auth.sendOTP(body.email);

    // DEV ONLY: local browser testing can skip manual OTP entry entirely.
    if (isLocalDevelopmentAutoLogin(req)) {
      const storedOTP = await this.auth.getStoredOTP(body.email);
      const result = await this.auth.verifyOTP(body.email, storedOTP);

      // Set cookie same as verify-code does
      const forwardedProto = (req.headers['x-forwarded-proto'] ?? '').toString();
      const isHttps = req.secure || forwardedProto === 'https';
      res.cookie('eva_session', result.token, {
        httpOnly: true,
        secure: isHttps,
        sameSite: isHttps ? 'none' : 'lax',
        path: '/',
        maxAge: 30 * 24 * 60 * 60 * 1000,
      });

      return { message: 'OTP sent successfully', dev_auto_login: true, user_id: result.user_id };
    }

    return { message: 'OTP sent successfully' };
  }

  /** Verify OTP and login */
  @Post('verify-code')
  @HttpCode(HttpStatus.OK)
  async verifyCode(
    @Body() body: { email: string; code: string },
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response
  ) {
    if (!body || !body.email || !body.code) {
      throw new UnauthorizedException('Email and code are required');
    }

    const ip = req.ip || (req.headers['x-forwarded-for'] as string) || '';
    const ua = req.headers['user-agent'] || '';
    const clientEnv = { ip, browser: ua }; // simplified client info

    const result = await this.auth.verifyOTP(body.email, body.code, clientEnv);

    // Set cookie
    const forwardedProto = (req.headers['x-forwarded-proto'] ?? '').toString();
    const isHttps = req.secure || forwardedProto === 'https';
    res.cookie('eva_session', result.token, {
      httpOnly: true,
      secure: isHttps,
      sameSite: isHttps ? 'none' : 'lax',
      path: '/',
      maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
    });

    return {
      user_id: result.user_id,
      email: result.email,
    };
  }

  /** Logout */
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    // Revoke token in DB so Bearer-based clients are also invalidated
    const token = req.cookies?.['eva_session']
      ?? (req.headers['authorization']?.toString().replace('Bearer ', '') ?? null);
    if (token) {
      await this.auth.revokeToken(token).catch(() => { /* best-effort */ });
    }

    const forwardedProto = (req.headers['x-forwarded-proto'] ?? '').toString();
    const isHttps = req.secure || forwardedProto === 'https';
    res.clearCookie('eva_session', {
      httpOnly: true,
      secure: isHttps,
      sameSite: isHttps ? 'none' : 'lax',
      path: '/',
    });
    return { message: 'Logged out successfully' };
  }
}
