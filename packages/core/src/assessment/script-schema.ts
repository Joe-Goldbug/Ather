// packages/core/src/assessment/script-schema.ts
// Task 13: Schema/copy split
// Pure measurement structure — NO language, no text content.
// Each scenario's `id` / `dimension` / `measurementIntent` / `vectorPatch` are
// invariant across locales. Only the display text lives in script-copy.ts.

// Locale is imported (not re-exported) — consumers should import from '../shared/locales'
import type { Locale } from '../shared/locales.js';
import type {
  ChoiceOption,
  ConflictStyle, AttachmentPattern, EmotionalRegulation,
  StressResponse, AchievementDrive, SelfViewPattern, SocialEnergyStyle,
  PersonalityVector,
} from '../shared/types.js';

export interface ChoiceVectorPatch {
  trust_threshold?: number;
  boundary_strength?: number;
  conflict_style?: ConflictStyle;
  conflict_score?: number;
  attachment_pattern?: AttachmentPattern;
  attachment_score?: number;
  emotional_regulation?: EmotionalRegulation;
  stress_response?: StressResponse;
  stress_score?: number;
  achievement_drive?: AchievementDrive;
  perfectionism_score?: number;
  selfview_pattern?: SelfViewPattern;
  growth_mindset_score?: number;
  social_energy_style?: SocialEnergyStyle;
  social_energy_score?: number;
}

/**
 * Expected measurement direction for a single choice option.
 * Used in contract tests and prompt-generation to verify signal quality.
 *   high      → strong positive signal on primary dimension
 *   mid-high  → moderate positive signal
 *   mid-low   → moderate negative / low signal
 *   low       → strong negative / avoidant signal
 */
export type ExpectedSignal = 'high' | 'mid-high' | 'mid-low' | 'low';

/** Pure schema for one scenario — language-agnostic */
export interface ScenarioSchema {
  id: string;
  /** Which UBV dimension this scenario primarily measures */
  dimension: string;
  /** Secondary dimension also affected by this scenario (at most one). */
  secondary_dimension?: string;
  /** Why this scenario taps the dimension (for prompt generation / debugging) */
  measurementIntent: string;
  /**
   * Known confounding factors that may distort the signal.
   * e.g. ['social_desirability', 'cultural_context', 'fatigue']
   */
  confounders: string[];
  /**
   * True if this scenario is scored in reverse (high choice = low trait value).
   * Used by the aggregator to flip delta direction before combining.
   */
  reverse_scored: boolean;
  /**
   * True if this is an attention-check item.
   * An obvious "correct" answer exists; flagging users who miss it.
   */
  attention_check: boolean;
  /**
   * Expected signal direction per choice option on the PRIMARY dimension.
   * Drives contract tests — deviations indicate a scoring bug.
   */
  expected_signal: Record<ChoiceOption, ExpectedSignal>;
  /** How each choice option shifts the personality vector */
  vector_patch: Record<ChoiceOption, ChoiceVectorPatch>;
  /** [S1] Whether this scenario allows free-text supplementary option. Default false. */
  allow_free_text?: boolean;
  /** [S1] True when this question is answered only by free-text and is excluded from scoring. */
  input_only?: boolean;
  /** [S1] free-text default dimension (usually = dimension) */
  free_text_dimension?: string;
}

