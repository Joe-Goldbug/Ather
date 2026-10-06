// apps/api/src/modules/assessment/services/micro-sandbox/validation/orchestrator.ts
//
// Validation orchestrator — runs the 4-agent parallel validation pipeline
// against a freshly generated dynamic script.
//
// Concurrency: all 4 agents fire via Promise.allSettled so a slow agent
// never blocks the others. Failure handling:
//   - fail-closed (content_safety, measurement_alignment): a technical
//     error from the agent MUST bubble up as ScriptBlockedException. The
//     script cannot be served if we cannot verify its safety.
//   - fail-open (logic_consistency, personalization): a technical error
//     produces a synthetic passed=true result so the rest of the pipeline
//     can still ship a script (these are quality-of-experience checks).
//
// `shouldRevise()` is the gate the generator uses to decide whether to
// re-prompt M3 with the aggregated issues for revision.

import { Injectable, Logger } from '@nestjs/common';
import {
  DynamicScriptFunnelConfig,
} from '../../../../../common/minimax/dynamic-script-funnel.config.js';
import type { GeneratedScript } from '../../../dto/dynamic-script/shared/generated-script.dto.js';
import type { ExtractedVariables } from '../../../dto/dynamic-script/shared/extracted-variables.dto.js';
import {
  AGENT_POLICIES,
  type AgentName,
  type Issue,
  type ValidationResult,
  type ValidationReport,
} from './failure-policy.js';
import { ContentSafetyAgent } from './content-safety.agent.js';
import { MeasurementAlignmentAgent } from './measurement-alignment.agent.js';
import { LogicConsistencyAgent } from './logic-consistency.agent.js';
import { PersonalizationAgent } from './personalization.agent.js';

const AGENT_ORDER: AgentName[] = [
  'content_safety',
  'measurement_alignment',
  'logic_consistency',
  'personalization',
];

/**
 * Thrown when a fail-closed validation agent errors out (network, parse,
 * timeout). The script must NOT be served if we cannot verify its safety.
 * Callers should surface a user-friendly "please try again" message rather
 * than the raw error.
 */
export class ScriptBlockedException extends Error {
  constructor(
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ScriptBlockedException';
  }
}

@Injectable()
export class ValidationOrchestrator {
  private readonly logger = new Logger(ValidationOrchestrator.name);

  constructor(
    config: DynamicScriptFunnelConfig,
    private readonly contentSafety: ContentSafetyAgent = new ContentSafetyAgent(config),
    private readonly measurementAlignment: MeasurementAlignmentAgent = new MeasurementAlignmentAgent(config),
    private readonly logicConsistency: LogicConsistencyAgent = new LogicConsistencyAgent(config),
    private readonly personalization: PersonalizationAgent = new PersonalizationAgent(config),
  ) {}

  /**
   * Run all 4 validation agents in parallel against the script.
   *
   * Returns a `ValidationReport` aggregating every agent's result. If a
   * fail-closed agent errors, throws `ScriptBlockedException`. If a
   * fail-open agent errors, that agent's slot is filled with a synthetic
   * `{passed:true, severity:'none'}` result and validation continues.
   */
  async validate(
    script: GeneratedScript,
    variables: ExtractedVariables,
  ): Promise<ValidationReport> {
    const settled = await Promise.allSettled([
      this.contentSafety.run(script, variables),
      this.measurementAlignment.run(script, variables),
      this.logicConsistency.run(script, variables),
      this.personalization.run(script, variables),
    ]);

    const results: ValidationResult[] = settled.map((s, i) => {
      const name = AGENT_ORDER[i];
      if (s.status === 'fulfilled') return s.value;
      // Agent call itself errored (network, parse, timeout). Apply policy.
      const policy = AGENT_POLICIES[name];
      const reason = s.reason instanceof Error ? s.reason.message : String(s.reason);
      this.logger.error(`Agent ${name} failed (policy=${policy}): ${reason}`);
      if (policy === 'fail-closed') {
        throw new ScriptBlockedException(
          `Validation agent ${name} failed and policy is fail-closed`,
          { error: reason },
        );
      }
      // fail-open: synthetic pass
      return {
        agent_name: name,
        passed: true,
        severity: 'none',
        issues: [],
        reasoning: `agent unavailable (fail-open): ${reason.slice(0, 100)}`,
      };
    });

    const aggregated: Issue[] = results.flatMap((r) => r.issues);
    const hasCritical = results.some((r) => !r.passed && r.severity === 'critical');

    return {
      results,
      has_critical_failure: hasCritical,
      aggregated_issues_for_revision: aggregated,
    };
  }

  /**
   * Whether the generator should re-prompt M3 with the aggregated issues
   * to revise the script. Returns true iff ANY agent reported a
   * critical failure (passed=false + severity='critical').
   */
  shouldRevise(report: ValidationReport): boolean {
    return report.has_critical_failure;
  }
}