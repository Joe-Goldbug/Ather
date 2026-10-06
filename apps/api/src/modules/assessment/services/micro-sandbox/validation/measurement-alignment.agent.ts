// apps/api/src/modules/assessment/services/micro-sandbox/validation/measurement-alignment.agent.ts
//
// measurement_alignment validation agent — FAIL-CLOSED.
//
// Verifies that every choice's `dimension_signals` map to one of EVA's
// 15 standard dimensions and that the values fall inside [0, 1]. Misaligned
// mappings (wrong dimension, out-of-range signals, or a choice with no
// signals at all) are reported as `critical`. The orchestrator throws
// ScriptBlockedException on agent-call failure (fail-closed policy).

import { Injectable } from '@nestjs/common';
import {
  DynamicScriptFunnelConfig,
  callM27Json,
} from '../../../../../common/minimax/dynamic-script-funnel.config.js';
import type { GeneratedScript } from '../../../dto/dynamic-script/shared/generated-script.dto.js';
import type { ExtractedVariables } from '../../../dto/dynamic-script/shared/extracted-variables.dto.js';
import type { ValidationResult } from './failure-policy.js';

const ATHERS_15_DIMENSIONS = [
  'trustBoundaries',
  'conflictResponse',
  'attachment',
  'emotionalRegulation',
  'stressResponse',
  'achievement',
  'selfPerception',
  'socialEnergy',
  'emotionGranularity',
  'shameSensitivity',
  'helpSeeking',
  'linguisticExtraversion',
  'narrativeCoherence',
  'growthOrientation',
  'openness',
] as const;

const SYSTEM_PROMPT = `You are EVA's measurement alignment reviewer.

EVA measures 15 psychological dimensions:
${ATHERS_15_DIMENSIONS.join(', ')}

For every choice in the script, check:
1. Every key in choice.dimension_signals is one of the 15 dimensions above
2. Every value is in [0, 1]
3. Each choice has at least one signal (an empty signals map is a defect)
4. The semantic mapping makes sense (e.g., "walk away from conflict" should
   not signal high achievement — that is misalignment)

Any of the above is a critical defect — the resulting measurement would be
garbage if shipped. Return strict JSON:
{"passed": true|false, "severity": "critical"|"moderate"|"minor"|"none", "issues": [{"description": "...", "location": "scene-N.choice-X", "suggestion": "..."}], "reasoning": "..."}`;

@Injectable()
export class MeasurementAlignmentAgent {
  constructor(private readonly config: DynamicScriptFunnelConfig) {}

  async run(script: GeneratedScript, variables: ExtractedVariables): Promise<ValidationResult> {
    const userMessage = `Script:\n${JSON.stringify(script)}\n\nUser variables:\n${JSON.stringify(variables)}\n\nReturn strict JSON.`;
    const parsed = await callM27Json<Omit<ValidationResult, 'agent_name'>>(
      this.config,
      SYSTEM_PROMPT,
      userMessage,
    );
    return { agent_name: 'measurement_alignment', ...parsed };
  }
}