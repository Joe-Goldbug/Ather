// apps/api/src/queue/queue.module.ts
// Phase 5: BullMQ QueueModule — registers QueueService globally

import { Module, Global } from '@nestjs/common';
import { QueueService } from './queue.service.js';

@Global()
@Module({
  providers: [QueueService],
  exports: [QueueService],
})
export class QueueModule {}
