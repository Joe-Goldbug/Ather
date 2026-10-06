// packages/core/src/reflection/profile-delta-builder.ts
// Authoritative ProfileDeltaContract builder.
//
// Takes actual profile snapshots (previous + current) and produces a
// ProfileDeltaContract for LLM explanation. Does NOT update the profile,
// write to DB, or re-score evidence.
//
// Separated from scenario-bridge.ts computeProfileDelta() which computes
// a preview from evidence deltas — computeProfileDelta is for explanation
// preview only, NOT for authoritative profile update.

import type { UserTier } from './next-question-router.js';
import type {
  ProfileDeltaContract,
  UserProfileVector,
  UpdatedDimension,
} from './profile-delta-contract.js';
import { CORE_DIMENSION_KEYS } from './constants.js';

const CHANGE_THRESHOLD = 2;
const LOW_EVIDENCE_THRESHOLD = 3;

export type BuildProfileDeltaInput = {
  user_id: string;
  run_id: string;
  user_tier: UserTier;
  current_archetype_id: string;
  previous_profile: UserProfileVector;
  current_profile: UserProfileVector;
  evidence_count_by_dimension: Record<string, number>;
  confidence_before_by_dimension: Record<string, number>;
  confidence_after_by_dimension: Record<string, number>;
  next_target_dimension: string;
};

export function buildProfileDeltaContract(
  input: BuildProfileDeltaInput,
): ProfileDeltaContract {
  const {
    user_id,
    run_id,
    user_tier,
    current_archetype_id,
    previous_profile,
    current_profile,
    evidence_count_by_dimension,
    confidence_before_by_dimension,
    confidence_after_by_dimension,
    next_target_dimension,
  } = input;

  const changedDimensions: UpdatedDimension[] = [];
  const stableDimensions: ProfileDeltaContract['stable_dimensions'] = [];
  const uncertainDimensions: ProfileDeltaContract['uncertain_dimensions'] = [];

  const prevKeys = new Set(Object.keys(previous_profile));
  const currKeys = new Set(Object.keys(current_profile));
  const allDimKeys = new Set([...prevKeys, ...currKeys]);

  for (const dim of allDimKeys) {
    const hasPrev = prevKeys.has(dim);
    const hasCurr = currKeys.has(dim);

    if (!hasPrev || !hasCurr) {
      uncertainDimensions.push({
        dimension: dim,
        reason: 'low_evidence',
      });
      continue;
    }

    const prevValue = previous_profile[dim]!;
    const currValue = current_profile[dim]!;
    const delta = currValue - prevValue;
    const evidenceCount = evidence_count_by_dimension[dim] ?? 0;
    const confBefore = confidence_before_by_dimension[dim] ?? 0.6;
    const confAfter = confidence_after_by_dimension[dim] ?? 0.6;

    if (Math.abs(delta) >= CHANGE_THRESHOLD) {
      changedDimensions.push({
        dimension: dim,
        previous_value: prevValue,
        current_value: currValue,
        delta,
        confidence_before: confBefore,
        confidence_after: confAfter,
        evidence_count: evidenceCount,
      });
      continue;
    }

    if (evidenceCount > 0 && evidenceCount < LOW_EVIDENCE_THRESHOLD) {
      uncertainDimensions.push({
        dimension: dim,
        reason: 'low_evidence',
      });
      continue;
    }

    stableDimensions.push({
      dimension: dim,
      current_value: currValue,
      confidence: confAfter,
      evidence_count: evidenceCount,
    });
  }

  for (const dim of CORE_DIMENSION_KEYS) {
    if (!allDimKeys.has(dim)) {
      uncertainDimensions.push({
        dimension: dim,
        reason: 'low_evidence',
      });
    }
  }

  const allowedNextActions: ProfileDeltaContract['allowed_next_actions'] =
    user_tier === 'paid'
      ? ['next_test', 'practice', 'paid_calibration', 'diary_prompt', 'profile_view']
      : user_tier === 'guest'
        ? ['next_test', 'profile_view']
        : ['next_test', 'practice', 'profile_view'];

  return {
    user_id,
    run_id,
    user_tier,
    current_archetype_id,
    changed_dimensions: changedDimensions,
    stable_dimensions: stableDimensions,
    uncertain_dimensions: uncertainDimensions,
    next_target_dimension,
    allowed_next_actions: allowedNextActions,
  };
}
