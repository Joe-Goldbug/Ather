// apps/api/src/modules/consent/consent.module.ts
import { Module, Global } from '@nestjs/common';
import { ConsentController } from './consent.controller.js';
import { ConsentService } from './consent.service.js';

@Global()
@Module({
  controllers: [ConsentController],
  providers: [ConsentService],
  exports: [ConsentService],
})
export class ConsentModule {}