// packages/core/src/reflection/constants.ts
// Shared constants for the Reflection Funnel

export const CORE_DIMENSION_KEYS = [
  'trustBoundaries',
  'conflictResponse',
  'attachment',
  'emotionRegulation',
  'stressResponse',
  'achievementMotivation',
  'selfCognition',
  'socialEnergy',
] as const;

export type DimensionKey = (typeof CORE_DIMENSION_KEYS)[number];

export const VALID_VECTOR_PATCH_KEYS: ReadonlySet<string> = new Set([
  'trust_threshold',
  'boundary_strength',
  'conflict_style',
  'conflict_score',
  'attachment_pattern',
  'attachment_score',
  'emotional_regulation',
  'stress_response',
  'stress_score',
  'achievement_drive',
  'perfectionism_score',
  'selfview_pattern',
  'growth_mindset_score',
  'social_energy_style',
  'social_energy_score',
]);