export const SCENARIO_SCHEMAS: ScenarioSchema[] = [
  // ── Scenario 1: Trust Boundaries ────────────────────────────────
  {
    id: 'trust',
    dimension: 'trustBoundaries',
    secondary_dimension: 'attachment',
    measurementIntent: 'reaction_to_ambiguous_intimacy',
    confounders: ['social_desirability', 'cultural_collectivism'],
    reverse_scored: false,
    attention_check: false,
    expected_signal: { A: 'low', B: 'mid-high', C: 'mid-low', D: 'high' },
    vector_patch: {
      A: { trust_threshold: 0.90, boundary_strength: 0.90 },
      B: { trust_threshold: 0.45, boundary_strength: 0.45 },
      C: { trust_threshold: 0.65, boundary_strength: 0.72 },
      D: { trust_threshold: 0.18, boundary_strength: 0.22 },
    },
    allow_free_text: false,
  },
  // ── Scenario 2: Conflict Response ───────────────────────────
  {
    id: 'conflict',
    dimension: 'conflictResponse',
    measurementIntent: 'public_challenge_and_face_threat',
    confounders: ['face_culture', 'power_differential', 'fatigue'],
    reverse_scored: false,
    attention_check: false,
    expected_signal: { A: 'low', B: 'high', C: 'mid-high', D: 'low' },
    vector_patch: {
      A: { conflict_style: 'avoidant', conflict_score: 0.20 },
      B: { conflict_style: 'confrontational', conflict_score: 0.90 },
      C: { conflict_style: 'analytical', conflict_score: 0.60 },
      D: { conflict_style: 'escapist', conflict_score: 0.08 },
    },
    allow_free_text: false,
  },
  // ── Scenario 3: Attachment Pattern ─────────────────────────
  {
    id: 'attachment',
    dimension: 'attachment',
    measurementIntent: 'interpretation_of_unexplained_rejection',
    confounders: ['recent_relationship_stress', 'trauma_history'],
    reverse_scored: false,
    attention_check: false,
    expected_signal: { A: 'high', B: 'low', C: 'mid-low', D: 'mid-high' },
    vector_patch: {
      A: { attachment_pattern: 'secure', attachment_score: 0.85 },
      B: { attachment_pattern: 'anxious', attachment_score: 0.22 },
      C: { attachment_pattern: 'avoidant', attachment_score: 0.55 },
      D: { attachment_pattern: 'validating', attachment_score: 0.60 },
    },
    allow_free_text: false,
  },
  // ── Scenario 4: Emotion Regulation ──────────────────────────
  {
    id: 'emotion',
    dimension: 'emotionRegulation',
    measurementIntent: 'response_to_self_attributed_failure',
    confounders: ['depression_state', 'self_esteem', 'social_context'],
    reverse_scored: false,
    attention_check: false,
    expected_signal: { A: 'low', B: 'mid-low', C: 'high', D: 'mid-high' },
    vector_patch: {
      A: { emotional_regulation: 'internalizing' },
      B: { emotional_regulation: 'externalizing' },
      C: { emotional_regulation: 'rational' },
      D: { emotional_regulation: 'deflecting' },
    },
    allow_free_text: false,
  },
  // ── Scenario 5: Stress Response ──────────────────────────────
  {
    id: 'stress',
    dimension: 'stressResponse',
    secondary_dimension: 'emotionRegulation',
    measurementIntent: 'sleep_deprived_high_stakes_cognitive_load',
    confounders: ['chronic_stress_baseline', 'coping_skill_training'],
    reverse_scored: false,
    attention_check: false,
    expected_signal: { A: 'low', B: 'low', C: 'mid-high', D: 'high' },
    vector_patch: {
      A: { stress_response: 'rumination', stress_score: 0.85 },
      B: { stress_response: 'activation', stress_score: 0.92 },
      C: { stress_response: 'suppression', stress_score: 0.45 },
      D: { stress_response: 'mindfulness', stress_score: 0.18 },
    },
    allow_free_text: false,
  },
  // ── Scenario 6: Achievement Motivation ─────────────────────
  {
    id: 'achievement',
    dimension: 'achievementMotivation',
    secondary_dimension: 'selfCognition',
    measurementIntent: 'imperfect_deliverable_under_time_pressure',
    confounders: ['job_role_expectations', 'team_culture', 'deadline_proximity'],
    reverse_scored: false,
    attention_check: false,
    expected_signal: { A: 'high', B: 'mid-high', C: 'low', D: 'mid-low' },
    vector_patch: {
      A: { achievement_drive: 'high_standards', perfectionism_score: 0.92 },
      B: { achievement_drive: 'recognition_seeking', perfectionism_score: 0.65 },
      C: { achievement_drive: 'avoidance', perfectionism_score: 0.25 },
      D: { achievement_drive: 'flow_state', perfectionism_score: 0.50 },
    },
    allow_free_text: false,
  },
  // ── Scenario 7: Self-Cognition ───────────────────────────────
  {
    id: 'selfview',
    dimension: 'selfCognition',
    measurementIntent: 'reaction_to_public_identity_challenge',
    confounders: ['audience_size', 'power_status', 'topic_importance'],
    reverse_scored: false,
    attention_check: false,
    expected_signal: { A: 'high', B: 'low', C: 'mid-low', D: 'mid-high' },
    vector_patch: {
      A: { selfview_pattern: 'growth_minded', growth_mindset_score: 0.88 },
      B: { selfview_pattern: 'fixed_identity', growth_mindset_score: 0.20 },
      C: { selfview_pattern: 'performative', growth_mindset_score: 0.45 },
      D: { selfview_pattern: 'ambivalent', growth_mindset_score: 0.55 },
    },
    allow_free_text: false,
  },
  // ── Scenario 8: Social Energy ───────────────────────────────
  {
    id: 'socialenergy',
    dimension: 'socialEnergy',
    measurementIntent: 'energy_state_after_prolonged_aloneness_confronting_social_invitation',
    confounders: ['introversion_stereotype', 'social_anxiety', 'current_energy_state'],
    reverse_scored: false,
    attention_check: false,
    expected_signal: { A: 'high', B: 'mid-low', C: 'low', D: 'mid-high' },
    vector_patch: {
      A: { social_energy_style: 'energy_giving', social_energy_score: 0.88 },
      B: { social_energy_style: 'energy_draining', social_energy_score: 0.35 },
      C: { social_energy_style: 'selective', social_energy_score: 0.22 },
      D: { social_energy_style: 'adaptive', social_energy_score: 0.60 },
    },
    allow_free_text: false,
  },
  // ================================================================
  // V2 Scenarios 9-14: Contrast, Motive Probes, Reality Input
  // Part of the 14-question baseline (global_core_v2)
  // ================================================================

  // ── Scenario 9: Conflict Contrast (vs #5 — friend instead of authority) ──
  {
    id: 'conflict_friend',
    dimension: 'conflictResponse',
    secondary_dimension: 'attachment',
    measurementIntent: 'conflict_response_with_close_friend_vs_authority_contrast',
    confounders: ['friendship_closeness', 'conflict_history', 'mood'],
    reverse_scored: false,
    attention_check: false,
    expected_signal: { A: 'low', B: 'high', C: 'mid-high', D: 'low' },
    vector_patch: {
      A: { conflict_style: 'avoidant', conflict_score: 0.25 },
      B: { conflict_style: 'confrontational', conflict_score: 0.82 },
      C: { conflict_style: 'analytical', conflict_score: 0.55 },
      D: { conflict_style: 'escapist', conflict_score: 0.12 },
    },
    allow_free_text: false,
  },
  // ── Scenario 10: Stress Contrast (chronic meaninglessness vs acute overload) ──
  {
    id: 'stress_chronic',
    dimension: 'stressResponse',
    secondary_dimension: 'achievementMotivation',
    measurementIntent: 'chronic_meaninglessness_coping_vs_acute_overload_contrast',
    confounders: ['burnout_level', 'life_stage', 'financial_pressure'],
    reverse_scored: false,
    attention_check: false,
    expected_signal: { A: 'low', B: 'high', C: 'mid-high', D: 'low' },
    vector_patch: {
      A: { stress_response: 'activation', stress_score: 0.75 },
      B: { stress_response: 'mindfulness', stress_score: 0.30 },
      C: { stress_response: 'suppression', stress_score: 0.42 },
      D: { stress_response: 'rumination', stress_score: 0.82 },
    },
    allow_free_text: false,
  },
  // ── Scenario 11: Social Energy under Low State (contrast with #8) ──
  {
    id: 'social_lowenergy',
    dimension: 'socialEnergy',
    secondary_dimension: 'attachment',
    measurementIntent: 'social_response_under_depleted_energy_state_close_friend',
    confounders: ['current_energy_state', 'relationship_closeness', 'social_anxiety'],
    reverse_scored: false,
    attention_check: false,
    expected_signal: { A: 'high', B: 'mid-low', C: 'low', D: 'mid-high' },
    vector_patch: {
      A: { social_energy_style: 'energy_giving', social_energy_score: 0.88 },
      B: { social_energy_style: 'energy_draining', social_energy_score: 0.35 },
      C: { social_energy_style: 'selective', social_energy_score: 0.22 },
      D: { social_energy_style: 'adaptive', social_energy_score: 0.60 },
    },
    allow_free_text: false,
  },
  // ── Scenario 12: Motive Probe — Why silence/yielding ──
  {
    id: 'motive_silence',
    dimension: 'conflictResponse',
    secondary_dimension: 'emotionRegulation',
    measurementIntent: 'motive_behind_silence_or_yielding_behavior',
    confounders: ['social_desirability', 'self_insight_accuracy', 'current_mood'],
    reverse_scored: false,
    attention_check: false,
    expected_signal: { A: 'mid-high', B: 'low', C: 'mid-low', D: 'high' },
    vector_patch: {
      A: { conflict_style: 'analytical', conflict_score: 0.60 },
      B: { conflict_style: 'avoidant', conflict_score: 0.20 },
      C: { conflict_style: 'analytical', conflict_score: 0.50 },
      D: { conflict_style: 'analytical', conflict_score: 0.70 },
    },
    allow_free_text: false,
  },
  // ── Scenario 13: Motive Probe — Social participation decision ──
  {
    id: 'motive_social',
    dimension: 'socialEnergy',
    secondary_dimension: 'selfCognition',
    measurementIntent: 'motive_behind_social_participation_or_avoidance',
    confounders: ['social_anxiety', 'current_energy', 'event_type'],
    reverse_scored: false,
    attention_check: false,
    expected_signal: { A: 'mid-low', B: 'mid-low', C: 'mid-high', D: 'low' },
    vector_patch: {
      A: { social_energy_style: 'energy_draining', social_energy_score: 0.35 },
      B: { social_energy_style: 'energy_draining', social_energy_score: 0.30, attachment_score: 0.40 },
      C: { social_energy_style: 'selective', social_energy_score: 0.55 },
      D: { social_energy_style: 'energy_draining', social_energy_score: 0.28, boundary_strength: 0.30 },
    },
    allow_free_text: false,
  },
  // ── Scenario 14: Reality Input — refused boundary event ──
  {
    id: 'reality_refuse',
    dimension: 'trustBoundaries',
    secondary_dimension: 'attachment',
    measurementIntent: 'real_life_boundary_failure_event_collection',
    confounders: ['recall_bias', 'social_desirability', 'recency_effect'],
    reverse_scored: false,
    attention_check: false,
    // Reality input has no fixed choice options — LLM analyzes free text
    // These are placeholder signals for the schema contract
    expected_signal: { A: 'mid-high', B: 'mid-low', C: 'low', D: 'high' },
    vector_patch: {
      A: { trust_threshold: 0.50, boundary_strength: 0.50 },
      B: { trust_threshold: 0.60, boundary_strength: 0.55 },
      C: { trust_threshold: 0.70, boundary_strength: 0.65 },
      D: { trust_threshold: 0.40, boundary_strength: 0.45 },
    },
    allow_free_text: true,
    input_only: true,
    free_text_dimension: 'trustBoundaries',
  },
];

export const SCORED_SCENARIO_SCHEMAS = SCENARIO_SCHEMAS.filter(
  (schema) => schema.input_only !== true,
);

export const SCORED_SCENARIO_IDS = SCORED_SCENARIO_SCHEMAS.map((schema) => schema.id);

// ================================================================
// Supplementary Schemas — 2 per dimension, NOT part of main flow
// Used for follow-up / deep-dive assessment.
// Acceptance criteria: each core dimension ≥ 3 total questions,
//   ≥ 2 reverse_scored, ≥ 1 attention_check across ALL_SCENARIO_SCHEMAS.
// ================================================================

