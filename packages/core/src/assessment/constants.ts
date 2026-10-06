// packages/core/src/assessment/constants.ts
// EVA 全球化第一版结构冻结
// Task 0: 维度 key / locale key / script version / scenario_set 全部冻结
// 后续 PR 不允许自行修改此处，除非经技术负责人确认

import { SUPPORTED_LOCALES, LOCALE_LABELS } from '../shared/locales.js';

// ================================================================
// 1. 维度 keys（UBV EvidenceDimension 对应）
// ================================================================
export const DIMENSION_KEYS = [
  'trustBoundaries',
  'conflictResponse',
  'attachment',
  'emotionRegulation',
  'stressResponse',
  'achievementMotivation',
  'selfCognition',
  'socialEnergy',
  'emotionalGranularity',
  'shameSensitivity',
  'helpSeekingPattern',
  'linguisticExtraversion',
  'narrativeCoherence',
  'growthOrientation',
] as const;

export type FrozenDimensionKey = typeof DIMENSION_KEYS[number];

// NOTE: SUPPORTED_LOCALES and LOCALE_LABELS are now imported from
// packages/core/src/shared/locales.ts (single source of truth)

// ================================================================
// 3. 第一版剧本文案版本号（globalization v1）
// ================================================================
export const CURRENT_SCRIPT_VERSION = '2026-06-v2';
export const CURRENT_SCENARIO_SET = 'global_core_v2';
export const LEGACY_SCENARIO_SET_V1 = 'global_core_v1';
export const CURRENT_MICRO_SCENARIO_SET = 'micro_sandbox_v1';

// ================================================================
// 4. Assessment source type
// ================================================================
export const ASSESSMENT_SOURCE_TYPE = 'test' as const;
