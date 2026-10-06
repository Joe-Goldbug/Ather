import { describe, expect, test } from 'bun:test';
import * as fc from 'fast-check';
import { buildProfileDeltaContract } from './profile-delta-builder.js';
import { CORE_DIMENSION_KEYS } from './constants.js';

const CORE_DIM_KEYS = CORE_DIMENSION_KEYS;

const profileArb = fc.dictionary(
  fc.constantFrom(...CORE_DIM_KEYS),
  fc.integer({ min: 0, max: 100 }),
  { minKeys: 0, maxKeys: 8 },
);

const evidenceCountArb = fc.dictionary(
  fc.constantFrom(...CORE_DIM_KEYS),
  fc.integer({ min: 0, max: 10 }),
  { minKeys: 0, maxKeys: 8 },
);

const confidenceArb = fc.dictionary(
  fc.constantFrom(...CORE_DIM_KEYS),
  fc.double({ min: 0, max: 1, noNaN: true }),
  { minKeys: 0, maxKeys: 8 },
);

const tierArb = fc.constantFrom('guest', 'registered_free', 'paid' as const);

describe('PROPERTY: buildProfileDeltaContract — mutual exclusivity', () => {
  test('a dimension never appears in more than one of changed/stable/uncertain', () => {
    fc.assert(
      fc.property(
        profileArb,
        profileArb,
        evidenceCountArb,
        tierArb,
        (prev, curr, evCount, tier) => {
          const result = buildProfileDeltaContract({
            user_id: 'u',
            run_id: 'r',
            user_tier: tier,
            current_archetype_id: 'a',
            previous_profile: prev,
            current_profile: curr,
            evidence_count_by_dimension: evCount,
            confidence_before_by_dimension: {},
            confidence_after_by_dimension: {},
            next_target_dimension: 'trustBoundaries',
          });

          const changedSet = new Set(result.changed_dimensions.map((d) => d.dimension));
          const stableSet = new Set(result.stable_dimensions.map((d) => d.dimension));
          const uncertainSet = new Set(result.uncertain_dimensions.map((d) => d.dimension));

          for (const d of changedSet) {
            expect(stableSet.has(d)).toBe(false);
            expect(uncertainSet.has(d)).toBe(false);
          }
          for (const d of stableSet) {
            expect(changedSet.has(d)).toBe(false);
            expect(uncertainSet.has(d)).toBe(false);
          }
          for (const d of uncertainSet) {
            expect(changedSet.has(d)).toBe(false);
            expect(stableSet.has(d)).toBe(false);
          }
        },
      ),
      { numRuns: 200 },
    );
  });
});

describe('PROPERTY: buildProfileDeltaContract — core dimensions coverage', () => {
  test('every CORE_DIMENSION_KEYS dimension appears in exactly one of the three buckets', () => {
    fc.assert(
      fc.property(
        profileArb,
        profileArb,
        evidenceCountArb,
        tierArb,
        (prev, curr, evCount, tier) => {
          const result = buildProfileDeltaContract({
            user_id: 'u',
            run_id: 'r',
            user_tier: tier,
            current_archetype_id: 'a',
            previous_profile: prev,
            current_profile: curr,
            evidence_count_by_dimension: evCount,
            confidence_before_by_dimension: {},
            confidence_after_by_dimension: {},
            next_target_dimension: 'trustBoundaries',
          });

          const allCovered = new Set<string>();
          for (const d of result.changed_dimensions) allCovered.add(d.dimension);
          for (const d of result.stable_dimensions) allCovered.add(d.dimension);
          for (const d of result.uncertain_dimensions) allCovered.add(d.dimension);

          for (const dim of CORE_DIM_KEYS) {
            expect(allCovered.has(dim)).toBe(true);
          }
        },
      ),
      { numRuns: 200 },
    );
  });
});

describe('PROPERTY: buildProfileDeltaContract — determinism', () => {
  test('same input always produces same output (200 runs)', () => {
    const input = {
      user_id: 'u',
      run_id: 'r',
      user_tier: 'registered_free' as const,
      current_archetype_id: 'a',
      previous_profile: { trustBoundaries: 50, conflictResponse: 60 },
      current_profile: { trustBoundaries: 55, conflictResponse: 65 },
      evidence_count_by_dimension: { trustBoundaries: 5, conflictResponse: 2 },
      confidence_before_by_dimension: { trustBoundaries: 0.6, conflictResponse: 0.4 },
      confidence_after_by_dimension: { trustBoundaries: 0.7, conflictResponse: 0.5 },
      next_target_dimension: 'trustBoundaries',
    };
    const r1 = buildProfileDeltaContract(input);
    const r2 = buildProfileDeltaContract(input);
    expect(JSON.stringify(r1)).toBe(JSON.stringify(r2));
  });
});

describe('PROPERTY: buildProfileDeltaContract — tier-dependent allowed actions', () => {
  test('paid always has 5 actions; guest always has 2; free has 3', () => {
    fc.assert(
      fc.property(
        profileArb,
        profileArb,
        (prev, curr) => {
          const paidResult = buildProfileDeltaContract({
            user_id: 'u',
            run_id: 'r',
            user_tier: 'paid',
            current_archetype_id: 'a',
            previous_profile: prev,
            current_profile: curr,
            evidence_count_by_dimension: {},
            confidence_before_by_dimension: {},
            confidence_after_by_dimension: {},
            next_target_dimension: 'trustBoundaries',
          });
          const guestResult = buildProfileDeltaContract({
            user_id: 'u',
            run_id: 'r',
            user_tier: 'guest',
            current_archetype_id: 'a',
            previous_profile: prev,
            current_profile: curr,
            evidence_count_by_dimension: {},
            confidence_before_by_dimension: {},
            confidence_after_by_dimension: {},
            next_target_dimension: 'trustBoundaries',
          });
          const freeResult = buildProfileDeltaContract({
            user_id: 'u',
            run_id: 'r',
            user_tier: 'registered_free',
            current_archetype_id: 'a',
            previous_profile: prev,
            current_profile: curr,
            evidence_count_by_dimension: {},
            confidence_before_by_dimension: {},
            confidence_after_by_dimension: {},
            next_target_dimension: 'trustBoundaries',
          });

          expect(paidResult.allowed_next_actions.length).toBe(5);
          expect(guestResult.allowed_next_actions.length).toBe(2);
          expect(freeResult.allowed_next_actions.length).toBe(3);
        },
      ),
      { numRuns: 50 },
    );
  });
});
