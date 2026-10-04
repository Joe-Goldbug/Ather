import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard.js';
import type { AuthUser } from '../auth/auth.service.js';
import {
  ThemeAssessmentService,
  type ClaimGuestOpeningBody,
  type CompleteGuestOpeningBody,
} from './theme-assessment.service.js';

@Controller('v1/story/guest-opening')
export class GuestAssessmentController {
  constructor(private readonly rounds: ThemeAssessmentService) {}

  @Get()
  opening() {
    return this.rounds.getGuestOpening();
  }

  @Post('complete')
  complete(@Body() body: CompleteGuestOpeningBody) {
    return this.rounds.completeGuestOpening(body);
  }

  @Post('claim')
  @UseGuards(AuthGuard)
  claim(@Req() req: { user: AuthUser }, @Body() body: ClaimGuestOpeningBody) {
    return this.rounds.claimGuestOpening(req.user.id, body);
  }
}
