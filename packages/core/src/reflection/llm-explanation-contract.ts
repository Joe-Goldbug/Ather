// packages/core/src/reflection/llm-explanation-contract.ts
// LLM output must conform to this structure — validated by ValidationGate.

export type NextStepActionType =
  | 'next_test'
  | 'practice'
  | 'paid_calibration'
  | 'diary_prompt'
  | 'profile_view';

export type LLMExplanationContract = {
  headline: string;

  summary: string;

  changed_dimensions: Array<{
    dimension: string;
    change_label: string;
    explanation: string;
    confidence_phrase: string;
  }>;

  stable_dimensions: Array<{
    dimension: string;
    explanation: string;
  }>;

  uncertainty_notes: Array<{
    dimension: string;
    note: string;
  }>;

  next_step: {
    action_type: NextStepActionType;
    label: string;
    reason: string;
  };
};

export const ALLOWED_NEXT_ACTIONS_FREE: ReadonlySet<NextStepActionType> = new Set([
  'next_test',
  'practice',
  'profile_view',
]);

export const ALLOWED_NEXT_ACTIONS_PAID: ReadonlySet<NextStepActionType> = new Set([
  'next_test',
  'practice',
  'paid_calibration',
  'diary_prompt',
  'profile_view',
]);
