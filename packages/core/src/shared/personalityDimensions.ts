export const CORE_DIMENSIONS = [
  "trustBoundaries",
  "conflictResponse",
  "attachment",
  "emotionRegulation",
  "stressResponse",
  "achievementMotivation",
  "selfCognition",
  "socialEnergy",
] as const;

/**
 * EXTENDED_DIMENSIONS are dimension names produced by dynamic-script templates
 * and certain higher-fidelity evidence flows. They are NOT part of the 10-dimension
 * baseline radar but are recorded as evidence_events.dimension values when they fire.
 *
 * NOTE: `trustBoundaries` is intentionally duplicated from CORE_DIMENSIONS (it's
 * already in the 10-dim baseline), so we exclude it from EXTENDED to keep the
 * V15_DIMENSIONS union deduplicated.
 */
export const EXTENDED_DIMENSIONS = [
  "emotionalGranularity",
  "growthOrientation",
  "shameSensitivity",
  "helpSeekingPattern",
  "linguisticExtraversion",
  "narrativeCoherence",
] as const;

export const V15_DIMENSIONS = [
  ...CORE_DIMENSIONS,
  ...EXTENDED_DIMENSIONS,
] as const;

export type PersonalityDimension = typeof V15_DIMENSIONS[number];

export const DIMENSION_META: Record<
  PersonalityDimension,
  { name: string; shortLabel: string; desc: string }
> = {
  trustBoundaries: {
    name: "边界感",
    shortLabel: "BG",
    desc: "和别人相处时会不会保持距离",
  },
  conflictResponse: {
    name: "冲突处理",
    shortLabel: "CF",
    desc: "遇到分歧时怎么回应",
  },
  attachment: {
    name: "关系安全感",
    shortLabel: "RS",
    desc: "对关系稳定性的在意程度",
  },
  emotionRegulation: {
    name: "情绪调节",
    shortLabel: "ER",
    desc: "把情绪拉回来的能力",
  },
  stressResponse: {
    name: "压力应对",
    shortLabel: "SR",
    desc: "压力大时怎么扛住",
  },
  achievementMotivation: {
    name: "目标驱动",
    shortLabel: "GD",
    desc: "做事时愿不愿意往前推",
  },
  selfCognition: {
    name: "自我认知",
    shortLabel: "SC",
    desc: "对自己是否看得清楚",
  },
  socialEnergy: {
    name: "社交能量",
    shortLabel: "SE",
    desc: "社交后是更有劲还是更累",
  },
  emotionalGranularity: {
    name: "情绪识别",
    shortLabel: "EG",
    desc: "能不能分清自己的情绪",
  },
  growthOrientation: {
    name: "成长意愿",
    shortLabel: "GO",
    desc: "愿不愿意调整和改变",
  },
  shameSensitivity: {
    name: "羞耻敏感",
    shortLabel: "SS",
    desc: "面对羞耻感的反应模式",
  },
  helpSeekingPattern: {
    name: "求助模式",
    shortLabel: "HS",
    desc: "愿意/不愿意向他人求助",
  },
  linguisticExtraversion: {
    name: "语言外倾",
    shortLabel: "LE",
    desc: "通过语言表达自我",
  },
  narrativeCoherence: {
    name: "叙事连贯",
    shortLabel: "NC",
    desc: "是否能讲清楚一件事",
  },
};

export const EVIDENCE_SOURCES = [
  "test",
  "chat",
  "diary",
  "user_correction",
  "capture",
] as const;

/**
 * Legacy source tags retained for storage/backward compatibility.
 *
 * Current product interpretation:
 * - test            = assessment / micro-sandbox / calibration evidence
 * - chat            = archived legacy chat evidence only
 * - diary           = legacy diary archive evidence only
 * - user_correction = user correction evidence
 * - capture         = confirmed capture evidence (legacy storage tag for reality flow)
 *
 * New record flow should prefer evidence_kind (`reality` / `decision`) as the
 * authoritative semantic layer instead of relying on source tag names.
 */
export type EvidenceSourceType = typeof EVIDENCE_SOURCES[number];