// apps/api/src/modules/audit/audit.module.ts
import { Module } from '@nestjs/common';
import { AuditController } from './audit.controller.js';
import { AuditService } from './audit.service.js';
import { AuthModule } from '../auth/auth.module.js';
import { DatabaseModule } from '../../common/database.js';

@Module({
  imports: [AuthModule, DatabaseModule],
  controllers: [AuditController],
  providers: [AuditService],
  exports: [AuditService],
})
export class AuditModule {}
