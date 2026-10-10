// apps/api/src/modules/captures/captures.module.ts
// Captures module — Stage 1: reality fragment capture (replaces diary one-per-day limitation)

import { Module } from '@nestjs/common';
import { CapturesController } from './captures.controller.js';
import { CapturesService } from './captures.service.js';
import { NoteReviewService } from './note-review.service.js';
import { AuthModule } from '../auth/auth.module.js';
import { DatabaseModule } from '../../common/database.js';

@Module({
  imports: [AuthModule, DatabaseModule],
  controllers: [CapturesController],
  providers: [CapturesService, NoteReviewService],
  exports: [CapturesService],
})
export class CapturesModule {}
