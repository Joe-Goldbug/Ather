// apps/api/src/modules/runtime-sentinel/runtime-sentinel.controller.ts
// Phase A — token-gated sentinel endpoints.
// Snapshot is read-only but still protected because it exposes internal health
// and domain counters. Cleanup remains separately token-gated.

import {
  Controller, Get, Post, Headers, ForbiddenException, Query,
} from '@nestjs/common';
import { RuntimeSentinelService } from './runtime-sentinel.service.js';

@Controller('sentinel')
export class RuntimeSentinelController {
  constructor(private readonly service: RuntimeSentinelService) {}

  private assertReadToken(token: string | undefined) {
    const expected = process.env.SENTINEL_TOKEN ?? process.env.SENTINEL_CLEANUP_TOKEN;
    if (!expected) {
      if (process.env.NODE_ENV === 'production') {
        throw new ForbiddenException('SENTINEL_TOKEN not configured on server');
      }
      return;
    }
    if (!token || token !== expected) {
      throw new ForbiddenException('invalid sentinel token');
    }
  }

  @Get('snapshot')
  async snapshot(@Headers('x-sentinel-token') token: string | undefined) {
    this.assertReadToken(token);
    return this.service.snapshot();
  }

  @Post('cleanup')
  async cleanup(
    @Headers('x-sentinel-token') token: string | undefined,
    @Query('older_than_days') olderRaw: string | undefined,
  ) {
    const expected = process.env.SENTINEL_CLEANUP_TOKEN;
    if (!expected) {
      throw new ForbiddenException('SENTINEL_CLEANUP_TOKEN not configured on server');
    }
    if (!token || token !== expected) {
      throw new ForbiddenException('invalid sentinel token');
    }
    const olderThanDays = olderRaw ? Math.max(1, Math.floor(Number(olderRaw))) : 7;
    return this.service.cleanupTestData(olderThanDays);
  }
}
