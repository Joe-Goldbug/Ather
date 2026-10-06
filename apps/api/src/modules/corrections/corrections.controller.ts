// apps/api/src/modules/corrections/corrections.controller.ts
// Legacy compatibility endpoint. New clients use revision-bound v1 observation
// responses; this endpoint must not present candidate metadata as a conclusion.

import { Controller, Post, Get, GoneException, Query, UseGuards, Req } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard.js';
import { CorrectionsService } from './corrections.service.js';
import type { AuthUser } from '../auth/auth.service.js';
import { parseLimit } from '../../common/pagination.js';

@Controller('corrections')
@UseGuards(AuthGuard)
export class CorrectionsController {
  constructor(private readonly corrections: CorrectionsService) {}

  /**
   * POST /corrections
   * Retired legacy write endpoint. Current clients use theme-result responses
   * or revision-bound observation responses. Historical reads remain available.
   */
  @Post()
  create() {
    throw new GoneException({
      code: 'legacy_corrections_retired',
      message: '旧纠正入口已停止写入。请在主题测试结果或正式观察中提交反馈。',
    });
  }

  /**
   * GET /corrections/recent
   * Get recent corrections for the current user.
   * Candidates remain pending until a versioned validation rule resolves them.
   */
  @Get('recent')
  async getRecent(@Query('limit') limit: string, @Req() req: { user: AuthUser }) {
    return this.corrections.getRecentWithExpiration(req.user.id, parseLimit(limit, 20));
  }

  /**
   * GET /corrections/analytics
   * Shows which dimensions and claim sources receive the most user corrections.
   */
  @Get('analytics')
  async getAnalytics(@Req() req: { user: AuthUser }) {
    return this.corrections.getAnalytics(req.user.id);
  }
}
