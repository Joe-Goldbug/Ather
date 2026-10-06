// packages/core/src/reflection/next-question-router.ts
// Next Question Router — decides what to test next based on profile state.
// Pure function: same input → same output, no side effects on input arrays.

export type RouterReason =
  | 'low_evidence'
  | 'low_confidence'
  | 'contradiction'
  | 'stale_dimension'
  | 'coverage_balance'
  | 'recent_change'
  | 'paid_calibration';

export type QuestionKind = 'formal' | 'practice' | 'calibration';

export type UserTier = 'guest' | 'registered_free' | 'paid';

export type RouterDecision = {
  target_dimension: string;

  reason: RouterReason;

  question_kind: QuestionKind;

  user_tier: UserTier;

  scenario_pool: 'static' | 'supplementary' | 'dynamic_llm' | 'calibration';

  explanation: string;
};

export type RouterInputDimension = {
  dimension: string;
  evidence_count: number;
  confidence: number;
  has_contradiction: boolean;
  last_tested_at?: number;
  current_value: number;
  previous_value?: number;
};

export type RouterInput = {
  dimensions: RouterInputDimension[];
  user_tier: UserTier;
  now: number;
};

const LOW_EVIDENCE_THRESHOLD = 3;
const LOW_CONFIDENCE_THRESHOLD = 0.45;
const STALE_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
const RECENT_CHANGE_THRESHOLD = 15;

/**
 * Stable, deterministic sort comparator for RouterInputDimension.
 * Tie-breaks on dimension name (alphabetical) so that equal-valued
 * dimensions always sort the same way across calls and runtimes.
 *
 * FIX BUG-9: NaN handling — confidence can be NaN if upstream miscalculates.
 * NaN comparisons return false in JS, causing Array.sort to behave
 * non-deterministically. Sanitize NaN to 0 (lowest priority) so sort
 * remains stable.
 */
function makeStableComparator<T extends RouterInputDimension>(
  primary: (d: T) => number,
): (a: T, b: T) => number {
  return (a, b) => {
    const rawA = primary(a);
    const rawB = primary(b);
    const pa = Number.isFinite(rawA) ? rawA : 0;
    const pb = Number.isFinite(rawB) ? rawB : 0;
    if (pa !== pb) return pa - pb;
    // alphabetic tie-break on dimension name
    return a.dimension < b.dimension
      ? -1
      : a.dimension > b.dimension
        ? 1
        : 0;
  };
}

/**
 * Selects the dimension with the lowest primary value, with a stable
 * alphabetic tie-break. Pure: does not mutate the input array.
 */
function pickLowest<T extends RouterInputDimension>(
  candidates: T[],
  primary: (d: T) => number,
): T {
  // Defensive copy + sort so input is never mutated.
  const sorted = [...candidates].sort(makeStableComparator(primary));
  return sorted[0]!;
}

/**
 * Selects the dimension with the highest primary value, with a stable
 * alphabetic tie-break. Pure: does not mutate the input array.
 */
function pickHighest<T extends RouterInputDimension>(
  candidates: T[],
  primary: (d: T) => number,
): T {
  const sorted = [...candidates].sort(
    makeStableComparator((d) => -primary(d)),
  );
  return sorted[0]!;
}

