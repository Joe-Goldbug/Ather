import { Module } from '@nestjs/common';
import { PortraitV1Controller } from './portrait-v1.controller.js';
import { PortraitV1Service } from './portrait-v1.service.js';
import { ObservationResponseController } from './observation-response.controller.js';
import { ObservationResponseService } from './observation-response.service.js';
import { CorrectionV1Controller } from './correction-v1.controller.js';
import { CorrectionV1Service } from './correction-v1.service.js';
import { ObservationV1Controller } from './observation-v1.controller.js';
import { ObservationV1Service } from './observation-v1.service.js';
import { PortraitAggregationService } from './portrait-aggregation.service.js';

@Module({
  controllers: [PortraitV1Controller, ObservationResponseController, ObservationV1Controller, CorrectionV1Controller],
  providers: [PortraitV1Service, ObservationResponseService, ObservationV1Service, PortraitAggregationService, CorrectionV1Service],
  exports: [PortraitV1Service, ObservationResponseService, ObservationV1Service, PortraitAggregationService, CorrectionV1Service],
})
export class PortraitV1Module {}
