// apps/api/src/modules/assessment/dto/dynamic-script/shared/validation-result.dto.ts
// Mirrors the canonical types from services/micro-sandbox/validation/failure-policy.ts
// Kept here so the HTTP boundary layer (this DTO folder) does not need to import from
// the services layer.

export type AgentName = 'content_safety' | 'measurement_alignment' | 'logic_consistency' | 'personalization';

export type ValidationPolicy = 'fail-closed' | 'fail-open';

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