export function decideNextQuestion(input: RouterInput): RouterDecision | null {
  const { dimensions, user_tier, now } = input;

  if (dimensions.length === 0) return null;

  // Priority 1: contradiction — always highest priority
  const contradicted = dimensions.filter((d) => d.has_contradiction);
  if (contradicted.length > 0) {
    const target = pickLowest(contradicted, (d) => d.confidence);
    const questionKind: QuestionKind =
      user_tier === 'paid' ? 'calibration' : 'formal';
    return {
      target_dimension: target.dimension,
      reason: 'contradiction',
      question_kind: questionKind,
      user_tier,
      scenario_pool:
        user_tier === 'paid' ? 'calibration' : 'supplementary',
      explanation:
        'Your responses on this dimension show contradictory patterns. Let us check again.',
    };
  }

  // Priority 2: low evidence
  const lowEvidence = dimensions.filter(
    (d) => d.evidence_count < LOW_EVIDENCE_THRESHOLD,
  );
  if (lowEvidence.length > 0) {
    const target = pickLowest(lowEvidence, (d) => d.evidence_count);
    return {
      target_dimension: target.dimension,
      reason: 'low_evidence',
      question_kind: 'formal',
      user_tier,
      scenario_pool: 'supplementary',
      explanation:
        'EVA needs more real data on this dimension before forming a clear picture.',
    };
  }

  // Priority 3: low confidence (free→practice, paid→calibration)
  const lowConfidence = dimensions.filter(
    (d) => d.confidence < LOW_CONFIDENCE_THRESHOLD,
  );
  if (lowConfidence.length > 0) {
    const target = pickLowest(lowConfidence, (d) => d.confidence);
    const questionKind: QuestionKind =
      user_tier === 'paid' ? 'calibration' : 'practice';
    return {
      target_dimension: target.dimension,
      reason: 'low_confidence',
      question_kind: questionKind,
      user_tier,
      scenario_pool:
        user_tier === 'paid' ? 'calibration' : 'supplementary',
      explanation:
        'This dimension still has too much uncertainty. More focused questions will help.',
    };
  }

  // Priority 4: stale dimension
  const staleThreshold = now - STALE_DAYS_MS;
  const stale = dimensions.filter(
    (d) =>
      d.last_tested_at !== undefined && d.last_tested_at < staleThreshold,
  );
  if (stale.length > 0) {
    // pick the OLDEST tested
    const target = pickLowest(
      stale,
      (d) => d.last_tested_at ?? Number.POSITIVE_INFINITY,
    );
    return {
      target_dimension: target.dimension,
      reason: 'stale_dimension',
      question_kind: 'formal',
      user_tier,
      scenario_pool: 'static',
      explanation:
        'It has been over 30 days since EVA last checked this dimension.',
    };
  }

  // Priority 5: recent change
  const recentChanges = dimensions.filter((d) => {
    if (d.previous_value === undefined) return false;
    return (
      Math.abs(d.current_value - d.previous_value) > RECENT_CHANGE_THRESHOLD
    );
  });
  if (recentChanges.length > 0) {
    const target = pickHighest(
      recentChanges,
      (d) => Math.abs(d.current_value - (d.previous_value ?? 0)),
    );
    return {
      target_dimension: target.dimension,
      reason: 'recent_change',
      question_kind: user_tier === 'paid' ? 'calibration' : 'practice',
      user_tier,
      scenario_pool:
        user_tier === 'paid' ? 'calibration' : 'supplementary',
      explanation:
        'This dimension shifted noticeably. EVA wants to confirm whether this is real or noise.',
    };
  }

  // Priority 6: paid calibration (only for paid users)
  if (user_tier === 'paid') {
    const lowestConf = pickLowest(dimensions, (d) => d.confidence);
    return {
      target_dimension: lowestConf.dimension,
      reason: 'paid_calibration',
      question_kind: 'calibration',
      user_tier,
      scenario_pool: 'calibration',
      explanation:
        'Premium calibration: this dimension benefits from deeper verification.',
    };
  }

  // Priority 7: coverage balance — weakest dimension
  const target = pickLowest(
    dimensions,
    (d) => d.evidence_count * d.confidence,
  );
  return {
    target_dimension: target.dimension,
    reason: 'coverage_balance',
    question_kind: 'formal',
    user_tier,
    scenario_pool: 'supplementary',
    explanation:
      'EVA balances coverage across all dimensions, focusing where the picture is weakest.',
  };
}

/**
 * Downgrades a requested question kind to a tier-appropriate default.
 *
 * Per Reflection Funnel design Section 10:
 *   - guest:           next_test | profile_view  (no practice, no calibration)
 *   - registered_free: next_test | practice | profile_view (no calibration)
 *   - paid:            next_test | practice | paid_calibration | diary_prompt | profile_view
 *
 * Any "higher" requested kind is downgraded to the highest available
 * kind for that tier.
 */
export function safeQuestionKind(
  userTier: UserTier,
  requested: QuestionKind,
): QuestionKind {
  // guest: only next_test allowed
  if (userTier === 'guest') {
    if (requested === 'calibration' || requested === 'practice') {
      return 'formal';
    }
    return requested;
  }

  // registered_free: practice available, calibration not
  if (userTier === 'registered_free' && requested === 'calibration') {
    return 'practice';
  }

  // paid: all kinds available
  return requested;
}
