// apps/api/src/modules/assessment/assessment.module.ts
// Task 4: AssessmentModule — backendizes the short test

import { Module } from '@nestjs/common';
import { AssessmentController } from './assessment.controller.js';
import { AssessmentService } from './assessment.service.js';

@Module({
  controllers: [AssessmentController],
  providers: [AssessmentService],
  exports: [AssessmentService],
})
export class AssessmentModule {}
