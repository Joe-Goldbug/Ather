// apps/api/src/modules/assessment/services/micro-sandbox/validation/logic-consistency.agent.ts
//
// logic_consistency validation agent — FAIL-OPEN.
//
// Checks scene-to-scene coherence, choice->next_scene_map wiring, and
// character/tone consistency across scenes. Issues are reported as
// `moderate` or `minor` (never `critical`) — they degrade quality but
// don't invalidate the script. The orchestrator swallows agent-call
// errors and returns a synthetic passed=true result (fail-open policy).

import { Injectable } from '@nestjs/common';
import {
  DynamicScriptFunnelConfig,
  callM27Json,
} from '../../../../../common/minimax/dynamic-script-funnel.config.js';
import type { GeneratedScript } from '../../../dto/dynamic-script/shared/generated-script.dto.js';
import type { ExtractedVariables } from '../../../dto/dynamic-script/shared/extracted-variables.dto.js';
import type { ValidationResult } from './failure-policy.js';

const SYSTEM_PROMPT = `You are EVA's logic consistency reviewer.

Inspect the script's tree structure and narrative flow. Flag:
- A choice whose choice_id is missing from next_scene_map
- A next_scene_map pointing to a non-existent scene_id
- Scene narratives that contradict earlier scenes (character changes name,
  setting teleports, mood swings with no cause)
- A choice whose text does not plausibly lead to the next scene's narrative

Severity rules:
- Structural breaks (missing/extra scene wiring) → moderate
- Pure narrative incoherence → minor

Return strict JSON:
{"passed": true|false, "severity": "moderate"|"minor"|"none", "issues": [{"description": "...", "location": "scene-N.choice-X", "suggestion": "..."}], "reasoning": "..."}`;

@Injectable()
export class LogicConsistencyAgent {
  constructor(private readonly config: DynamicScriptFunnelConfig) {}

  async run(script: GeneratedScript, variables: ExtractedVariables): Promise<ValidationResult> {
    const userMessage = `Script:\n${JSON.stringify(script)}\n\nUser variables:\n${JSON.stringify(variables)}\n\nReturn strict JSON.`;
    const parsed = await callM27Json<Omit<ValidationResult, 'agent_name'>>(
      this.config,
      SYSTEM_PROMPT,
      userMessage,
    );
    return { agent_name: 'logic_consistency', ...parsed };
  }
}