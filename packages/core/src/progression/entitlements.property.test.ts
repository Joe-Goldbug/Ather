// packages/core/src/progression/entitlements.property.test.ts
// Property-based tests for the entitlements module
// Uses fast-check to verify entitlement invariants

import { describe, test, expect } from 'bun:test';
import * as fc from 'fast-check';
import {
  checkEntitlement,
  ALWAYS_FREE,
  type Tier,
  type Feature,
} from './entitlements.js';

// ─────────────────────────────────────────────────────────────
// Arbitraries / Generators
// ─────────────────────────────────────────────────────────────

/** All valid tiers */
const tierArb: fc.Arbitrary<Tier> = fc.constantFrom('free', 'paid');

/** All ALWAYS_FREE features */
const alwaysFreeFeatureArb: fc.Arbitrary<Feature> = fc.constantFrom(
  'data_deletion',
  'basic_evidence_view',
);

// ─────────────────────────────────────────────────────────────
// Property Tests
// ─────────────────────────────────────────────────────────────

describe('entitlements property tests', () => {
  /**
   * Correction feedback is entitlement-gated.
   */
  test('correction is blocked for free tier and allowed for non-free tiers', () => {
    fc.assert(
      fc.property(tierArb, (tier) => {
        const result = checkEntitlement('correction', tier);
        expect(result.allowed).toBe(tier !== 'free');
      }),
      { numRuns: 100 },
    );
  });

  /**
   * Extended P8: ALL ALWAYS_FREE features are allowed for ANY tier.
   * This generalizes P8 to cover data_deletion and basic_evidence_view as well.
   * **Validates: Requirements 14.2, 14.4**
   */
  test('P8 (extended): all ALWAYS_FREE features are allowed for any tier', () => {
    fc.assert(
      fc.property(alwaysFreeFeatureArb, tierArb, (feature, tier) => {
        const result = checkEntitlement(feature, tier);

        // Iron rule: ALWAYS_FREE items always allowed
        expect(result.allowed).toBe(true);
        expect(result.reason).toBe('always_free');

        // Result shape correctness
        expect(result.feature).toBe(feature);
        expect(result.tier).toBe(tier);
      }),
      { numRuns: 500 },
    );
  });

  /**
   * Verify that ALWAYS_FREE set is consistent with ENTITLEMENTS table:
   * every feature in the ALWAYS_FREE set bypasses tier checks.
   * **Validates: Requirements 14.4**
   */
  test('ALWAYS_FREE features bypass tier check (consistency)', () => {
    fc.assert(
      fc.property(tierArb, (tier) => {
        for (const feature of ALWAYS_FREE) {
          const result = checkEntitlement(feature, tier);
          expect(result.allowed).toBe(true);
        }
      }),
      { numRuns: 100 },
    );
  });
});
