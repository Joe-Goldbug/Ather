// apps/api/src/modules/assessment/dynamic-script.controller.ts
//
// Dynamic Script HTTP controller — exposes the three-stage inquiry +
// generation API for the /micro-sandbox dynamic mode.
//
// Routes (under @Controller('assessment/micro-sandbox/dynamic')):
//   POST /start                              → start()
//   POST /answer                             → answer()
//   POST /complete                           → complete()        (async; returns polling token)
//   POST /abort                              → abort()
//   GET  /status?session_id=…                → getStatus()
//   GET  /script/:id/status                  → getScriptStatus()
//   GET  /script/:id                         → getScriptResult()
//
// All routes go through AuthGuard — same as the existing
// AssessmentController. The session token from AuthGuard propagates into
// Database.pool via SessionInterceptor so every RLS-protected query
// automatically scopes to the requesting user.

import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard.js';
import { DynamicScriptPlaybackService, type DynamicScriptPlayResponse } from './services/micro-sandbox/dynamic-script-playback.service.js';
import { PlayDynamicScriptDto, PlayDynamicScriptParamsDto } from './services/micro-sandbox/dynamic-script-playback.dto.js';
import type { AuthUser } from '../auth/auth.service.js';
import {
  DynamicScriptService,
  type StartDynamicResponse,
  type AnswerDynamicContinueResponse,
  type AnswerDynamicCompleteResponse,
  type CompleteDynamicAcceptedResponse,
  type StatusResponse,
  type ScriptGenerationStatus,
  type CompleteDynamicSuccessResponse,
} from './services/micro-sandbox/dynamic-script.service.js';
import {
  StartDynamicDto,
  AnswerDynamicDto,
  CompleteDynamicDto,
  AbortDynamicDto,
  StatusDynamicDto,
  ScriptStatusDto,
  ScriptResultDto,
} from './dto/dynamic-script/index.js';

@Controller('assessment/micro-sandbox/dynamic')
@UseGuards(AuthGuard)
export class DynamicScriptController {
  constructor(
    private readonly service: DynamicScriptService,
    private readonly playback: DynamicScriptPlaybackService,
  ) {}

  @Post('script/:script_id/play')
  play(
    @Req() req: { user: AuthUser },
    @Param() params: PlayDynamicScriptParamsDto,
    @Body() body: PlayDynamicScriptDto,
  ): Promise<DynamicScriptPlayResponse> {
    return this.playback.play(req.user.id, params.script_id, body.played_path);
  }

  @Post('start')
  start(
    @Req() req: { user: AuthUser },
    @Body() body: StartDynamicDto,
  ): Promise<StartDynamicResponse> {
    return this.service.start(req.user.id, body);
  }

  @Post('answer')
  answer(
    @Req() req: { user: AuthUser },
    @Body() body: AnswerDynamicDto,
  ): Promise<AnswerDynamicContinueResponse | AnswerDynamicCompleteResponse> {
    return this.service.answer(req.user.id, body.session_id, body);
  }

  @Post('complete')
  complete(
    @Req() req: { user: AuthUser },
    @Body() body: CompleteDynamicDto,
  ): Promise<CompleteDynamicAcceptedResponse> {
    return this.service.complete(req.user.id, body.session_id, body);
  }

  @Post('abort')
  async abort(
    @Req() req: { user: AuthUser },
    @Body() body: AbortDynamicDto,
  ): Promise<{ session_id: string; status: 'abandoned' | 'completed'; generation_cancelled: boolean; message: string; reason?: string }> {
    const cancelled = await this.service.abortSession(req.user.id, body.session_id, body.reason);
    return {
      session_id: body.session_id,
      status: cancelled.status,
      generation_cancelled: cancelled.generation_cancelled,
      message: cancelled.generation_cancelled ? '生成已取消' : cancelled.status === 'abandoned' ? '会话已取消' : '生成已结束',
      reason: body.reason,
    };
  }

  @Get('status')
  getStatus(
    @Req() req: { user: AuthUser },
    @Query() query: StatusDynamicDto,
  ): Promise<StatusResponse> {
    return this.service.getStatus(req.user.id, query.session_id);
  }

  @Get('script/:script_generation_id/status')
  getScriptStatus(
    @Req() req: { user: AuthUser },
    @Param() params: ScriptStatusDto,
  ): Promise<ScriptGenerationStatus> {
    return this.service.getScriptGenerationStatus(req.user.id, params.script_generation_id);
  }

  @Get('script/:script_generation_id')
  getScriptResult(
    @Req() req: { user: AuthUser },
    @Param() params: ScriptResultDto,
  ): Promise<CompleteDynamicSuccessResponse> {
    return this.service.getScriptResult(req.user.id, params.script_generation_id);
  }
}
