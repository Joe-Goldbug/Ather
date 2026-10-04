import { Module } from '@nestjs/common';
import { ThemeAssessmentController } from './theme-assessment.controller.js';
import { GuestAssessmentController } from './guest-assessment.controller.js';
import { ThemeAssessmentService } from './theme-assessment.service.js';
import { ThemeFollowupGeneratorService } from './theme-followup-generator.service.js';

@Module({
  controllers: [ThemeAssessmentController, GuestAssessmentController],
  providers: [ThemeAssessmentService, ThemeFollowupGeneratorService],
})
export class ThemeAssessmentModule {}
