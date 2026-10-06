// packages/core/src/progression/entitlements.test.ts
// Unit tests for the commercial entitlements module

import { describe, test, expect } from 'bun:test';
import {
  checkEntitlement,
  ALWAYS_FREE,
  ENTITLEMENTS,
  type Tier,
  type Feature,
} from './entitlements.js';

// ─────────────────────────────────────────────────────────────
// Entitlement-gated correction rule
// ─────────────────────────────────────────────────────────────

describe('ALWAYS_FREE features', () => {
  const tiers: Tier[] = ['free', 'paid'];
  const alwaysFreeFeatures: Feature[] = ['data_deletion', 'basic_evidence_view'];

  for (const feature of alwaysFreeFeatures) {
    for (const tier of tiers) {
      test(`${feature} is allowed for ${tier} tier`, () => {
        const result = checkEntitlement(feature, tier);
        expect(result.allowed).toBe(true);
        expect(result.reason).toBe('always_free');
      });
    }
  }

  test('ALWAYS_FREE set contains exactly 2 features', () => {
    expect(ALWAYS_FREE.size).toBe(2);
    expect(ALWAYS_FREE.has('correction')).toBe(false);
    expect(ALWAYS_FREE.has('data_deletion')).toBe(true);
    expect(ALWAYS_FREE.has('basic_evidence_view')).toBe(true);
  });
});

describe('correction entitlement', () => {
  test('free tier cannot access correction feedback', () => {
    const result = checkEntitlement('correction', 'free');
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe('tier_insufficient');
  });

  test('paid tier can access correction feedback', () => {
    expect(checkEntitlement('correction', 'paid').allowed).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────
// Tier hierarchy: free < paid
// ─────────────────────────────────────────────────────────────

describe('tier hierarchy', () => {
  test('free tier cannot access paid-tier features', () => {
    const result = checkEntitlement('detailed_analysis', 'free');
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe('tier_insufficient');
  });

  test('free tier cannot access export features', () => {
    const result = checkEntitlement('export_data', 'free');
    expect(result.allowed).toBe(false);
  });

  test('paid tier can access gated features', () => {
    const result = checkEntitlement('detailed_analysis', 'paid');
    expect(result.allowed).toBe(true);
    expect(result.reason).toBe('tier_sufficient');
  });

  test('paid tier can access all paid features', () => {
    const result1 = checkEntitlement('detailed_analysis', 'paid');
    const result2 = checkEntitlement('export_data', 'paid');
    const result3 = checkEntitlement('advanced_insights', 'paid');
    expect(result1.allowed).toBe(true);
    expect(result2.allowed).toBe(true);
    expect(result3.allowed).toBe(true);
  });

  test('paid tier can access stage2 unlock', () => {
    const result = checkEntitlement('stage2_unlock', 'paid');
    expect(result.allowed).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────
// ENTITLEMENTS table consistency
// ─────────────────────────────────────────────────────────────

describe('ENTITLEMENTS table', () => {
  test('all ALWAYS_FREE features have alwaysFree=true in table', () => {
    for (const feature of ALWAYS_FREE) {
      const entry = ENTITLEMENTS.find((e) => e.feature === feature);
      expect(entry).toBeDefined();
      expect(entry!.alwaysFree).toBe(true);
      expect(entry!.minTier).toBe('free');
    }
  });

  test('non-free features have alwaysFree=false', () => {
    const nonFree = ENTITLEMENTS.filter((e) => !ALWAYS_FREE.has(e.feature));
    for (const entry of nonFree) {
      expect(entry.alwaysFree).toBe(false);
    }
  });

  test('table has 7 entries covering all features', () => {
    expect(ENTITLEMENTS.length).toBe(7);
  });
});

// ─────────────────────────────────────────────────────────────
// EntitlementResult shape
// ─────────────────────────────────────────────────────────────

describe('EntitlementResult', () => {
  test('result always contains feature and tier', () => {
    const result = checkEntitlement('correction', 'paid');
    expect(result.feature).toBe('correction');
    expect(result.tier).toBe('paid');
  });
});