export const SUPPLEMENTARY_SCHEMAS: ScenarioSchema[] = [
  // ── Trust 2: professional vulnerability ─────────────────────────
  {
    id: 'trust_2',
    dimension: 'trustBoundaries',
    measurementIntent: 'response_to_professional_emotional_disclosure',
    confounders: ['workplace_norms', 'hierarchy_distance', 'social_desirability'],
    reverse_scored: false,
    attention_check: false,
    expected_signal: { A: 'high', B: 'mid-high', C: 'mid-low', D: 'low' },
    vector_patch: {
      A: { trust_threshold: 0.20, boundary_strength: 0.25 },
      B: { trust_threshold: 0.48, boundary_strength: 0.52 },
      C: { trust_threshold: 0.70, boundary_strength: 0.75 },
      D: { trust_threshold: 0.88, boundary_strength: 0.90 },
    },
  },
  // ── Trust Reverse: habitual self-disclosure level (reverse_scored) ─
  {
    id: 'trust_r',
    dimension: 'trustBoundaries',
    measurementIntent: 'habitual_self_disclosure_level_in_new_relationships',
    confounders: ['social_desirability', 'extroversion_overlap', 'cultural_context'],
    reverse_scored: true,
    attention_check: false,
    expected_signal: { A: 'high', B: 'mid-high', C: 'mid-low', D: 'low' },
    vector_patch: {
      A: { trust_threshold: 0.15, boundary_strength: 0.18 },
      B: { trust_threshold: 0.42, boundary_strength: 0.50 },
      C: { trust_threshold: 0.68, boundary_strength: 0.72 },
      D: { trust_threshold: 0.92, boundary_strength: 0.92 },
    },
  },
  // ── Conflict 2: private text blame ──────────────────────────────
  {
    id: 'conflict_2',
    dimension: 'conflictResponse',
    secondary_dimension: 'attachment',
    measurementIntent: 'response_to_private_unfair_blame_via_text',
    confounders: ['relationship_closeness', 'medium_effect', 'recency_stress'],
    reverse_scored: false,
    attention_check: false,
    expected_signal: { A: 'low', B: 'high', C: 'mid-high', D: 'low' },
    vector_patch: {
      A: { conflict_style: 'avoidant', conflict_score: 0.18 },
      B: { conflict_style: 'confrontational', conflict_score: 0.88 },
      C: { conflict_style: 'analytical', conflict_score: 0.62 },
      D: { conflict_style: 'escapist', conflict_score: 0.10 },
    },
  },
  // ── Conflict Reverse: emotional aftermath of winning (reverse_scored) ─
  {
    id: 'conflict_r',
    dimension: 'conflictResponse',
    measurementIntent: 'emotional_aftermath_of_winning_confrontation',
    confounders: ['power_sensitivity', 'relationship_type', 'winning_style'],
    reverse_scored: true,
    attention_check: false,
    expected_signal: { A: 'high', B: 'mid-high', C: 'mid-low', D: 'low' },
    vector_patch: {
      A: { conflict_style: 'confrontational', conflict_score: 0.88 },
      B: { conflict_style: 'analytical', conflict_score: 0.65 },
      C: { conflict_style: 'avoidant', conflict_score: 0.30 },
      D: { conflict_style: 'escapist', conflict_score: 0.12 },
    },
  },
  // ── Attachment 2: slow friendship drift ─────────────────────────
  {
    id: 'attachment_2',
    dimension: 'attachment',
    measurementIntent: 'response_to_slow_relationship_drift_without_clear_trigger',
    confounders: ['life_stage_transitions', 'introversion', 'busyness_attribution'],
    reverse_scored: false,
    attention_check: false,
    expected_signal: { A: 'high', B: 'low', C: 'mid-low', D: 'mid-high' },
    vector_patch: {
      A: { attachment_pattern: 'secure', attachment_score: 0.82 },
      B: { attachment_pattern: 'anxious', attachment_score: 0.25 },
      C: { attachment_pattern: 'avoidant', attachment_score: 0.52 },
      D: { attachment_pattern: 'validating', attachment_score: 0.62 },
    },
  },
  // ── Attachment Attention Check: benign absence ──────────────────
  // D is the obvious secure/pass response.
  {
    id: 'attachment_attn',
    dimension: 'attachment',
    measurementIntent: 'attention_check_benign_absence_interpretation',
    confounders: [],
    reverse_scored: false,
    attention_check: true,
    expected_signal: { A: 'mid-high', B: 'low', C: 'mid-low', D: 'high' },
    vector_patch: {
      A: { attachment_pattern: 'validating', attachment_score: 0.65 },
      B: { attachment_pattern: 'anxious', attachment_score: 0.15 },
      C: { attachment_pattern: 'avoidant', attachment_score: 0.50 },
      D: { attachment_pattern: 'secure', attachment_score: 0.90 },
    },
  },
  // ── Emotion 2: positive affect regulation ───────────────────────
  {
    id: 'emotion_2',
    dimension: 'emotionRegulation',
    measurementIntent: 'regulation_of_unexpected_positive_affect',
    confounders: ['hedonic_baseline', 'superstition_beliefs', 'cultural_modesty'],
    reverse_scored: false,
    attention_check: false,
    expected_signal: { A: 'mid-low', B: 'low', C: 'high', D: 'mid-high' },
    vector_patch: {
      A: { emotional_regulation: 'deflecting' },
      B: { emotional_regulation: 'internalizing' },
      C: { emotional_regulation: 'rational' },
      D: { emotional_regulation: 'externalizing' },
    },
  },
  // ── Emotion Reverse: others' perception of emotional expression ──
  {
    id: 'emotion_r',
    dimension: 'emotionRegulation',
    measurementIntent: 'external_perception_of_own_emotional_expression',
    confounders: ['display_rules', 'cultural_norms', 'social_role'],
    reverse_scored: true,
    attention_check: false,
    expected_signal: { A: 'low', B: 'mid-low', C: 'mid-high', D: 'high' },
    vector_patch: {
      A: { emotional_regulation: 'internalizing' },
      B: { emotional_regulation: 'deflecting' },
      C: { emotional_regulation: 'externalizing' },
      D: { emotional_regulation: 'rational' },
    },
  },
  // ── Stress 2: competing deadlines triage ────────────────────────
  {
    id: 'stress_2',
    dimension: 'stressResponse',
    measurementIntent: 'triage_strategy_under_competing_simultaneous_demands',
    confounders: ['task_type_preference', 'perfectionism', 'role_clarity'],
    reverse_scored: false,
    attention_check: false,
    expected_signal: { A: 'low', B: 'mid-low', C: 'high', D: 'mid-high' },
    vector_patch: {
      A: { stress_response: 'rumination', stress_score: 0.82 },
      B: { stress_response: 'activation', stress_score: 0.78 },
      C: { stress_response: 'mindfulness', stress_score: 0.22 },
      D: { stress_response: 'suppression', stress_score: 0.50 },
    },
  },
  // ── Stress Recovery: decompression strategy ─────────────────────
  {
    id: 'stress_rec',
    dimension: 'stressResponse',
    secondary_dimension: 'socialEnergy',
    measurementIntent: 'recovery_strategy_after_sustained_high_pressure_period',
    confounders: ['introversion_overlap', 'physical_health', 'access_to_resources'],
    reverse_scored: false,
    attention_check: false,
    expected_signal: { A: 'high', B: 'mid-high', C: 'mid-low', D: 'low' },
    vector_patch: {
      A: { stress_response: 'mindfulness', stress_score: 0.15 },
      B: { stress_response: 'suppression', stress_score: 0.40 },
      C: { stress_response: 'activation', stress_score: 0.72 },
      D: { stress_response: 'rumination', stress_score: 0.88 },
    },
  },
  // ── Achievement 2: peer advancement social comparison ───────────
  {
    id: 'achievement_2',
    dimension: 'achievementMotivation',
    secondary_dimension: 'selfCognition',
    measurementIntent: 'response_to_peer_advancement_social_comparison',
    confounders: ['relationship_to_peer', 'industry_norms', 'role_similarity'],
    reverse_scored: false,
    attention_check: false,
    expected_signal: { A: 'mid-high', B: 'high', C: 'low', D: 'mid-low' },
    vector_patch: {
      A: { achievement_drive: 'recognition_seeking', perfectionism_score: 0.68 },
      B: { achievement_drive: 'high_standards', perfectionism_score: 0.88 },
      C: { achievement_drive: 'avoidance', perfectionism_score: 0.22 },
      D: { achievement_drive: 'flow_state', perfectionism_score: 0.48 },
    },
  },
  // ── Achievement Alt: internalized definition of success ──────────
  {
    id: 'achievement_alt',
    dimension: 'achievementMotivation',
    measurementIntent: 'internalized_definition_of_personal_success',
    confounders: ['life_stage', 'cultural_success_scripts', 'current_mood'],
    reverse_scored: false,
    attention_check: false,
    expected_signal: { A: 'high', B: 'mid-high', C: 'mid-low', D: 'low' },
    vector_patch: {
      A: { achievement_drive: 'high_standards', perfectionism_score: 0.90 },
      B: { achievement_drive: 'recognition_seeking', perfectionism_score: 0.62 },
      C: { achievement_drive: 'flow_state', perfectionism_score: 0.50 },
      D: { achievement_drive: 'avoidance', perfectionism_score: 0.20 },
    },
  },
  // ── Self-Cognition 2: spontaneous self-presentation ─────────────
  {
    id: 'selfview_2',
    dimension: 'selfCognition',
    measurementIntent: 'spontaneous_self_presentation_without_external_challenge',
    confounders: ['social_anxiety', 'context_appropriateness', 'mood'],
    reverse_scored: false,
    attention_check: false,
    expected_signal: { A: 'mid-high', B: 'low', C: 'high', D: 'mid-low' },
    vector_patch: {
      A: { selfview_pattern: 'performative', growth_mindset_score: 0.50 },
      B: { selfview_pattern: 'fixed_identity', growth_mindset_score: 0.22 },
      C: { selfview_pattern: 'growth_minded', growth_mindset_score: 0.85 },
      D: { selfview_pattern: 'ambivalent', growth_mindset_score: 0.42 },
    },
  },
  // ── Self-Cognition Alt: response to sincere compliment ────────────
  {
    id: 'selfview_alt',
    dimension: 'selfCognition',
    measurementIntent: 'response_to_sincere_external_positive_feedback',
    confounders: ['imposter_syndrome', 'cultural_modesty', 'source_credibility'],
    reverse_scored: false,
    attention_check: false,
    expected_signal: { A: 'high', B: 'mid-low', C: 'low', D: 'mid-high' },
    vector_patch: {
      A: { selfview_pattern: 'growth_minded', growth_mindset_score: 0.82 },
      B: { selfview_pattern: 'ambivalent', growth_mindset_score: 0.48 },
      C: { selfview_pattern: 'fixed_identity', growth_mindset_score: 0.20 },
      D: { selfview_pattern: 'performative', growth_mindset_score: 0.58 },
    },
  },
  // ── Social Energy 2: mandatory team building event ───────────────
  {
    id: 'socialenergy_2',
    dimension: 'socialEnergy',
    measurementIntent: 'response_to_obligatory_structured_group_social_event',
    confounders: ['workplace_culture', 'relationship_with_colleagues', 'activity_type'],
    reverse_scored: false,
    attention_check: false,
    expected_signal: { A: 'high', B: 'mid-high', C: 'low', D: 'mid-low' },
    vector_patch: {
      A: { social_energy_style: 'energy_giving', social_energy_score: 0.85 },
      B: { social_energy_style: 'adaptive', social_energy_score: 0.62 },
      C: { social_energy_style: 'selective', social_energy_score: 0.20 },
      D: { social_energy_style: 'energy_draining', social_energy_score: 0.32 },
    },
  },
  // ── Social Energy Recovery: after positive stranger interaction ──
  {
    id: 'socialenergy_rec',
    dimension: 'socialEnergy',
    measurementIntent: 'subjective_energy_after_positive_unplanned_social_interaction',
    confounders: ['interaction_quality_bias', 'introversion_overlap', 'fatigue_level'],
    reverse_scored: false,
    attention_check: false,
    expected_signal: { A: 'low', B: 'mid-low', C: 'high', D: 'mid-high' },
    vector_patch: {
      A: { social_energy_style: 'energy_draining', social_energy_score: 0.30 },
      B: { social_energy_style: 'selective', social_energy_score: 0.42 },
      C: { social_energy_style: 'energy_giving', social_energy_score: 0.90 },
      D: { social_energy_style: 'adaptive', social_energy_score: 0.65 },
    },
  },
];

