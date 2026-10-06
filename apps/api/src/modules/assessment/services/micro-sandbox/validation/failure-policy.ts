// apps/api/src/modules/assessment/services/micro-sandbox/validation/failure-policy.ts
//
// Shared types + per-agent failure policy for the 4-agent parallel validation
// orchestrator. The mapping from agent name -> failure policy is fixed; each
// agent's prompt is owned by its own .agent.ts file, but the policy is
// centralised here so callers don't need to know which agents fail-open
// vs fail-closed.
//
// Conventions:
//   - fail-closed: any technical error from the agent MUST bubble up so the
//     script is rejected (no unverified script ships to a user).
//   - fail-open: any technical error from the agent is logged and the agent
//     returns a synthetic passed=true result so the rest of the pipeline
//     can still proceed.
//
// The agents themselves only know their own prompts; the orchestrator owns
// the failure policy decision.

export type AgentName =
  | 'content_safety'
  | 'measurement_alignment'
  | 'logic_consistency'
  | 'personalization';

export type ValidationPolicy = 'fail-closed' | 'fail-open';

/**
 * Static map: which agents fail closed vs open.
 *
 *  - content_safety, measurement_alignment -> fail-closed
 *    These gate safety + psychological-validity. If the validator itself
 *    errors out, we cannot claim the script is safe, so we must block.
 *
 *  - logic_consistency, personalization -> fail-open
 *    These are quality-of-experience checks. If the validator is unavailable
 *    we'd rather serve a possibly-imperfect script than refuse to serve at all.
 */
export const AGENT_POLICIES: Record<AgentName, ValidationPolicy> = {
  content_safety: 'fail-closed',
  measurement_alignment: 'fail-closed',
  logic_consistency: 'fail-open',
  personalization: 'fail-open',
};

export type Severity = 'critical' | 'moderate' | 'minor' | 'none';

export interface Issue {
  description: string;
  location: string;
  suggestion?: string;
}

export interface ValidationResult {
  agent_name: AgentName;
  passed: boolean;
  severity: Severity;
  issues: Issue[];
  reasoning: string;
}

export interface ValidationReport {
  results: ValidationResult[];
  has_critical_failure: boolean;
  aggregated_issues_for_revision: Issue[];
}