// apps/api/src/modules/evidence/evidence.module.ts
import { Module, Global } from '@nestjs/common';
import { EvidenceController } from './evidence.controller.js';
import { EvidenceService } from './evidence.service.js';
import { AuthModule } from '../auth/auth.module.js';
import { DatabaseModule } from '../../common/database.js';

@Global()
@Module({
  imports: [AuthModule, DatabaseModule],
  controllers: [EvidenceController],
  providers: [EvidenceService],
  exports: [EvidenceService],
})
export class EvidenceModule {}