/**
 * All schemas combined (main 8 + 16 supplementary).
 * Use for coverage validation: every core dimension should have ≥ 3 entries.
 */
export const ALL_SCENARIO_SCHEMAS: ScenarioSchema[] = [
  ...SCENARIO_SCHEMAS,
  ...SUPPLEMENTARY_SCHEMAS,
];

// ================================================================
// Archetypes — all 8 archetypes with localized labels per locale
// ================================================================

export interface ArchetypeDef {
  id: string;
  label: Record<Locale, string>;
  headline: Record<Locale, string>;
  description: Record<Locale, string>;
  cta: Record<Locale, string>;
  score_rules: Array<(v: PersonalityVector) => number>;
}

export const ARCHETYPES: ArchetypeDef[] = [
  {
    id: 'boundary_guard',
    label: {
      'zh-CN': '边界守门人',
      en: 'Boundary Gatekeeper',
      ja: '境界番人',
      es: 'Guardián de Límites',
    },
    headline: {
      'zh-CN': '你守护的，比你说出来的多得多',
      en: 'You guard more than you reveal',
      ja: '守るものは、言葉にするよりずっと多い',
      es: 'Guardas más de lo que dices',
    },
    description: {
      'zh-CN': '高度自我保护，清晰边界，冲突时选择退步——不是软弱，是策略。',
      en: 'Highly self-protective with clear boundaries. Backing down in conflict is strategy, not weakness.',
      ja: '高度な自己防衛と明確な境界線。衝突時の撤退は戦略であり、弱さではない。',
      es: 'Altamente autoprotegido con límites claros. Retirarse en el conflicto es estrategia, no debilidad.',
    },
    cta: {
      'zh-CN': '测测你是哪种性格决策者？',
      en: 'Discover your personality type',
      ja: 'あなたの性格タイプを診断',
      es: 'Descubre tu tipo de personalidad',
    },
    score_rules: [
      (v) => (v.trust_threshold > 0.7 ? 3 : 0),
      (v) => (v.boundary_strength > 0.7 ? 2 : 0),
      (v) => (v.conflict_style === 'avoidant' || v.conflict_style === 'escapist' ? 2 : 0),
      (v) => (v.emotional_regulation === 'internalizing' ? 1 : 0),
    ],
  },
  {
    id: 'rational_explorer',
    label: {
      'zh-CN': '理性拆解者',
      en: 'Rational Dissector',
      ja: '理性分解者',
      es: 'Diseccionador Racional',
    },
    headline: {
      'zh-CN': '你用脑子感受世界',
      en: 'You feel the world through your mind',
      ja: '理智で世界を感受する',
      es: 'Sientes el mundo a través de tu mente',
    },
    description: {
      'zh-CN': '低设防、高分析，面对混乱时你的第一反应是理解而不是逃跑。',
      en: 'Low defenses, high analysis. Your first instinct under chaos is to understand, not escape.',
      ja: '防御は低く、分析力が高い。混乱状況で最初にするのは理解しようとすること。',
      es: 'Defensas bajas, alta capacidad de análisis. Tu primer instinto ante el caos es entender, no huir.',
    },
    cta: {
      'zh-CN': '测测你是哪种性格决策者？',
      en: 'Discover your personality type',
      ja: 'あなたの性格タイプを診断',
      es: 'Descubre tu tipo de personalidad',
    },
    score_rules: [
      (v) => (v.trust_threshold < 0.4 ? 2 : 0),
      (v) => (v.conflict_style === 'analytical' ? 3 : 0),
      (v) => (v.emotional_regulation === 'rational' ? 2 : 0),
      (v) => (v.attachment_pattern === 'secure' || v.attachment_pattern === 'validating' ? 1 : 0),
    ],
  },
  {
    id: 'secure_connector',
    label: {
      'zh-CN': '稳态连接者',
      en: 'Stable Connector',
      ja: '安定接続者',
      es: 'Conector Estable',
    },
    headline: {
      'zh-CN': '你是少数真正能让别人放松的人',
      en: "You're one of the few who truly lets people relax",
      ja: '人を本当にリラックスさせることができる数少ない一人',
      es: 'Eres de los pocos que realmente permite a otros relajarse',
    },
    description: {
      'zh-CN': '互惠型信任＋安全依恋，你让关系自然流动，不用代价换连接。',
      en: 'Reciprocal trust meets secure attachment. You let relationships flow naturally.',
      ja: '相互信頼と安全愛着。関係を自然に流すことができる。',
      es: 'Confianza recíproca y apego seguro. Dejas que las relaciones fluyan naturalmente.',
    },
    cta: {
      'zh-CN': '测测你是哪种性格决策者？',
      en: 'Discover your personality type',
      ja: 'あなたの性格タイプを診断',
      es: 'Descubre tu tipo de personalidad',
    },
    score_rules: [
      (v) => (v.trust_threshold > 0.3 && v.trust_threshold < 0.65 ? 2 : 0),
      (v) => (v.attachment_pattern === 'secure' ? 3 : 0),
      (v) => (v.emotional_regulation === 'externalizing' ? 2 : 0),
      (v) => (v.conflict_style === 'analytical' ? 1 : 0),
    ],
  },
  {
    id: 'silent_observer',
    label: {
      'zh-CN': '静默观察者',
      en: 'Silent Observer',
      ja: '静かな観察者',
      es: 'Observador Silencioso',
    },
    headline: {
      'zh-CN': '你看得比大多数人深，但说得比大多数人少',
      en: 'You see deeper than most, speak less than most',
      ja: '大多数より深く見るが，大多数より少なく語る',
      es: 'Ves más profundo que la mayoría, hablas menos que la mayoría',
    },
    description: {
      'zh-CN': '高边界、内化处理，你的距离感不是冷漠，是一种保护机制。',
      en: 'High boundaries, internal processing. Your distance is a protection mechanism, not coldness.',
      ja: '高い境界線と内面化処理。距離感は冷漠ではなく、自己防衛の仕組み。',
      es: 'Límites altos, procesamiento interno. Tu distancia es protección, no frialdad.',
    },
    cta: {
      'zh-CN': '测测你是哪种性格决策者？',
      en: 'Discover your personality type',
      ja: 'あなたの性格タイプを診断',
      es: 'Descubre tu tipo de personalidad',
    },
    score_rules: [
      (v) => (v.boundary_strength > 0.6 && v.trust_threshold > 0.5 && v.trust_threshold < 0.85 ? 2 : 0),
      (v) => (v.conflict_style === 'avoidant' ? 2 : 0),
      (v) => (v.emotional_regulation === 'internalizing' ? 2 : 0),
      (v) => (v.attachment_pattern === 'avoidant' ? 2 : 0),
    ],
  },
  {
    id: 'sensitive_resonator',
    label: {
      'zh-CN': '高敏共振者',
      en: 'High-Sensitivity Resonator',
      ja: '高感度共鳴者',
      es: 'Resonador Hipersensible',
    },
    headline: {
      'zh-CN': '你感受到的，比别人想象的要多',
      en: 'You feel more than most people realize',
      ja: '、あなたは思っている以上に感じている',
      es: 'Sientes más de lo que la gente imagina',
    },
    description: {
      'zh-CN': '高情感敏感度＋焦虑依恋，你对关系的每一次波动都格外有感觉。',
      en: 'High emotional sensitivity meets anxious attachment. Every fluctuation in relationships registers deeply.',
      ja: '高い情動感受性と不安愛着。関係のあらゆる変動に大きく反応する。',
      es: 'Alta sensibilidad emocional junto con apego ansioso. Cada fluctuación en las relaciones te afecta profundamente.',
    },
    cta: {
      'zh-CN': '测测你是哪种性格决策者？',
      en: 'Discover your personality type',
      ja: 'あなたの性格タイプを診断',
      es: 'Descubre tu tipo de personalidad',
    },
    score_rules: [
      (v) => (v.attachment_pattern === 'anxious' ? 4 : 0),
      (v) => (v.emotional_regulation === 'externalizing' ? 2 : 0),
      (v) => (v.conflict_style === 'avoidant' || v.conflict_style === 'escapist' ? 1 : 0),
      (v) => (v.trust_threshold < 0.6 ? 1 : 0),
    ],
  },
  {
    id: 'direct_actor',
    label: {
      'zh-CN': '直冲行动者',
      en: 'Direct Striker',
      ja: '直進行動者',
      es: 'Actor Directo',
    },
    headline: {
      'zh-CN': '你的本能反应，往往比你的理性判断更快更准',
      en: 'Your gut instinct is often faster and more accurate than your rational mind',
      ja: '本能的な反応は、理性的な判断より素早く正確なことが多い',
      es: 'Tu instinto suele ser más rápido y preciso que tu mente racional',
    },
    description: {
      'zh-CN': '低设防＋对抗型冲突风格，你相信直接比迂回更有效率。',
      en: 'Low defenses with confrontational style. You believe directness beats indirectness.',
      ja: '防御が低く、対抗的なスタイル。直接性が遠回りより効果的だと信じている。',
      es: 'Defensas bajas con estilo confrontativo. Crees que la directitud supera la indirecta.',
    },
    cta: {
      'zh-CN': '测测你是哪种性格决策者？',
      en: 'Discover your personality type',
      ja: 'あなたの性格タイプを診断',
      es: 'Descubre tu tipo de personalidad',
    },
    score_rules: [
      (v) => (v.trust_threshold < 0.4 ? 2 : 0),
      (v) => (v.conflict_style === 'confrontational' ? 4 : 0),
      (v) => (v.emotional_regulation === 'rational' || v.emotional_regulation === 'externalizing' ? 1 : 0),
    ],
  },
  {
    id: 'balanced_mediator',
    label: {
      'zh-CN': '表面平衡者',
      en: 'Surface Balancer',
      ja: '表面調整者',
      es: 'Equilibrista de Superficie',
    },
    headline: {
      'zh-CN': '你是那个让局面不至于崩掉的人',
      en: "You're the one who keeps things from falling apart",
      ja: '局面が崩れるのを防ぐのがあなた',
      es: 'Eres quien evita que las cosas se derrumben',
    },
    description: {
      'zh-CN': '分析型冲突应对＋稳定依恋，你本能地寻找平衡而不是极端。',
      en: 'Analytical conflict style meets stable attachment. You instinctively seek balance over extremes.',
      ja: '分析的解決と安定愛着。本能的に極端よりバランスを求める。',
      es: 'Estilo de conflicto analítico con apego estable. Buscas instintivamente el equilibrio sobre los extremos.',
    },
    cta: {
      'zh-CN': '测测你是哪种性格决策者？',
      en: 'Discover your personality type',
      ja: 'あなたの性格タイプを診断',
      es: 'Descubre tu tipo de personalidad',
    },
    score_rules: [
      (v) => (v.conflict_style === 'analytical' ? 3 : 0),
      (v) => (v.attachment_pattern === 'secure' || v.attachment_pattern === 'validating' ? 2 : 0),
      (v) => (v.emotional_regulation === 'rational' || v.emotional_regulation === 'deflecting' ? 1 : 0),
      (v) => (v.trust_threshold > 0.3 && v.trust_threshold < 0.7 ? 1 : 0),
    ],
  },
  {
    id: 'contradictory_explorer',
    label: {
      'zh-CN': '矛盾共存者',
      en: 'Contradiction Holder',
      ja: '矛盾共存者',
      es: 'Portador de Contradicciones',
    },
    headline: {
      'zh-CN': '你比你自己认为的要复杂得多',
      en: 'You are far more complex than you think',
      ja: '自分が思うよりずっと複雑',
      es: 'Eres mucho más complejo de lo que crees',
    },
    description: {
      'zh-CN': '你的选择之间存在张力——这不是问题，这就是你最有趣的地方。',
      en: "There are tensions in your choices. That's not a problem — that's the most interesting thing about you.",
      ja: '選択の間に矛盾がある。それは問題ではなく、最も面白い点だ。',
      es: 'Hay tensiones en tus elecciones. Eso no es un problema — es lo más interesante de ti.',
    },
    cta: {
      'zh-CN': '测测你是哪种性格决策者？',
      en: 'Discover your personality type',
      ja: 'あなたの性格タイプを診断',
      es: 'Descubre tu tipo de personalidad',
    },
    score_rules: [
      (v) => (v.attachment_pattern === 'anxious' && v.conflict_style === 'confrontational' ? 2 : 0),
      (v) => (v.trust_threshold > 0.7 && v.emotional_regulation === 'externalizing' ? 2 : 0),
      (v) => (v.attachment_score < 0.4 && v.emotional_regulation === 'externalizing' ? 2 : 0),
    ],
  },
];

