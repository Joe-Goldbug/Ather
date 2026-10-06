// apps/api/src/modules/chat/chat.module.ts
// Task 7: Imports EvidenceModule for evidence writing on every chat turn
// Model audit + Redis cache: ChatService now depends on RedisService

import { Module } from '@nestjs/common';
import { ChatController } from './chat.controller.js';
import { ChatService } from './chat.service.js';
import { AuthModule } from '../auth/auth.module.js';
import { ReportModule } from '../report/report.module.js';
import { EvidenceModule } from '../evidence/evidence.module.js';
import { RedisModule } from '../../common/redis.module.js';

@Module({
  imports: [AuthModule, ReportModule, EvidenceModule, RedisModule],
  controllers: [ChatController],
  providers: [ChatService],
  exports: [ChatService],
})
export class ChatModule {}
