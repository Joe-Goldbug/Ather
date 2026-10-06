// packages/core/src/progression/entitlements.ts
// [S1-active] 商业权益模块
// Defines Tier / Feature / Entitlement rules.
// IMPORTANT:
// Keep this aligned with apps/api AuthService runtime gating. V1 currently has
// only two commercial states: free and paid. If monetization later reintroduces
// basic / premium, add an explicit runtime mapping first.

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

export type Tier = 'free' | 'paid';

export type Feature =
  | 'correction'
  | 'data_deletion'
  | 'basic_evidence_view'
  | 'detailed_analysis'
  | 'stage2_unlock'
  | 'export_data'
  | 'advanced_insights';

export interface Entitlement {
  feature: Feature;
  minTier: Tier;
  alwaysFree: boolean;
}

export interface EntitlementResult {
  allowed: boolean;
  feature: Feature;
  tier: Tier;
  reason?: string;
}

// ─────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────

/** Tier hierarchy: free < paid */
const TIER_RANK: Readonly<Record<Tier, number>> = {
  free: 0,
  paid: 1,
};

/** Features that are available to all tiers. */
export const ALWAYS_FREE: ReadonlySet<Feature> = new Set<Feature>([
  'data_deletion',
  'basic_evidence_view',
]);

/** Full entitlements table */
export const ENTITLEMENTS: readonly Entitlement[] = [
  { feature: 'correction', minTier: 'paid', alwaysFree: false },
  { feature: 'data_deletion', minTier: 'free', alwaysFree: true },
  { feature: 'basic_evidence_view', minTier: 'free', alwaysFree: true },
  { feature: 'detailed_analysis', minTier: 'paid', alwaysFree: false },
  { feature: 'stage2_unlock', minTier: 'paid', alwaysFree: false },
  { feature: 'export_data', minTier: 'paid', alwaysFree: false },
  { feature: 'advanced_insights', minTier: 'paid', alwaysFree: false },
];

// ─────────────────────────────────────────────────────────────
// Core logic
// ─────────────────────────────────────────────────────────────

/**
 * Check if a feature is allowed for a given tier.
 * ALWAYS_FREE items bypass tier check and always return allowed=true.
 *
 * Postcondition: if feature ∈ ALWAYS_FREE → allowed === true (regardless of tier)
 * Postcondition: if feature ∉ ALWAYS_FREE → allowed === (tierRank >= minTierRank)
 */
export function checkEntitlement(feature: Feature, tier: Tier): EntitlementResult {
  // Universally available features bypass tier checks.
  if (ALWAYS_FREE.has(feature)) {
    return {
      allowed: true,
      feature,
      tier,
      reason: 'always_free',
    };
  }

  // Look up the entitlement definition
  const entitlement = ENTITLEMENTS.find((e) => e.feature === feature);

  if (!entitlement) {
    return {
      allowed: false,
      feature,
      tier,
      reason: 'unknown_feature',
    };
  }

  // Compare tier hierarchy
  const userRank = TIER_RANK[tier];
  const requiredRank = TIER_RANK[entitlement.minTier];
  const allowed = userRank >= requiredRank;

  return {
    allowed,
    feature,
    tier,
    reason: allowed ? 'tier_sufficient' : 'tier_insufficient',
  };
}