// ================================================================
// Contradiction Detection Rules — all 8 rules with localized probes
// ================================================================

export interface ContradictionRule {
  label: string;
  description: string;
  probe: Record<Locale, string>;
}

export const CONTRADICTION_RULES: Array<{
  condition: (v: PersonalityVector) => boolean;
  rule: ContradictionRule;
}> = [
  {
    condition: (v) =>
      v.trust_threshold > 0.7 && v.emotional_regulation === 'externalizing',
    rule: {
      label: 'High boundaries + externalizing',
      description: 'User sets high boundaries but expresses emotions to others',
      probe: {
        'zh-CN': '你说不太让别人进来——但一旦失败会找人倾诉。这两件事加在一起说明什么？',
        en: 'You say you don\'t let people in — but when things go wrong you reach out to talk. What does that combination tell you?',
        ja: 'あんまり人を入れないって言うけど、やらかした時はすぐ誰かに話したくなる。この2つ並べると何が見える？',
        es: 'Dices que no dejas entrar a la gente — pero cuando algo sale mal buscas a alguien para hablar. ¿Qué te dice esa combinación?',
      },
    },
  },
  {
    condition: (v) =>
      v.attachment_pattern === 'anxious' && v.conflict_style === 'avoidant',
    rule: {
      label: 'Anxious attachment + conflict avoidance',
      description: 'User is anxious about relationships but avoids conflict to keep them',
      probe: {
        'zh-CN': '你在乎关系所以退步——但退步不解决问题，只是再撑一段时间。你知道吗？',
        en: 'You back down because you care about the relationship — but backing down doesn\'t solve the problem, it just buys time. Do you know that?',
        ja: '関係を大事にしてるから一歩引く——でも引いたところで、問題は解決しない。ただ時間稼いでるだけ、それ知ってる？',
        es: 'Cedes porque te importa la relación — pero ceder no resuelve el problema, solo gana tiempo. ¿Lo sabes?',
      },
    },
  },
  {
    condition: (v) =>
      v.attachment_pattern === 'avoidant' && v.emotional_regulation === 'externalizing',
    rule: {
      label: 'Avoidant attachment + externalizing',
      description: 'User claims low investment in relationships but seeks social support',
      probe: {
        'zh-CN': '你说关系无所谓——但情绪来了第一个找别人说。这两件事有点说不通。',
        en: 'You say relationships don\'t matter — but when emotions hit your first move is to reach out to someone. These two things don\'t quite add up.',
        ja: 'どうでもいいって言うわりに、感情来た瞬間、真っ先に誰かに頼りたくなる。ちょっと辻褄合わないかも。',
        es: 'Dices que las relaciones no importan — pero cuando las emociones llegan tu primer instinto es buscar a alguien. Estas dos cosas no encajan.',
      },
    },
  },
  {
    condition: (v) =>
      v.conflict_style === 'confrontational' && v.attachment_pattern === 'anxious',
    rule: {
      label: 'Confrontational + anxious attachment',
      description: 'User is direct in conflict but anxious about abandonment',
      probe: {
        'zh-CN': '你会当场回应——但对关系的不确定又很敏感。两个都真实，但会互相消耗你。',
        en: 'You respond in the moment — but you\'re also highly sensitive to uncertainty in relationships. Both are real, and they drain each other.',
        ja: 'その場で返すタイプ——でも、関係の不確かさにはめちゃ敏感。両方本当なんだけど、お互いを消耗し合ってる。',
        es: 'Respondes en el momento — pero también eres muy sensible a la incertidumbre en las relaciones. Ambas cosas son reales y se drenan entre sí.',
      },
    },
  },
  {
    condition: (v) =>
      v.perfectionism_score > 0.8 && v.emotional_regulation === 'deflecting',
    rule: {
      label: 'High perfectionism + deflecting',
      description: 'User has very high standards but deflects rather than processes emotions',
      probe: {
        'zh-CN': '你对自己要求很高，但情绪来了选择跳过——完美主义和情绪回避可能有关联。注意到吗？',
        en: 'You hold yourself to very high standards, but when emotions come you skip over them. Perfectionism and emotional avoidance might be connected. Have you noticed?',
        ja: '自分には厳しいのに、感情来た時は飛ばす——完璧主義と感情の回避、つながってるかも。気づいたことある？',
        es: 'Te exiges mucho, pero cuando llegan las emociones las saltas. El perfeccionismo y la evitación emocional pueden estar conectados. ¿Lo has notado?',
      },
    },
  },
  {
    condition: (v) =>
      v.stress_response === 'rumination' && v.attachment_pattern === 'anxious',
    rule: {
      label: 'Rumination + anxious attachment',
      description: 'User ruminates under stress and has anxious attachment pattern',
      probe: {
        'zh-CN': '压力下你陷入反刍，对关系稳定感又不够——这两件事叠加会特别累。你需要的是停止循环。',
        en: 'Under stress you spiral into rumination, and you also lack stability in relationships. The combination is especially exhausting. What you need is to break the loop.',
        ja: 'ストレスで同じことぐるぐる考えるし、関係の安定感も足りない。この2つが重なると、めちゃくちゃしんどい。必要なのはループを断つこと。',
        es: 'Bajo estrés te enredas en rumiación, y también careces de estabilidad en las relaciones. La combinación es especialmente agotadora. Lo que necesitas es romper el ciclo.',
      },
    },
  },
  {
    condition: (v) =>
      v.selfview_pattern === 'performative' && v.boundary_strength < 0.4,
    rule: {
      label: 'Performative self + low boundaries',
      description: 'User seeks external validation but with low boundaries',
      probe: {
        'zh-CN': '你需要被认可但边界很薄——这意味着你会为让别人觉得你不错而突破底线。意识到这点了吗？',
        en: 'You need external validation but your boundaries are thin — which means you\'ll cross your own lines to be seen as good. Have you realized this?',
        ja: '認められたいけど境界が薄い——つまり『いいヤツ』と思われたいがために、自分の線を越えちゃう。これ、気づいてる？',
        es: 'Necesitas validación externa pero tus límites son débiles — lo que significa que cruzarás tus propias líneas para ser visto como competente. ¿Te has dado cuenta?',
      },
    },
  },
  {
    condition: (v) =>
      v.social_energy_style === 'energy_draining' && v.emotional_regulation === 'externalizing',
    rule: {
      label: 'Social draining + externalizing',
      description: 'Socializing drains user yet they seek external support for regulation',
      probe: {
        'zh-CN': '你觉得社交很消耗——但情绪来了又需要找人倾诉。你用来恢复的方式恰恰在消耗你。',
        en: 'You find socializing draining — but when emotions hit you need to talk to someone. The way you recover is exactly what drains you.',
        ja: '人と会うとしんどい——でも感情来た時は誰かに話したくなる。回復方法がそのまま自分を消耗させてる。',
        es: 'Sientes que socializar te agota — pero cuando llegan las emociones necesitas hablar con alguien. La forma en que te recuperas es justo lo que te agota.',
      },
    },
  },
];

