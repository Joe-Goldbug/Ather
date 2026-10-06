// apps/api/src/modules/agent-context/agent-context.module.ts
import { Module } from '@nestjs/common';
import { AgentContextController } from './agent-context.controller.js';
import { AgentContextV1Controller } from './agent-context-v1.controller.js';
import { AgentContextService } from './agent-context.service.js';
import { AuthModule } from '../auth/auth.module.js';

@Module({
  imports: [AuthModule],
  controllers: [AgentContextController, AgentContextV1Controller],
  providers: [AgentContextService],
  exports: [AgentContextService],
})
export class AgentContextModule {}
