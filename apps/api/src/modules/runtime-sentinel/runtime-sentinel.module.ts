// apps/api/src/modules/runtime-sentinel/runtime-sentinel.module.ts
import { Module } from '@nestjs/common';
import { RuntimeSentinelController } from './runtime-sentinel.controller.js';
import { RuntimeSentinelService } from './runtime-sentinel.service.js';
import { DatabaseModule } from '../../common/database.js';
import { RedisModule } from '../../common/redis.module.js';

@Module({
  imports: [DatabaseModule, RedisModule],
  controllers: [RuntimeSentinelController],
  providers: [RuntimeSentinelService],
  exports: [RuntimeSentinelService],
})
export class RuntimeSentinelModule {}
