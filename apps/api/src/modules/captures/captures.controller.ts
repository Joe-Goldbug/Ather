// apps/api/src/modules/captures/captures.controller.ts
// Captures endpoints — Stage 1: reality fragment capture
// Three-layer separation: raw text / rule-based cues / candidate evidence.

import { Controller, Get, Patch, Post, Body, Param, Query, UseGuards, Req, HttpException, HttpStatus } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard.js';
import { CapturesService, type CreateCaptureBody } from './captures.service.js';
import type { AuthUser } from '../auth/auth.service.js';
import { parseLimit, parseOffset } from '../../common/pagination.js';

type CreateCaptureBodyCompat = CreateCaptureBody & {
  entry_type?: CreateCaptureBody['entryType'];
  process_mode?: CreateCaptureBody['processMode'];
  raw_text?: string;
  media_url?: string;
  mood_label?: string;
  mood_intensity?: number;
  local_date?: string;
  allow_weekly_review?: boolean;
};

function normalizeCreateCaptureBody(body: CreateCaptureBodyCompat): CreateCaptureBody {
  return {
    entryType: body.entryType ?? body.entry_type!,
    processMode: body.processMode ?? body.process_mode!,
    modality: body.modality,
    rawText: body.rawText ?? body.raw_text,
    mediaUrl: body.mediaUrl ?? body.media_url,
    moodLabel: body.moodLabel ?? body.mood_label,
    moodIntensity: body.moodIntensity ?? body.mood_intensity,
    localDate: body.localDate ?? body.local_date,
    timezone: body.timezone,
    allowWeeklyReview: body.allowWeeklyReview ?? body.allow_weekly_review,
  };
}

@Controller('captures')
@UseGuards(AuthGuard)
export class CapturesController {
  constructor(private readonly captures: CapturesService) {}

  /**
   * POST /captures
   * Create a new capture. Processes based on process_mode:
   * - save_only: just stores raw_text
   * - organize: returns a literal excerpt
   * - analyze: produces pending keyword cues
   */
  @Post()
  async create(
    @Body() body: CreateCaptureBodyCompat,
    @Req() req: { user: AuthUser },
  ) {
    const normalized = normalizeCreateCaptureBody(body);

    // Validate required fields
    if (!normalized.entryType || !normalized.processMode || !normalized.modality) {
      throw new HttpException(
        'entryType, processMode, and modality are required',
        HttpStatus.BAD_REQUEST,
      );
    }

    const result = await this.captures.create(req.user.id, normalized);
    return result;
  }

  @Patch(':id/weekly-review-permission')
  setWeeklyReviewPermission(
    @Param('id') captureId: string,
    @Body() body: { allowed: boolean },
    @Req() req: { user: AuthUser },
  ) {
    return this.captures.setWeeklyReviewPermission(req.user.id, captureId, body?.allowed);
  }

  /**
   * POST /captures/:id/interpretations/:iid/confirm
   * Confirm a cue. Updates status and writes candidate evidence, not a formal portrait claim.
   * P1-8：可选 body.attribution 标记主体归因，默认 'unknown'
   */
  @Post(':id/interpretations/:iid/confirm')
  async confirmInterpretation(
    @Param('id') captureId: string,
    @Param('iid') interpretationId: string,
    @Req() req: { user: AuthUser },
    @Body() body: { attribution?: 'self' | 'about_other' | 'hypothetical' | 'unknown' } = {},
  ) {
    try {
      const result = await this.captures.confirmInterpretation(
        req.user.id,
        captureId,
        interpretationId,
        body.attribution ?? 'unknown',
      );
      return result;
    } catch (err) {
      if (err instanceof Error && err.message.includes('not found')) {
        throw new HttpException(err.message, HttpStatus.NOT_FOUND);
      }
      throw err;
    }
  }

  @Post(':id/interpretations/:iid/refute')
  refuteInterpretation(
    @Param('id') captureId: string,
    @Param('iid') interpretationId: string,
    @Req() req: { user: AuthUser },
  ) {
    return this.captures.refuteInterpretation(req.user.id, captureId, interpretationId);
  }

  /**
   * GET /captures
   * List user's captures with pagination (newest first).
   */
  @Get()
  async list(
    @Query('limit') limit: string,
    @Query('offset') offset: string,
    @Req() req: { user: AuthUser },
  ) {
    const captures = await this.captures.list(req.user.id, parseLimit(limit, 20), parseOffset(offset));
    return { captures };
  }
}
