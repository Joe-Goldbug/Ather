// packages/core/src/reflection/question-contract.ts
// Standardized question structure — all questions enter the Funnel through this contract.

import type { DimensionKey } from './constants.js';
import type { EvidenceKind } from '../evidence/evidence-weights.js';
import type { ChoiceOption } from '../shared/types.js';

export type { EvidenceKind, ChoiceOption };

export type QuestionSource =
  | 'static'
  | 'supplementary'
  | 'dynamic_llm'
  | 'practice'
  | 'calibration';

export type QuestionContract = {
  scenario_id: string;
  scenario_set: string;
  version: string;

  source: QuestionSource;

  target_dimension: string;
  secondary_dimensions?: string[];

  measurement_intent: string;
  confounders?: string[];

  evidence_kind: EvidenceKind;
  confidence_weight: number;

  prompt: string;

  options: Array<{
    id: ChoiceOption;
    text: string;
    vector_patch: Record<string, number | string>;
  }>;

  llm_generated?: boolean;
};
