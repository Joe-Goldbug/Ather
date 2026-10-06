// packages/core/src/reflection/profile-delta-contract.ts
// Deterministic profile update — same evidence must always produce same output.

import type { DimensionKey } from './constants.js';

export type UserProfileVector = Record<string, number>;

export type ProfileUpdateInput = {
  user_id: string;
  previous_profile: UserProfileVector;
  evidence: Array<{
    dimension: string;
    delta: number;
    weight: number;
    confidence: number;
    evidence_kind: string;
  }>;
};

export type UpdatedDimension = {
  dimension: string;
  previous_value: number;
  current_value: number;
  delta: number;
  confidence_before: number;
  confidence_after: number;
  evidence_count: number;
};

export type ProfileUpdateResult = {
  current_profile: UserProfileVector;
  updated_dimensions: UpdatedDimension[];
};

export type ProfileDeltaContract = {
  user_id: string;
  run_id: string;

  user_tier: 'guest' | 'registered_free' | 'paid';

  current_archetype_id: string;

  changed_dimensions: UpdatedDimension[];

  stable_dimensions: Array<{
    dimension: string;
    current_value: number;
    confidence: number;
    evidence_count: number;
  }>;

  uncertain_dimensions: Array<{
    dimension: string;
    reason:
      | 'low_evidence'
      | 'low_confidence'
      | 'contradiction'
      | 'stale_dimension'
      | 'low_coverage';
  }>;

  next_target_dimension: string;

  allowed_next_actions: Array<
    | 'next_test'
    | 'practice'
    | 'paid_calibration'
    | 'diary_prompt'
    | 'profile_view'
  >;
};
