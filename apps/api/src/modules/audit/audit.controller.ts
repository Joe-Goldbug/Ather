// apps/api/src/modules/audit/audit.controller.ts
// Audit endpoints (read-only) — Phase 7

import { Controller, Get, Param, Query, UseGuards, Req } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard.js';
import { AuditService } from './audit.service.js';
import type { AuthUser } from '../auth/auth.service.js';
import { parsePage, parseLimit } from '../../common/pagination.js';

@Controller('audit')
@UseGuards(AuthGuard)
export class AuditController {
  constructor(private readonly audit: AuditService) {}

  @Get('me')
  async getMyAudit(
    @Query('page') page: string,
    @Query('limit') limit: string,
    @Req() req: { user: AuthUser },
  ) {
    return this.audit.getByUser(
      req.user.id,
      parsePage(page),
      parseLimit(limit, 50),
    );
  }

  @Get('record/:tableName/:recordId')
  async getByRecord(
    @Param('tableName') tableName: string,
    @Param('recordId') recordId: string,
    @Query('page') page: string,
    @Query('limit') limit: string,
    @Req() req: { user: AuthUser },
  ) {
    return this.audit.getByRecord(
      tableName,
      recordId,
      req.user.id,
      parsePage(page),
      parseLimit(limit, 50),
    );
  }

  @Get('table/:tableName')
  async getByTable(
    @Param('tableName') tableName: string,
    @Query('page') page: string,
    @Query('limit') limit: string,
    @Req() req: { user: AuthUser },
  ) {
    return this.audit.getByTable(
      tableName,
      req.user.id,
      parsePage(page),
      parseLimit(limit, 50),
    );
  }
}