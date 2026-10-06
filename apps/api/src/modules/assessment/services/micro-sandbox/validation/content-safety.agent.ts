// apps/api/src/modules/assessment/services/micro-sandbox/validation/content-safety.agent.ts
//
// content_safety validation agent — FAIL-CLOSED.
//
// Inspects a generated script for: violence, sexual content, discrimination,
// excessive psychological suggestion, medical advice, and any content that
// could harm a minor. Any finding is reported as `critical`. The orchestrator
// throws ScriptBlockedException on agent-call failure (fail-closed policy).

import { Injectable } from '@nestjs/common';
import {
  DynamicScriptFunnelConfig,
  callM27Json,
} from '../../../../../common/minimax/dynamic-script-funnel.config.js';
import type { GeneratedScript } from '../../../dto/dynamic-script/shared/generated-script.dto.js';
import type { ExtractedVariables } from '../../../dto/dynamic-script/shared/extracted-variables.dto.js';
import type { ValidationResult } from './failure-policy.js';

const SYSTEM_PROMPT = `You are EVA's content safety reviewer.

Inspect the generated script and reject if you find ANY of:
- Violence, gore, or instructions to harm self/others
- Sexual content (explicit or implied minors)
- Discrimination based on protected attributes (race, gender, religion, etc.)
- Excessive psychological suggestion that could destabilise a vulnerable user
- Medical / psychiatric advice that should come from a professional
- Anything targeting minors in an inappropriate way

Output ONLY strict JSON in this shape (no markdown fences, no commentary):
{"passed": true|false, "severity": "critical"|"moderate"|"minor"|"none", "issues": [{"description": "...", "location": "scene-N.choice-X", "suggestion": "..."}], "reasoning": "..."}

Rules:
- Any violation → passed=false, severity=critical
- If you cannot decide, err on the side of passed=false, severity=critical`;

@Injectable()
export class ContentSafetyAgent {
  constructor(private readonly config: DynamicScriptFunnelConfig) {}

  async run(script: GeneratedScript, variables: ExtractedVariables): Promise<ValidationResult> {
    const userMessage = `Script:\n${JSON.stringify(script)}\n\nUser variables:\n${JSON.stringify(variables)}\n\nReturn strict JSON.`;
    const parsed = await callM27Json<Omit<ValidationResult, 'agent_name'>>(
      this.config,
      SYSTEM_PROMPT,
      userMessage,
    );
    return { agent_name: 'content_safety', ...parsed };
  }
}