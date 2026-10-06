import { Controller, Get, NotFoundException, Param, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard.js';
import type { AuthUser } from '../auth/auth.service.js';
import { ObservationV1Service } from './observation-v1.service.js';

@Controller('v1/observations')
@UseGuards(AuthGuard)
export class ObservationV1Controller {
  constructor(private readonly observations: ObservationV1Service) {}

  @Get()
  list(@Req() req: { user: AuthUser }) {
    return this.observations.list(req.user.id);
  }

  @Get(':observationId/revisions/:revisionId/rationale')
  async rationale(
    @Req() req: { user: AuthUser },
    @Param('observationId') observationId: string,
    @Param('revisionId') revisionId: string,
  ) {
    const rationale = await this.observations.getRationale(req.user.id, observationId, revisionId);
    if (!rationale) throw new NotFoundException({ code: 'authorization_denied' });
    return rationale;
  }
}