// ================================================================
// Opening Messages — locale-aware, keyed by attachment pattern
// ================================================================

export const OPENING_MESSAGES: Record<string, Record<Locale, string[]>> = {
  secure: {
    'zh-CN': [
      '你的选择很稳——前后一致、不慌。你一直这样，还是学来的？',
      '你对自己挺有感觉的。最近有没有哪个瞬间，觉得不像平时的自己？',
    ],
    en: [
      'Your choices are steady — consistent, clear, calm. Were you always like this, or did you learn it?',
      'You strike me as someone with a good sense of yourself. Has there been a recent moment when you felt unlike yourself?',
    ],
    ja: [
      '最近のあなたの選択、ブレがないね。一貫してるし、迷わない。これは昔から？それとも後天的に？',
      '自分の扱い方、ちゃんとしてるなって印象。最近、『あれ、今の自分らしくないかも』って感じた瞬間あった？',
    ],
    es: [
      'Tus elecciones son estables: consistentes, claras, tranquilas. ¿Siempre fuiste así o lo aprendiste?',
      'Me da la impresión de que tienes buen autoconocimiento. ¿Ha habido algún momento reciente en que no te sintieras tú mismo?',
    ],
  },
  anxious: {
    'zh-CN': [
      '你第三题的反应很有意思——先不说为什么。最近有类似的经历吗？',
      '你的选择告诉我，你对"被忽视"很敏感。你自己知道吗，还是我第一个说？',
    ],
    en: [
      'Interesting. Your response in the third scenario tells me something — I\'ll keep it to myself for now. Have you had a similar experience recently?',
      'Some of your choices tell me you\'re very sensitive to being overlooked. Did you already know that, or am I the first to say it?',
    ],
    ja: [
      'へぇ。3問目の反応、なんか語ってるな——今は言わないでおくけど。最近似たようなこと、あった？',
      '選ぶもん見てると、『軽く見られてるかも』にすごく敏感なのがわかる。それ、自分でもわかってた？それとも私が初めて？',
    ],
    es: [
      'Interesante. Tu respuesta en el tercer escenario me dice algo — no voy a decirlo todavía. ¿Has tenido una experiencia similar recientemente?',
      'Algunas de tus elecciones me dicen que eres muy sensible a ser ignorado. ¿Ya lo sabías, o soy el primero en decirlo?',
    ],
  },
  avoidant: {
    'zh-CN': [
      '你的选择一直在保持距离。我想知道：你是真不在乎，还是学会了假装不在乎？',
      '你说无所谓——但真无所谓的人不会来做这个测试。你觉得呢？',
    ],
    en: [
      'Your choices keep a certain distance. I\'m curious: do you not care, or have you learned to pretend you don\'t?',
      'You said "I don\'t mind" — but someone who truly didn\'t mind wouldn\'t take this test. What do you think?',
    ],
    ja: [
      '結構、距離とりたくなる反応するよね。本当はどう？別に気にしない派？それとも気にしてないフリを覚えた派？',
      '『別にいい』って言ってたけど——本当に平気な人、このテストやんないよね。どう思う？',
    ],
    es: [
      'Tus elecciones mantienen una cierta distancia. Me pregunto: ¿no te importa, o has aprendido a fingir que no te importa?',
      'Dijiste "no me importa" — pero alguien que realmente no le importara no haría esta prueba. ¿Qué piensas?',
    ],
  },
  validating: {
    'zh-CN': [
      '你选了主动问清楚——你要的是信息，还是"被重视"的感觉？这两样不一样。',
      '你不喜欢模糊。在关系里，什么时候"不确定"让你最难受？',
    ],
    en: [
      'You chose to seek clarity — is it information you want, or the feeling of being valued? Those are different things.',
      'You don\'t like ambiguity. In relationships, when does "uncertainty" make you most uncomfortable?',
    ],
    ja: [
      'はっきり確認しにいく方を選んでるね。情報が欲しいの？それとも大事にされてる感じ欲しいの？ちょっと違うやつ。',
      'はっきりしないの、苦手なんだね。関係で『わかんない』って時、どこで一番落ち着かなくなる？',
    ],
    es: [
      'Elegiste buscar claridad — ¿quieres información o la sensación de ser valorado? No es lo mismo.',
      'No te gusta la ambigüedad. En las relaciones, ¿cuándo te hace más incómodo "no saber"?',
    ],
  },
  mixed: {
    'zh-CN': [
      '你的选择里有矛盾——这不是问题，反而是最有意思的地方。你自己注意到了吗？',
      '我看到的你，和你以为的你，可能不太一样。想聊聊哪里不一样？',
    ],
    en: [
      'There are contradictions in your choices — that\'s not a problem, it\'s the most interesting part. Have you noticed yourself?',
      'The you I see and the you you think you are might not be the same. Want to talk about where they differ?',
    ],
    ja: [
      '選択の間に矛盾がある——問題ではなく、最も面白い点だ。自分で気づいたことはある？',
      '私が見るあなたと、自分と思っているあなたは違うかもしれない。どこが違うか話したい？',
    ],
    es: [
      'Hay contradicciones en tus elecciones — eso no es un problema, es lo más interesante. ¿Te has dado cuenta?',
      'El yo que veo y el yo que crees ser pueden no ser lo mismo. ¿Quieres hablar sobre dónde difieren?',
    ],
  },
};

