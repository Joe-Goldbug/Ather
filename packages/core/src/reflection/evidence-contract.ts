// packages/core/src/reflection/evidence-contract.ts
// Standardized evidence structure — answer → evidence before LLM sees it.

import type { EvidenceKind, ChoiceOption } from './question-contract.js';

export type EvidenceContract = {
  user_id: string;
  run_id: string;

  source_type: 'assessment';
  source_id: string;

  scenario_id: string;
  scenario_set: string;
  scenario_version: string;

  dimension: string;
  secondary_dimensions?: string[];

  evidence_kind: EvidenceKind;

  delta: number;
  direction: 'increase' | 'decrease' | 'neutral';

  weight: number;
  confidence: number;

  raw_answer: {
    option_id: ChoiceOption;
    option_text: string;
  };

  explanation_basis: {
    measurement_intent: string;
    vector_patch: Record<string, number | string>;
  };
};
