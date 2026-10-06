// apps/api/src/modules/weekly-reviews/weekly-reviews.controller.ts
// Weekly review endpoints — Phase 7
// GET /weekly-review/current → current week's review (from DB or queued)
// POST /weekly-review/trigger → enqueue async generation
// GET /weekly-review/history → past reviews

import { Body, Controller, Get, Param, Post, Query, UseGuards, Req } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard.js';
import {
  WeeklyExperimentsService,
  type WeeklyExperimentCheckInCommand,
} from './weekly-experiments.service.js';
import { WeeklyReviewsService } from './weekly-reviews.service.js';
import type { AuthUser } from '../auth/auth.service.js';
import { parseLimit } from '../../common/pagination.js';

@Controller()
@UseGuards(AuthGuard)
export class WeeklyReviewsController {
  constructor(
    private readonly weeklyReviews: WeeklyReviewsService,
    private readonly weeklyExperiments: WeeklyExperimentsService,
  ) {}

  /** Get current week's review. Returns null if none generated yet. */
  @Get('weekly-review/current')
  async getCurrent(@Req() req: { user: AuthUser }) {
    const review = await this.weeklyReviews.getCurrentWeekReview(req.user.id);
    return review ?? { summary: null, status: 'not_generated' };
  }

  /** Enqueue async weekly review generation. */
  @Post('weekly-review/trigger')
  async trigger(@Req() req: { user: AuthUser }) {
    return this.weeklyReviews.triggerWeeklyReview(req.user.id);
  }

  /** Past weekly review summaries. */
  @Get('weekly-review/history')
  async history(@Query('limit') limit: string, @Req() req: { user: AuthUser }) {
    return this.weeklyReviews.getWeeklyReviewHistory(
      req.user.id,
      parseLimit(limit, 8),
    );
  }

  @Post('weekly-review/:reviewId/experiments')
  createExperiment(@Req() req: { user: AuthUser }, @Param('reviewId') reviewId: string) {
    return this.weeklyExperiments.create(req.user.id, reviewId);
  }

  @Post('weekly-experiments/:experimentId/checkins')
  checkIn(
    @Req() req: { user: AuthUser },
    @Param('experimentId') experimentId: string,
    @Body() body: WeeklyExperimentCheckInCommand,
  ) {
    return this.weeklyExperiments.checkIn(req.user.id, experimentId, body ?? ({} as WeeklyExperimentCheckInCommand));
  }
}