// ================================================================
// Narrative Templates — locale-aware, built into the result
// ================================================================

export type NarrativeMap = Record<Locale, Record<ChoiceOption, string>>;

export const TRUST_NARRATIVES: NarrativeMap = {
  'zh-CN': {
    A: '凌晨那条让你拉起警戒线——不是冷漠，心理空间有严格门禁',
    B: '你用自我暴露回应信任——把心里一小块地让给了对方',
    C: '听完但没给出自己——在收集数据，观察是超能力',
    D: '别人的脆弱对你不是负担是入口——好奇心是进入关系的方式',
  },
  en: {
    A: 'That late-night message raised your guard — not coldness, just strict access control',
    B: 'You responded to trust with self-disclosure — you made room for the other person',
    C: 'You listened but held back — collecting data. Observation is a superpower',
    D: "Other people's vulnerability is an entrance for you, not a burden — curiosity is how you connect",
  },
  ja: {
    A: '夜中に来たそのメッセージで、心にバリアが立ち上がった。冷たいわけじゃない、入れる人をちゃんと選んでるだけ。',
    B: '自分のちょっと深いところを出して、信頼に応えた。心の小さなスペースを相手に渡した。',
    C: "相手の話は聞いたけど、自分からは出さなかった。データを集めてる。観察力、けっこう強い。",
    D: "人の弱さはあなたにとって負担じゃない。むしろ入口。好奇心で人とつながるタイプ。",
  },
  es: {
    A: 'Ese mensaje nocturno activó tu alerta — no frialdad, solo control de acceso estricto',
    B: 'Respondiste a la confianza con apertura — cediste espacio emocional a la otra persona',
    C: 'Escuchaste pero no diste nada de ti — recopilando datos. La observación es una superpower',
    D: 'La vulnerabilidad de otros es una entrada para ti, no una carga — la curiosidad es cómo te conectas',
  },
};

export const CONFLICT_NARRATIVES: NarrativeMap = {
  'zh-CN': {
    A: '当众被质疑按下了暂停键——不是不回应，在等更有利的时机',
    B: '血冲上来但站住了——当众被冒犯，当众回应',
    C: '大脑自动切到"侦探模式"——是优势，但可能错过保护窗口',
    D: '尴尬感让你想逃——表面恢复平静，心里风暴没消失',
  },
  en: {
    A: 'Being challenged in public made you pause — not inaction, waiting for a better moment',
    B: 'Blood rushed but you held your ground — publicly offended, publicly responded',
    C: 'Automatic switch to detective mode — an asset, but you might miss the self-protection window',
    D: 'Discomfort made you want to escape — surface restored, inner storm never disappeared',
  },
  ja: {
    A: 'みんなの前で詰められたとき、一回止まった。動いてないんじゃなくて、ちょうどいいタイミングを待ってる。',
    B: 'カッとなったけど、立ち向かった。目の前でやられた分、目の前で返す。',
    C: '頭が自動で『探偵モード』に切り替わる。得意技だけど、自分を守るタイミングを逃すこともある。',
    D: '気まずさが先に立って、逃げたくなった。表面上は落ち着いたけど、心の中の嵐は止まってない。',
  },
  es: {
    A: 'Ser cuestionado en público te hizo pausar — no inacción, esperando un mejor momento',
    B: 'La sangre subió pero mantuviste tu posición — ofendido en público, respondido en público',
    C: 'Cambio automático a modo detective — una ventaja, pero puedes perder la ventana de autoprotección',
    D: 'La incomodidad te hizo querer escapar — la superficie se restauró, la tormenta interior no desapareció',
  },
};

export const ATTACHMENT_NARRATIVES: NarrativeMap = {
  'zh-CN': {
    A: '你给了对方解释的空间——关系对你有足够稳定感',
    B: '内心把"没有解释"翻译成最坏版本——敏感度是天赋也是负担',
    C: '用"无所谓"穿防弹衣——真无所谓的人不会来做这个测试',
    D: '不接受模糊——要的不只是信息，更是确认仍被重视',
  },
  en: {
    A: 'You gave them space to explain — you have enough stability in relationships to wait',
    B: 'You translated "no explanation" into the worst version — sensitivity is a gift and a burden',
    C: 'Armoring up with "I don\'t care" — someone who truly didn\'t care wouldn\'t take this test',
    D: 'No tolerance for ambiguity — what you want is not just information, but confirmation you still matter',
  },
  ja: {
    A: '相手が説明するスペースを待てた。関係が崩れることへの不安が、そこまで強くない。',
    B: '『説明がない』を、いちばん悪い方に翻訳した。敏感さは才能だけど、負担にもなる。',
    C: "『別にいい』って自分に言い聞かせて、柔らかい鎧を着てる。本当に平気な人は、このテスト受けない。",
    D: 'はっきりしないのが苦手。欲しいのは情報だけじゃなくて、まだ大事にされてるって確認したい。',
  },
  es: {
    A: 'Les diste espacio para explicar — tienes suficiente estabilidad en las relaciones para esperar',
    B: 'Tradujiste "sin explicación" a la peor versión — la sensibilidad es un don y una carga',
    C: 'Armadura de "no me importa" — alguien que realmente no le importara no haría esta prueba',
    D: 'Sin tolerancia a la ambigüedad — lo que quieres no es solo información, sino confirmación de que importas',
  },
};

