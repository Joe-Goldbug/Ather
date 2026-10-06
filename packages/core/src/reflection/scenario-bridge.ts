// packages/core/src/reflection/scenario-bridge.ts
// Bridge between existing measurement structures (ScenarioSchema) and the
// Reflection Funnel contracts (QuestionContract, EvidenceContract, ProfileDeltaContract).
//
// Design: pure functions, no I/O, no DB, no LLM. Deterministic.

import type { ScenarioSchema } from '../assessment/script-schema.js';
import type { ChoiceOption } from '../shared/types.js';
import type {
  ScenarioCopy,
  OptionCopy,
} from '../assessment/script-copy.js';
import type { QuestionContract } from './question-contract.js';
import type { EvidenceContract } from './evidence-contract.js';
import type {
  ProfileDeltaContract,
  UserProfileVector,
  UpdatedDimension,
} from './profile-delta-contract.js';
import type { UserTier } from './next-question-router.js';
import { decideNextQuestion } from './next-question-router.js';
import { CORE_DIMENSION_KEYS } from './constants.js';

/** Copy lookup function — caller provides locale-aware copy map. */
export type CopyLookup = (scenarioId: string) => ScenarioCopy;

const DELTA_BASELINE = 0.5;
const DIRECTION_EPSILON = 1e-6;

const PRIMARY_NUMERIC_KEYS = [
  '_score',
  '_threshold',
  '_strength',
] as const;

/**
 * Extract the primary numeric delta from a vector_patch.
 *
 * ScenarioSchema.vector_patch keys are mixed:
 *   - categorical: 'avoidant', 'secure', 'rational' (string)
 *   - numeric:     'conflict_score', 'trust_threshold', 'boundary_strength'
 *
 * We pick the FIRST numeric value (prioritizing *_score, then *_threshold,
 * then *_strength) as the scalar delta. Categorical signals are preserved
 * in the EvidenceContract.explanation_basis.vector_patch field for LLM
 * interpretation.
 *
 * Returns 0 if no numeric field is present.
 */
export function extractPrimaryNumericDelta(
  vector_patch: Record<string, number | string>,
): number {
  for (const suffix of PRIMARY_NUMERIC_KEYS) {
    for (const [key, value] of Object.entries(vector_patch)) {
      if (typeof value === 'number' && key.endsWith(suffix)) {
        return value;
      }
    }
  }
  for (const value of Object.values(vector_patch)) {
    if (typeof value === 'number') {
      return value;
    }
  }
  return 0;
}

/**
 * Determine direction from a signed delta. Zero (within epsilon) → neutral.
 */
export function dimensionDirection(
  delta: number,
): 'increase' | 'decrease' | 'neutral' {
  if (Math.abs(delta) < DIRECTION_EPSILON) return 'neutral';
  return delta > 0 ? 'increase' : 'decrease';
}

/**
 * Convert a ScenarioSchema (pure measurement structure) into a QuestionContract
 * (Funnel-standardized question). Uses the provided CopyLookup to fetch
 * locale-aware prompt and option text.
 */
export function scenarioToContract(
  schema: ScenarioSchema,
  copyLookup: CopyLookup,
  scenarioSet: string,
  version: string,
): QuestionContract {
  const copy = copyLookup(schema.id);

  const options = (['A', 'B', 'C', 'D'] as const).map((id) => {
    const optionCopy: OptionCopy = copy.options[id];
    return {
      id,
      text: optionCopy?.text ?? '',
      vector_patch: { ...(schema.vector_patch[id] as Record<string, number>) },
    };
  });

  const contract: QuestionContract = {
    scenario_id: schema.id,
    scenario_set: scenarioSet,
    version,
    source: 'static',
    target_dimension: schema.dimension,
    measurement_intent: schema.measurementIntent,
    evidence_kind: 'formal',
    confidence_weight: 1.0,
    prompt: copy.prompt,
    options,
    llm_generated: false,
  };

  if (schema.secondary_dimension) {
    contract.secondary_dimensions = [schema.secondary_dimension];
  }

  if (schema.confounders && schema.confounders.length > 0) {
    contract.confounders = [...schema.confounders];
  }

  return contract;
}

/**
 * Build an EvidenceContract from a ScenarioSchema + user choice.
 *
 * - user_id, run_id, source_id: caller-provided
 * - delta: primary numeric value from vector_patch, signed against DELTA_BASELINE
 * - direction: sign(delta) with epsilon
 * - weight/confidence: caller-provided (typically 1.0 / 0.6 for baseline)
 *
 * The delta is computed as `vector_value - DELTA_BASELINE`, so that a 0-1
 * vector_value is centered around zero (e.g. 0.9 = +0.4, 0.18 = -0.32).
 * This makes delta composable across multiple evidence events.
 */
