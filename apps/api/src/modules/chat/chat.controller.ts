// apps/api/src/modules/chat/chat.controller.ts
// Legacy chat compatibility endpoints.
// Current product no longer uses chat as a primary flow, but these routes stay
// available for archived history, model audit, and controlled compatibility.

import {
  Controller, Post, Get, Body, Headers, HttpCode, HttpStatus, HttpException, UseGuards, Req,
} from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard.js';
import { ChatService, type ModelAuditResult, type ModelConfig, type FunnelStatus } from './chat.service.js';
import { RedisService } from '../../common/redis.service.js';
import type { AuthUser } from '../auth/auth.service.js';
import { EVA_LEGACY_CHAT_ENABLED } from '../../common/feature-flags.js';

@Controller('chat')
export class ChatController {
  constructor(
    private readonly chat: ChatService,
    private readonly redis: RedisService,
  ) {}

  @Post('send')
  @UseGuards(AuthGuard)
  @HttpCode(200)
  async send(
    @Body() body: { message: string; locale?: string },
    @Req() req: { user: AuthUser },
  ) {
    if (!EVA_LEGACY_CHAT_ENABLED) {
      throw new HttpException(
        'Legacy chat write is discontinued. Conversation history remains available for compatibility.',
        HttpStatus.GONE,
      );
    }
    const response = await this.chat.sendMessage(req.user.id, body.message, body.locale);
    return {
      eva_message: response.eva_message,
      engine_used: response.engine_used,
      model: this.chat.lastUsedModel,
      you_shifted: response.you_shifted ?? null,
      correction_signal: response.correction_signal ?? null,
      dialogue_state: response.updated_state ?? null,
      diary_update: response.diary_update ?? null,
      next_test_recommendation: response.next_test_recommendation ?? null,
    };
  }

  @Get('dialogue-state')
  @UseGuards(AuthGuard)
  async getState(@Req() req: { user: AuthUser }) {
    return this.chat.getDialogueState(req.user.id);
  }

  @Get('history')
  @UseGuards(AuthGuard)
  async getHistory(@Req() req: { user: AuthUser }) {
    return this.chat.getHistory(req.user.id);
  }

  @Get('model-audit')
  @UseGuards(AuthGuard)
  async modelAudit(): Promise<ModelAuditResult> {
    return this.chat.verifyModel();
  }

  @Get('model-config')
  @UseGuards(AuthGuard)
  async modelConfig(): Promise<ModelConfig> {
    return this.chat.getModelConfig();
  }

  @Get('cache-stats')
  @UseGuards(AuthGuard)
  async cacheStats() {
    return this.redis.getCacheStats();
  }

  @Get('funnel-status')
  @UseGuards(AuthGuard)
  async funnelStatus(): Promise<FunnelStatus> {
    return this.chat.getFunnelStatus();
  }
}
