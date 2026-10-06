// apps/api/src/modules/diary/diary.module.ts
// Task 8: Imports EvidenceModule for diary evidence writing

import { Module, Global } from '@nestjs/common';
import { DiaryController } from './diary.controller.js';
import { DiaryService } from './diary.service.js';
import { EvidenceModule } from '../evidence/evidence.module.js';

@Global()
@Module({
  imports: [EvidenceModule],
  controllers: [DiaryController],
  providers: [DiaryService],
  exports: [DiaryService],
})
export class DiaryModule {}
