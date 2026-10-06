// apps/api/src/modules/assessment/assessment.controller.ts
// Legacy assessment history remains readable; all legacy write paths are retired.

import { Controller, Post, Get, Body, UseGuards, Req, GoneException } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard.js';
import {
  AssessmentService,
  CompleteAssessmentDto,
  CompleteMicroSandboxDto,
  MicroSandboxNextDto,
} from './assessment.service.js';
import type { AuthUser } from '../auth/auth.service.js';

@Controller('assessment')
@UseGuards(AuthGuard)
export class AssessmentController {
  constructor(private readonly assessment: AssessmentService) {}

  /**
   * POST /assessment/complete
   * Complete a short test server-side.
   * Supports ScenarioAnswer discriminated union (kind:'choice' | kind:'input').
   *
   * Body: { locale, script_version?, scenario_set?, choices, answers?, started_at?, completed_at? }
   * Response: { assessment_run_id, script_result, next_suggested_dimension }
   */
  @Post('complete')
  async complete(@Body() _body: CompleteAssessmentDto, @Req() _req: { user: AuthUser }) {
    throw this.retiredWrite();
  }

  /**
   * POST /assessment/micro-sandbox/next
   * Generate one dynamic micro-sandbox scenario for returning users.
   */
  @Post('micro-sandbox/next')
  async microSandboxNext(@Body() _body: MicroSandboxNextDto, @Req() _req: { user: AuthUser }) {
    throw this.retiredWrite();
  }

  /**
   * POST /assessment/micro-sandbox/complete
   * Submit choice for the one-time micro-sandbox scenario token.
   */
  @Post('micro-sandbox/complete')
  async microSandboxComplete(
    @Body() _body: CompleteMicroSandboxDto,
    @Req() _req: { user: AuthUser }
  ) {
    throw this.retiredWrite();
  }

  /**
   * GET /assessment/latest
   * Retrieve the user's most recent assessment run.
   */
  @Get('latest')
  async getLatest(@Req() req: { user: AuthUser }) {
    return this.assessment.getLatest(req.user.id);
  }

  private retiredWrite() {
    return new GoneException({
      code: 'legacy_assessment_retired',
      message: '旧测试写入已停用，请使用 /v1/assessment-rounds。',
    });
  }
}
