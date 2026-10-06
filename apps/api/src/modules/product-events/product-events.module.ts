import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { ProductEventsController } from './product-events.controller.js';
import { ProductEventsService } from './product-events.service.js';

@Module({
  imports: [AuthModule],
  controllers: [ProductEventsController],
  providers: [ProductEventsService],
  exports: [ProductEventsService],
})
export class ProductEventsModule {}
