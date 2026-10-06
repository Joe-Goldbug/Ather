// packages/core/src/progression/index.ts
// Progression layer — stage unlock engine and entitlements

export type {
  StageId,
  Stage2Capability,
  Stage3Capability,
  Stage2UnlockInput,
  UnlockResult,
} from './stages.js';
export {
  evaluateStage2Unlock,
  evaluateStage3Unlock,
  STAGE2_MIN_DIMENSIONS,
  STAGE2_MIN_SOURCES,
  STAGE2_MIN_CORRECTIONS,
  STAGE2_MIN_DAYS,
} from './stages.js';

export type {
  Tier,
  Feature,
  Entitlement,
  EntitlementResult,
} from './entitlements.js';
export {
  ALWAYS_FREE,
  ENTITLEMENTS,
  checkEntitlement,
} from './entitlements.js';
