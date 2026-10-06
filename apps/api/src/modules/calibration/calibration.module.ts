// apps/api/src/modules/calibration/calibration.module.ts
// [S1-active] Calibration module — wraps calibration-engine + correction-candidate + shift-detection.
// Exports CalibrationService and ShiftDetectionService for use by other modules.

import { Module } from '@nestjs/common';
import { CalibrationService } from './calibration.service.js';
import { ShiftDetectionService } from './shift-detection.service.js';
import { AuthModule } from '../auth/auth.module.js';
import { DatabaseModule } from '../../common/database.js';

@Module({
  imports: [AuthModule, DatabaseModule],
  providers: [CalibrationService, ShiftDetectionService],
  exports: [CalibrationService, ShiftDetectionService],
})
export class CalibrationModule {}
