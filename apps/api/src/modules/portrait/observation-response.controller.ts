import { Body, Controller, Param, Post, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard.js';
import type { AuthUser } from '../auth/auth.service.js';
import {
  ObservationResponseService,
  type ObservationResponseCommand,
} from './observation-response.service.js';

@Controller('v1/observations')
@UseGuards(AuthGuard)
export class ObservationResponseController {
  constructor(private readonly responses: ObservationResponseService) {}

  @Post(':observationId/revisions/:revisionId/responses')
  respond(
    @Req() req: { user: AuthUser },
    @Param('observationId') observationId: string,
    @Param('revisionId') revisionId: string,
    @Body() body: ObservationResponseCommand,
  ) {
    return this.responses.respond(req.user.id, observationId, revisionId, body);
  }
}
