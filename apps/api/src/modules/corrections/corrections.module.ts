// apps/api/src/modules/corrections/corrections.module.ts
// Read-only legacy corrections archive. POST /corrections returns 410.

import { Module } from '@nestjs/common';
import { CorrectionsController } from './corrections.controller.js';
import { CorrectionsService } from './corrections.service.js';
import { AuthModule } from '../auth/auth.module.js';

@Module({
  imports: [AuthModule],
  controllers: [CorrectionsController],
  providers: [CorrectionsService],
  exports: [CorrectionsService],
})
export class CorrectionsModule {}
