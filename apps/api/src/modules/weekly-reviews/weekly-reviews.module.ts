// apps/api/src/modules/weekly-reviews/weekly-reviews.module.ts
import { Module } from '@nestjs/common';
import { WeeklyReviewsController } from './weekly-reviews.controller.js';
import { WeeklyExperimentsService } from './weekly-experiments.service.js';
import { WeeklyReviewsService } from './weekly-reviews.service.js';

@Module({
  controllers: [WeeklyReviewsController],
  providers: [WeeklyReviewsService, WeeklyExperimentsService],
  exports: [WeeklyReviewsService, WeeklyExperimentsService],
})
export class WeeklyReviewsModule {}
