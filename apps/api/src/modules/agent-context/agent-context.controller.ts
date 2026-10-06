// apps/api/src/modules/agent-context/agent-context.controller.ts
// Agent Context endpoints — context query, scope check
// Phase 4 — enables MCP and Web3 agents to access user context

import { Controller, Get, Post, UseGuards, Req, Body, GoneException } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard.js';
import type { AuthUser } from '../auth/auth.service.js';

@Controller('agent-context')
@UseGuards(AuthGuard)
export class AgentContextController {
  @Get()
  async getFullContext(@Req() req: { user: AuthUser }) {
    void req;
    throw new GoneException({ code: 'legacy_agent_context_retired' });
  }

  @Get('scope')
  async checkScope(
    @Req() req: { user: AuthUser },
  ) {
    void req;
    throw new GoneException({ code: 'legacy_agent_context_retired' });
  }

  @Post('authorize-agent')
  async authorizeAgent(
    @Req() req: { user: AuthUser },
    @Body() body: { agent_id: string; scopes: string[] },
  ) {
    void req;
    void body;
    throw new GoneException({
      code: 'legacy_agent_authorization_retired',
      message: 'Use the versioned agent grant contract; legacy memory-state grants are disabled.',
    });
  }
}