export function answerToEvidence(params: {
  user_id: string;
  run_id: string;
  source_id: string;
  scenario: ScenarioSchema;
  scenario_set?: string;
  scenario_version?: string;
  choice: ChoiceOption;
  option_text: string;
  weight: number;
  confidence: number;
}): EvidenceContract {
  const {
    user_id,
    run_id,
    source_id,
    scenario,
    scenario_set = 'global_core_v2',
    scenario_version = '1.0.0',
    choice,
    option_text,
    weight,
    confidence,
  } = params;

  const vectorPatch = scenario.vector_patch[choice] ?? {};
  const rawValue = extractPrimaryNumericDelta(
    vectorPatch as Record<string, number | string>,
  );
  const delta = rawValue - DELTA_BASELINE;

  const evidence: EvidenceContract = {
    user_id,
    run_id,
    source_type: 'assessment',
    source_id,
    scenario_id: scenario.id,
    scenario_set,
    scenario_version,
    dimension: scenario.dimension,
    evidence_kind: 'formal',
    delta,
    direction: dimensionDirection(delta),
    weight,
    confidence,
    raw_answer: {
      option_id: choice,
      option_text,
    },
    explanation_basis: {
      measurement_intent: scenario.measurementIntent,
      vector_patch: { ...vectorPatch },
    },
  };

  if (scenario.secondary_dimension) {
    evidence.secondary_dimensions = [scenario.secondary_dimension];
  }

  return evidence;
}

/**
 * Compute a ProfileDeltaContract deterministically from a list of evidence.
 *
 * ⚠️ This function is for explanation-preview only.
 * It must NOT be used as the authoritative profile updater.
 *
 * The authoritative profile update path remains:
 *   generateScriptResult → applyScriptResult → evidence pipeline → confidence engine.
 *
 * Algorithm:
 *   1. Group evidence by dimension
 *   2. For each dimension: weighted average delta, then current_value = previous + delta * 100
 *      (clamp to 0-100)
 *   3. Changed dimensions: ones that have any evidence in this run
 *   4. Stable dimensions: ones in previous_profile but no evidence in this run
 *   5. Uncertain dimensions: known dimensions with low evidence_count
 *   6. Next target: defer to decideNextQuestion (with synthesized router input)
 *
 * Same input → same output (P0-6 invariant from design).
 */
export function computeProfileDelta(params: {
  user_id: string;
  run_id: string;
  user_tier: UserTier;
  archetype_id: string;
  previous_profile: UserProfileVector;
  evidence: EvidenceContract[];
  now?: number;
}): ProfileDeltaContract {
  const {
    user_id,
    run_id,
    user_tier,
    archetype_id,
    previous_profile,
    evidence,
    now = Date.now(),
  } = params;

  // Group evidence by dimension
  const byDimension = new Map<string, EvidenceContract[]>();
  for (const e of evidence) {
    const list = byDimension.get(e.dimension) ?? [];
    list.push(e);
    byDimension.set(e.dimension, list);
  }

  // Build updated dimensions
  const updatedDimensions: UpdatedDimension[] = [];
  const currentProfile: UserProfileVector = { ...previous_profile };

  for (const [dimension, events] of byDimension) {
    const totalWeight = events.reduce((s, e) => s + e.weight, 0);
    if (totalWeight === 0) continue;

    const weightedDelta =
      events.reduce((s, e) => s + e.delta * e.weight, 0) / totalWeight;
    const prevValue = previous_profile[dimension] ?? 50;
    const newValue = Math.max(0, Math.min(100, prevValue + weightedDelta * 100));
    const avgConfidence =
      events.reduce((s, e) => s + e.confidence * e.weight, 0) / totalWeight;
    const prevConfidence = events[0]!.confidence;

    currentProfile[dimension] = newValue;
    updatedDimensions.push({
      dimension,
      previous_value: prevValue,
      current_value: newValue,
      delta: newValue - prevValue,
      confidence_before: prevConfidence,
      confidence_after: Math.min(1, avgConfidence + 0.1 * events.length),
      evidence_count: events.length,
    });
  }

  // Stable dimensions: known, no evidence this run
  const stableDimensions = Object.entries(previous_profile)
    .filter(([dim]) => !byDimension.has(dim))
    .map(([dim, value]) => {
      // Synthesize evidence_count from byDimension (0 if absent)
      return {
        dimension: dim,
        current_value: value,
        confidence: 0.6,
        evidence_count: 0,
      };
    });

  // Uncertain dimensions: known core dimensions with no profile entry
  const uncertainDimensions: ProfileDeltaContract['uncertain_dimensions'] = [];
  for (const dim of CORE_DIMENSION_KEYS) {
    if (previous_profile[dim] === undefined && !byDimension.has(dim)) {
      uncertainDimensions.push({
        dimension: dim,
        reason: 'low_evidence',
      });
    }
  }

  // Determine next target via Router
  const routerInput = {
    dimensions: CORE_DIMENSION_KEYS.map((dim) => {
      const events = byDimension.get(dim) ?? [];
      const profile = previous_profile[dim] ?? 50;
      const value = currentProfile[dim] ?? 50;
      return {
        dimension: dim,
        evidence_count: events.length,
        confidence: events.length > 0
          ? events[0]!.confidence
          : 0.5,
        has_contradiction: false,
        last_tested_at: events.length > 0 ? now : undefined,
        current_value: value,
        previous_value: profile,
      };
    }),
    user_tier,
    now,
  };

  const decision = decideNextQuestion(routerInput);
  const nextTarget = decision?.target_dimension ?? CORE_DIMENSION_KEYS[0]!;

  // Allowed next actions per tier
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
    current_archetype_id: archetype_id,
    changed_dimensions: updatedDimensions,
    stable_dimensions: stableDimensions,
    uncertain_dimensions: uncertainDimensions,
    next_target_dimension: nextTarget,
    allowed_next_actions: allowedNextActions,
  };
}
