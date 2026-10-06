// apps/api/src/modules/report/report.controller.ts
// Legacy report transport endpoints.
// These routes still back portrait history / snapshots, but `/report` is no
// longer a primary standalone product page in the current frontend.

import { Controller, Get, Post, Param, Query, UseGuards, Req, NotFoundException } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard.js';
import { ReportService } from './report.service.js';
import type { AuthUser } from '../auth/auth.service.js';
import { parseLimit } from '../../common/pagination.js';

@Controller('report')
@UseGuards(AuthGuard)
export class ReportController {
  constructor(private readonly report: ReportService) {}

  @Post('trigger/:conversationId')
  async triggerReport(
    @Param('conversationId') conversationId: string,
    @Req() req: { user: AuthUser },
  ) {
    const jobId = await this.report.triggerReport(conversationId, req.user.id);
    return { job_id: jobId, status: 'queued' };
  }

  @Get('status/:reportId')
  async getStatus(@Param('reportId') reportId: string, @Req() req: { user: AuthUser }) {
    const row = await this.report.getReportStatus(reportId, req.user.id);
    if (!row) throw new NotFoundException('Report not found');
    return {
      report_id: row.id,
      status: row.status,
      error_message: row.error_message ?? null,
      model_status: 'legacy',
      deprecated: true,
      ...(row.status === 'completed' ? {
        record_kind: 'historical',
        current_evidence_status: row.current_evidence_status,
      } : {}),
    };
  }

  @Get('snapshots')
  async getSnapshots(@Query('limit') limit: string, @Req() req: { user: AuthUser }) {
    return this.report.getSnapshots(req.user.id, parseLimit(limit, 10));
  }

  @Get('history')
  async getHistory(@Query('limit') limit: string, @Req() req: { user: AuthUser }) {
    return this.report.getReports(req.user.id, parseLimit(limit, 5));
  }

  @Get(':reportId')
  async getReport(@Param('reportId') reportId: string, @Req() req: { user: AuthUser }) {
    const row = await this.report.getReport(reportId, req.user.id);
    if (!row) throw new NotFoundException('Report not found');
    return row;
  }
}