export const REGULATION_NARRATIVES: NarrativeMap = {
  'zh-CN': {
    A: '搞砸后一个人扛——情绪处理系统内向封闭，不依赖外部',
    B: '需要说出来才能处理——不是脆弱，关系型调节方式',
    C: '把失败变分析题——是效率，也是"不允许自己难过"的防御',
    D: '能切断反芻恢复快——但问题没解决还会回来',
  },
  en: {
    A: 'Dealing with it alone after failing — emotional system is closed, not dependent on others',
    B: 'Need to talk it through to process — not weakness, relationship-based regulation',
    C: 'Turning failure into an analysis problem — efficient, but also a defense against feeling bad',
    D: 'Can cut off the spiral and recover fast — but the problem will come back if unresolved',
  },
  ja: {
    A: '失敗したあと、一人で抱え込む。感情の処理は内側で、外には頼らない。',
    B: '誰かに話さないと整理できない。弱いんじゃなくて、人とつながることで整えるタイプ。',
    C: "失敗を『分析する問題』に変える。効率的だけど、『落ち込んじゃダメ』って自分にかけたガードでもある。",
    D: 'ぐるぐる考えるループをスパッと切れて、立ち直りは早い。ただ、解決してないともう一度来る。',
  },
  es: {
    A: 'Lidiando solo después de fallar — el sistema emocional es interno, no depende de otros',
    B: 'Necesitas hablarlo para procesarlo — no es debilidad, es regulación relacional',
    C: 'Convertir el fracaso en un problema de análisis — eficiente, pero también una defensa contra el dolor',
    D: 'Puedes cortar el bucle y recuperarte rápido — pero el problema volverá si no se resuelve',
  },
};

export const STRESS_NARRATIVES: NarrativeMap = {
  'zh-CN': {
    A: '压力下大脑进入循环——反芻处理焦虑但无法真正休息',
    B: '神经系统难关闭——警戒高位，身体替精神状态买单',
    C: '外部手段切断压力——策略还是逃避取决于频率',
    D: '主动给身体按暂停——对身心连接有觉知',
  },
  en: {
    A: 'Brain loops under pressure — rumination processes anxiety but can never truly rest',
    B: 'Nervous system can\'t power down — sustained high alert, body pays for mental state',
    C: 'External tools to cut stress — strategy or avoidance depends on frequency',
    D: 'Proactively pausing the body — awareness of the mind-body connection',
  },
  ja: {
    A: 'ストレスで頭が同じところをぐるぐる。不安を処理しようとしてるけど、休む暇がない。',
    B: '神経のスイッチがオフにならない。ずっと臨戦態勢で、身体がメンタルに振り回されてる。',
    C: '外の手段でストレスを断ち切る。戦略か逃げかは、頻度しだい。',
    D: '自分で体に『一時停止』をかけてる。心と体のつながり、けっこうわかってる。',
  },
  es: {
    A: 'El cerebro hace bucles bajo presión — la rumiación procesa la ansiedad pero nunca puede descansar',
    B: 'El sistema nervioso no puede apagarse — alerta sostenida, el cuerpo paga el precio del estado mental',
    C: 'Herramientas externas para cortar el estrés — estrategia o evasión depende de la frecuencia',
    D: 'Pausando el cuerpo intencionalmente — consciencia de la conexión mente-cuerpo',
  },
};

export const ACHIEVEMENT_NARRATIVES: NarrativeMap = {
  'zh-CN': {
    A: '对完美的执念是代价——工作出色也活得累',
    B: '需要被看见——永远只发"准备好"的版本会越来越累',
    C: '用"差不多"保护自己——同时限制了可能性',
    D: '能接受不完美但有价值——一种成熟的分辨力',
  },
  en: {
    A: 'The pursuit of perfection comes at a cost — work excellent, life exhausted',
    B: 'Need to be seen — only ever sending the "ready" version gets exhausting',
    C: 'Using "good enough" as armor — also limits your own possibilities',
    D: 'Can accept imperfect but valuable — a mature form of discernment',
  },
  ja: {
    A: '完璧にこだわるの、代价が大きい。仕事はできるけど、生きるのがしんどい。',
    B: '見てほしい。『ちゃんと整った版』しか出さないでいると、だんだん苦しくなる。',
    C: '『まあいいか』で自分を守ってる。同時に、伸びる可能性も狭めてる。',
    D: '完璧じゃなくても価値があるって受け止められる。成熟した見分け方。',
  },
  es: {
    A: 'La obsesión con la perfección tiene un costo — trabajo excelente, vida agotada',
    B: 'Necesitas ser visto — solo enviar la versión "lista" se vuelve cada vez más agotador',
    C: 'Usando "suficientemente bueno" como armadura — también limita tus propias posibilidades',
    D: 'Puedes aceptar imperfecto pero valioso — una forma madura de discernimiento',
  },
};

export const SELFVIEW_NARRATIVES: NarrativeMap = {
  'zh-CN': {
    A: '用外部反馈修正认知——成长型思维的核心',
    B: '自我不轻易被动摇——稳定是优势，但变成墙会错过成长',
    C: '自我价值绑定外部认可——给你驱动力也让你脆弱',
    D: '自我认知是复杂的——矛盾是还没完成自我整合',
  },
  en: {
    A: 'Using external feedback to revise self-perception — the core of growth mindset',
    B: 'Self-image doesn\'t shake easily — stability is an asset, but becomes a wall that blocks growth',
    C: 'Self-worth tied to external validation — drives you but makes you fragile to criticism',
    D: 'Self-perception is complex — contradiction means self-integration isn\'t complete yet',
  },
  ja: {
    A: '外のフィードバックで自分の見方を見直せる。成長するタイプの考え方の核。',
    B: '自分の像が轻易に揺らがない。安定は长所だけど、壁になると成長を逃す。',
    C: '自分の価値が外の认可とセット。动力になるけど、伤つきやすくなる。',
    D: '自分の見方はけっこう複雑。矛盾があるのは、まだ自分を一つにまとめきれてないから。',
  },
  es: {
    A: 'Usando retroalimentación externa para revisar la autopercepción — el núcleo de la mentalidad de crecimiento',
    B: 'La imagen de uno no se sacude fácilmente — la estabilidad es una ventaja, pero se convierte en un muro que bloquea el crecimiento',
    C: 'Autoestima atada a validación externa — te impulsa pero te hace frágil ante la crítica',
    D: 'La autopercepción es compleja — la contradicción significa que la integración del yo aún no está completa',
  },
};

export const SOCIALENERGY_NARRATIVES: NarrativeMap = {
  'zh-CN': {
    A: '社交是充电器——但也需要他人确认自己状态',
    B: '对人际既渴望又恐惧——矛盾本身就值得探索',
    C: '清晰享受独处——但边界太清可能是害怕不确定',
    D: '能按场景调整模式——灵活是情商，也可能偶尔失去真实自己',
  },
  en: {
    A: 'Socializing is a charger — but you also need others to confirm your state',
    B: 'Want and fear of people at the same time — the contradiction itself is worth exploring',
    C: 'Clearly enjoying solitude — but very clean boundaries might also be fear of the unknown',
    D: 'Can adapt mode to the situation — flexibility is emotional intelligence, but you might occasionally lose your authentic self',
  },
  ja: {
    A: '人と会うのは充电。でも、自分の状態を他の人にも確認してほしかったりする。',
    B: '人とつながりたいのに怖い。この矛盾、それだけで掘る価値がある。',
    C: '一人の時間、ちゃんと思しきゃ楽しめてる。ただ、線引きが綺麗すぎるのは『わからないのが怖い』のかも。',
    D: 'シーンに合わせてモードを変えられる。柔軟性はEQだけど、たまにほんとの自分を見失うこともある。',
  },
  es: {
    A: 'Socializar es un cargador — pero también necesitas que otros confirmen tu estado',
    B: 'Deseo y miedo a la gente al mismo tiempo — la contradicción en sí merece ser explorada',
    C: 'Claramente disfrutando de la soledad — pero límites muy limpios también pueden ser miedo a lo desconocido',
    D: 'Puedes adaptar el modo a la situación — la flexibilidad es inteligencia emocional, pero puedes perder autenticidad ocasionalmente',
  },
};
