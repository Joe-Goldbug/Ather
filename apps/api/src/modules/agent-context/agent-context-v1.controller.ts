import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard.js';
import type { AuthUser } from '../auth/auth.service.js';
import { AgentContextService } from './agent-context.service.js';

@Controller('v1/agent-context')
@UseGuards(AuthGuard)
export class AgentContextV1Controller {
  constructor(private readonly context: AgentContextService) {}

  @Get()
  async getContext(
    @Req() req: { user: AuthUser },
    @Query('agent_id') agentId: string,
    @Query('purpose') purposeScope: string,
  ) {
    return this.context.buildAuthorizedContext(req.user.id, agentId, purposeScope);
  }
}
