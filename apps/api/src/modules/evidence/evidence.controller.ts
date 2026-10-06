// apps/api/src/modules/evidence/evidence.controller.ts
// Evidence endpoints — Phase 7

import { Controller, Get, Post, Body, Param, Query, UseGuards, Req } from '@nestjs/common';
import type { EvidenceDimension } from '@eva/core';
import { AuthGuard } from '../auth/auth.guard.js';
import { EvidenceService } from './evidence.service.js';
import type { AuthUser } from '../auth/auth.service.js';
import { parseLimit } from '../../common/pagination.js';

@Controller('evidence')
@UseGuards(AuthGuard)
export class EvidenceController {
  constructor(private readonly evidence: EvidenceService) {}

  @Post()
  async write(
    @Body() body: { source_type: string; source_id?: string; dimension: string; delta?: number; weight?: number; confidence?: number; quote?: string; explanation: string },
    @Req() req: { user: AuthUser },
  ) {
    const id = await this.evidence.write({
      userId: req.user.id,
      sourceType: body.source_type as 'test' | 'chat' | 'diary' | 'user_correction' | 'capture',
      sourceId: body.source_id,
      dimension: body.dimension as EvidenceDimension,
      delta: body.delta,
      weight: body.weight,
      confidence: body.confidence,
      quote: body.quote,
      explanation: body.explanation,
    });
    return { id };
  }

  @Post('batch')
  async writeBatch(
    @Body() body: Array<{ source_type: string; source_id?: string; dimension: string; delta?: number; weight?: number; confidence?: number; quote?: string; explanation: string }>,
    @Req() req: { user: AuthUser },
  ) {
    const params = body.map(b => ({
      userId: req.user.id,
      sourceType: b.source_type as 'test' | 'chat' | 'diary' | 'user_correction' | 'capture',
      sourceId: b.source_id,
      dimension: b.dimension as EvidenceDimension,
      delta: b.delta,
      weight: b.weight,
      confidence: b.confidence,
      quote: b.quote,
      explanation: b.explanation,
    }));
    const ids = await this.evidence.writeMany(params);
    return { count: ids.length, ids };
  }

  @Get()
  async getAll(@Query('limit') limit: string, @Req() req: { user: AuthUser }) {
    return this.evidence.getByUser(req.user.id, parseLimit(limit, 50));
  }

  @Get('by-dimension')
  async getByDimension(@Req() req: { user: AuthUser }) {
    return this.evidence.getByDimension(req.user.id);
  }

  @Get('by-source/:sourceType/:sourceId')
  async getBySource(
    @Param('sourceType') sourceType: string,
    @Param('sourceId') sourceId: string,
    @Req() req: { user: AuthUser },
  ) {
    return this.evidence.getBySource(sourceType, sourceId, req.user.id);
  }

  @Get('insight-candidates')
  async getInsightCandidates(@Req() req: { user: AuthUser }) {
    return this.evidence.getInsightCandidates(req.user.id);
  }
}
