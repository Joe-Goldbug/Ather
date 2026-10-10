import { Body, Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard.js';
import type { AuthUser } from '../auth/auth.service.js';
import {
  ThemeAssessmentService,
  type RespondThemeResultCommand,
  type StartThemeRoundCommand,
  type SubmitThemeRoundAnswerCommand,
} from './theme-assessment.service.js';

@Controller('v1')
@UseGuards(AuthGuard)
export class ThemeAssessmentController {
  constructor(private readonly rounds: ThemeAssessmentService) {}

  @Post('assessment-rounds')
  start(@Req() req: { user: AuthUser }, @Body() body: StartThemeRoundCommand) {
    return this.rounds.start(req.user.id, body ?? {});
  }

  @Get('assessment-themes/coverage')
  coverage(@Req() req: { user: AuthUser }) {
    return this.rounds.coverage(req.user.id);
  }

  @Get('assessment-rounds')
  list(@Req() req: { user: AuthUser }) {
    return this.rounds.list(req.user.id);
  }

  @Get('assessment-rounds/:roundId/next')
  next(@Req() req: { user: AuthUser }, @Param('roundId') roundId: string) {
    return this.rounds.next(req.user.id, roundId);
  }

  @Post('assessment-rounds/:roundId/items/:itemId/responses')
  submit(
    @Req() req: { user: AuthUser },
    @Param('roundId') roundId: string,
    @Param('itemId') itemId: string,
    @Body() body: SubmitThemeRoundAnswerCommand
  ) {
    return this.rounds.submitAnswer(req.user.id, roundId, itemId, body);
  }

  @Post('assessment-rounds/:roundId/complete')
  complete(@Req() req: { user: AuthUser }, @Param('roundId') roundId: string) {
    return this.rounds.complete(req.user.id, roundId);
  }

  @Post('assessment-rounds/:roundId/abandon')
  abandon(@Req() req: { user: AuthUser }, @Param('roundId') roundId: string) {
    return this.rounds.abandon(req.user.id, roundId);
  }

  @Get('assessment-rounds/:roundId/result')
  result(@Req() req: { user: AuthUser }, @Param('roundId') roundId: string) {
    return this.rounds.getResult(req.user.id, roundId);
  }

  @Post('assessment-rounds/:roundId/result/responses')
  respond(
    @Req() req: { user: AuthUser },
    @Param('roundId') roundId: string,
    @Body() body: RespondThemeResultCommand
  ) {
    return this.rounds.respondToResult(req.user.id, roundId, body);
  }
}
