import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { ProductFeedbackController } from './product-feedback.controller.js';
import { ProductFeedbackService } from './product-feedback.service.js';

@Module({
  imports: [AuthModule],
  controllers: [ProductFeedbackController],
  providers: [ProductFeedbackService],
})
export class ProductFeedbackModule {}
