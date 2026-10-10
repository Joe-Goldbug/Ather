import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { DatabaseModule } from '../../common/database.js';
import { UnderstandingController } from './understanding.controller.js';
import { UnderstandingSourceService } from './understanding-source.js';
import { UnderstandingService } from './understanding.service.js';

@Module({
  imports: [AuthModule, DatabaseModule],
  controllers: [UnderstandingController],
  providers: [UnderstandingSourceService, UnderstandingService],
  exports: [UnderstandingService],
})
export class UnderstandingModule {}
