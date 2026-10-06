// apps/api/src/modules/assessment/services/micro-sandbox/validation/personalization.agent.ts
//
// personalization validation agent — FAIL-OPEN.
//
// Checks that the script actually uses the variables extracted from the
// user's inquiry (key_persons, trigger_event, coping_strategy, etc.). A
// generic script that ignores the user's specifics still works, but it
// feels uncanny — so we flag the gap as `moderate`/`minor`. Agent-call
// failures are swallowed by the orchestrator (fail-open policy).

import { Injectable } from '@nestjs/common';
import {
  DynamicScriptFunnelConfig,
  callM27Json,
} from '../../../../../common/minimax/dynamic-script-funnel.config.js';
import type { GeneratedScript } from '../../../dto/dynamic-script/shared/generated-script.dto.js';
import type { ExtractedVariables } from '../../../dto/dynamic-script/shared/extracted-variables.dto.js';
import type { ValidationResult } from './failure-policy.js';

const SYSTEM_PROMPT = `You are EVA's personalization reviewer.

Check the script for actual use of the user's extracted variables:
- key_persons[0].name should appear (or be paraphrased) in at least one scene
- trigger_event should be referenced
- primary_emotion / coping_strategy should be reflected in scene tone or
  character choices

Severity rules:
- A required variable is entirely absent → moderate
- A variable is paraphrased but in a way that loses the user's specifics → minor

Return strict JSON:
{"passed": true|false, "severity": "moderate"|"minor"|"none", "issues": [{"description": "...", "location": "scene-N", "suggestion": "..."}], "reasoning": "..."}`;

@Injectable()
export class PersonalizationAgent {
  constructor(private readonly config: DynamicScriptFunnelConfig) {}

  async run(script: GeneratedScript, variables: ExtractedVariables): Promise<ValidationResult> {
    const userMessage = `Script:\n${JSON.stringify(script)}\n\nUser variables:\n${JSON.stringify(variables)}\n\nReturn strict JSON.`;
    const parsed = await callM27Json<Omit<ValidationResult, 'agent_name'>>(
      this.config,
      SYSTEM_PROMPT,
      userMessage,
    );
    return { agent_name: 'personalization', ...parsed };
  }
}