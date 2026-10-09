import { Module } from '@nestjs/common';
import { ThemeAssessmentController } from './theme-assessment.controller.js';
import { GuestAssessmentController } from './guest-assessment.controller.js';
import { ThemeAssessmentService } from './theme-assessment.service.js';
import { ThemeFollowupGeneratorService } from './theme-followup-generator.service.js';
import { ThemeQuestionGeneratorService } from './theme-question-generator.service.js';
import { ThemeInsightGeneratorService } from './theme-insight-generator.service.js';

@Module({
  controllers: [ThemeAssessmentController, GuestAssessmentController],
  providers: [
    ThemeAssessmentService,
    ThemeFollowupGeneratorService,
    ThemeQuestionGeneratorService,
    ThemeInsightGeneratorService,
  ],
})
export class ThemeAssessmentModule {}
