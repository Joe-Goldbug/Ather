import { Controller, Get, NotFoundException, Param, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard.js';
import type { AuthUser } from '../auth/auth.service.js';
import { PortraitV1Service } from './portrait-v1.service.js';

@Controller('v1/portrait')
@UseGuards(AuthGuard)
export class PortraitV1Controller {
  constructor(private readonly portrait: PortraitV1Service) {}

  @Get('current')
  getCurrent(@Req() req: { user: AuthUser }) {
    return this.portrait.getCurrent(req.user.id);
  }

  @Get('revisions/:revisionId')
  async getRevision(@Req() req: { user: AuthUser }, @Param('revisionId') revisionId: string) {
    const revision = await this.portrait.getRevision(req.user.id, revisionId);
    if (!revision) throw new NotFoundException({ code: 'authorization_denied' });
    return revision;
  }
}
