// apps/api/src/modules/assessment/dynamic-script.module.ts
//
// Wires together the dynamic-script pipeline services + controller.
// Reuses existing global modules: DatabaseModule, QueueModule, EvidenceModule.
// MiniMaxModule and AssessmentModule are imported locally so providers stay
// scoped to this subtree (no leaking into other feature modules).

import { Module } from '@nestjs/common';
import { DynamicScriptController } from './dynamic-script.controller.js';
import { DynamicScriptService } from './services/micro-sandbox/dynamic-script.service.js';
import { DynamicScriptPlaybackService } from './services/micro-sandbox/dynamic-script-playback.service.js';
import { InquiryAgentService } from './services/micro-sandbox/inquiry-agent.service.js';
import { VariableExtractorService } from './services/micro-sandbox/variable-extractor.service.js';
import {
  CompletenessEvaluator,
  CompletenessConfig,
} from './services/micro-sandbox/completeness-evaluator.js';
import { ScriptGeneratorService } from './services/micro-sandbox/script-generator.service.js';
import { ValidationOrchestrator } from './services/micro-sandbox/validation/orchestrator.js';
import { ContentSafetyAgent } from './services/micro-sandbox/validation/content-safety.agent.js';
import { MeasurementAlignmentAgent } from './services/micro-sandbox/validation/measurement-alignment.agent.js';
import { LogicConsistencyAgent } from './services/micro-sandbox/validation/logic-consistency.agent.js';
import { PersonalizationAgent } from './services/micro-sandbox/validation/personalization.agent.js';
import {
  EvidenceBridgeService,
  EvidenceBridgeConfig,
} from './services/micro-sandbox/evidence-bridge.service.js';
import { DynamicScriptFunnelConfig } from '../../common/minimax/dynamic-script-funnel.config.js';
import {
  COMPLETENESS_CONFIG,
  EVIDENCE_BRIDGE_CONFIG,
} from './dynamic-script.tokens.js';

@Module({
  controllers: [DynamicScriptController],
  providers: [
    DynamicScriptFunnelConfig,
    {
      provide: COMPLETENESS_CONFIG,
      useFactory: (): CompletenessConfig => ({
        minTurns: parseInt(process.env.DYNAMIC_SCRIPT_MIN_INQUIRY_TURNS ?? '3', 10),
        maxTurns: parseInt(process.env.DYNAMIC_SCRIPT_MAX_INQUIRY_TURNS ?? '5', 10),
        threshold: parseFloat(process.env.DYNAMIC_SCRIPT_COMPLETENESS_THRESHOLD ?? '0.7'),
      }),
    },
    {
      provide: EVIDENCE_BRIDGE_CONFIG,
      useFactory: (): EvidenceBridgeConfig => ({
        flushThreshold: parseInt(
          process.env.DYNAMIC_SCRIPT_EVIDENCE_FLUSH_THRESHOLD ?? '3',
          10,
        ),
      }),
    },
    InquiryAgentService,
    VariableExtractorService,
    CompletenessEvaluator,
    ScriptGeneratorService,
    ContentSafetyAgent,
    MeasurementAlignmentAgent,
    LogicConsistencyAgent,
    PersonalizationAgent,
    ValidationOrchestrator,
    EvidenceBridgeService,
    DynamicScriptService,
    DynamicScriptPlaybackService,
  ],
  exports: [DynamicScriptService],
})
export class DynamicScriptModule {}
