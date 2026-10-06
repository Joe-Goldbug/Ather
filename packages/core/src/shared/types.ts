// ================================================================
// Eva Engine - Type Definitions
// All interfaces for script, memory, chat, and LLM integration
// ================================================================

export type ScenarioId = 'trust' | 'conflict' | 'attachment' | 'emotion' | 'stress' | 'achievement' | 'selfview' | 'socialenergy' | 'trust_betrayal' | 'attachment_space' | 'conflict_friend' | 'stress_chronic' | 'social_lowenergy' | 'motive_silence' | 'motive_social' | 'reality_refuse';
export type ChoiceOption = 'A' | 'B' | 'C' | 'D';
export type ChatEngineType = 'assessment_debrief' | 'probe' | 'extend' | 'checkin' | 'weekly' | 'pattern' | 'refutation' | 'timecapsule';
export type ConflictStyle = 'avoidant' | 'confrontational' | 'analytical' | 'escapist';
export type AttachmentPattern = 'secure' | 'anxious' | 'avoidant' | 'validating';
export type EmotionalRegulation = 'internalizing' | 'externalizing' | 'rational' | 'deflecting';
export type StressResponse = 'rumination' | 'activation' | 'suppression' | 'mindfulness';
export type AchievementDrive = 'high_standards' | 'recognition_seeking' | 'avoidance' | 'flow_state';
export type SelfViewPattern = 'growth_minded' | 'fixed_identity' | 'performative' | 'ambivalent';
export type SocialEnergyStyle = 'energy_giving' | 'energy_draining' | 'selective' | 'adaptive';
export type DriftRate = 'slow' | 'medium' | 'fast';
export type RefutationResponse = 'agree' | 'disagree' | 'partial';

// ---------------------------------------------------------------
// Refutable Personality Vector — Mechanism A
// ---------------------------------------------------------------

/**
 * Wraps a single personality dimension with confidence + drift tracking.
 * T = value type (number for continuous, string for categorical)
 */
export interface VectorDimension<T = number> {
  value: T;
  confidence: number;       // 0-1, starts at 0.4 from script, grows with chat data
  drift_rate: DriftRate;    // how quickly this dimension changes under new evidence
  last_refuted?: number;    // timestamp of last user refutation
  evidence_count: number;   // number of chat turns used as evidence
}

/**
 * One instance of user refuting (or confirming) Eva's personality claim.
 */
export interface RefutationEntry {
  id: string;
  timestamp: number;
  dimension: string;                  // e.g. 'conflict_style'
  ather_claim: string;                // what Ather stated
  user_response: RefutationResponse;  // agree / disagree / partial
  user_nuance?: string;               // user's elaboration text
  confidence_delta: number;           // net confidence change applied
}

// ---------------------------------------------------------------
// Time Capsule — Mechanism B
// ---------------------------------------------------------------

/**
 * A stored user quote that may be surfaced later to reveal self-contradiction.
 */
export interface TimeCapsule {
  id: string;
  quote: string;           // exact user text stored
  timestamp: number;
  context_tags: string[];  // active_topics at time of capture
  dimension_hint: string;  // which personality dimension this quote relates to
  triggered: boolean;      // whether already surfaced
  trigger_condition: 'contradiction' | 'topic_repeat' | 'elapsed_7d' | 'elapsed_30d';
}

// ---------------------------------------------------------------
// Extended 12-dimensional PNN vector (additive — does not replace PersonalityVector)
// ---------------------------------------------------------------

export interface PNNVector {
  trust_threshold:        VectorDimension<number>;
  conflict_style:         VectorDimension<string>;
  attachment_pattern:     VectorDimension<string>;
  self_disclosure_depth:  VectorDimension<number>;
  cognitive_rigidity:     VectorDimension<number>;
  emotional_granularity:  VectorDimension<number>;
  help_seeking_pattern:   VectorDimension<string>;
  shame_sensitivity:      VectorDimension<number>;
  growth_orientation:     VectorDimension<number>;
  relational_investment:  VectorDimension<number>;
  autonomy_need:          VectorDimension<number>;
  meaning_seeking:        VectorDimension<number>;
}

// ---------------------------------------------------------------
// Script Layer
// ---------------------------------------------------------------

export interface ScenarioChoice {
  scenarioId: ScenarioId;
  choice: ChoiceOption;
  timestamp: number;
}

/**
 * [S1] 一次作答 = 判别联合(discriminated union).
 * 用 `kind` 区分"选项"与"自填", 让非法状态不可表达.
 */
export type ScenarioAnswer =
  | { kind: 'choice'; scenarioId: string; choice: ChoiceOption; timestamp: number }
  | { kind: 'input';  scenarioId: string; text: string;        timestamp: number };

export interface PersonalityVector {
  // From scenario 1: Trust & Boundary
  trust_threshold: number;        // 0=fully open, 1=highly guarded
  boundary_strength: number;      // 0=low boundary, 1=high boundary

  // From scenario 2: Conflict
  conflict_style: ConflictStyle;
  conflict_score: number;         // 0=indirect, 1=direct

  // From scenario 3: Attachment
  attachment_pattern: AttachmentPattern;
  attachment_score: number;       // 0=low security, 1=high security

  // From scenario 4: Emotional Regulation
  emotional_regulation: EmotionalRegulation;

  // From scenario 5: Stress Response
  stress_response: StressResponse;
  stress_score: number;           // 0=suppressive, 1=activative

  // From scenario 6: Achievement Drive
  achievement_drive: AchievementDrive;
  perfectionism_score: number;    // 0=flexible, 1=rigid high-standards

  // From scenario 7: Self-View Pattern
  selfview_pattern: SelfViewPattern;
  growth_mindset_score: number;   // 0=fixed, 1=growth

  // From scenario 8: Social Energy Style
  social_energy_style: SocialEnergyStyle;
  social_energy_score: number;    // 0=introverted, 1=extroverted

  // Derived meta-scores (computed after all 8 scenarios)
  openness_score: number;         // inverse of trust_threshold weighted average
  stability_score: number;        // attachment_score weighted average
  neuroticism_score: number;      // stress + perfectionism combined

  // Per-dimension confidence (starts at 0.6, increases with more chat data)
  confidence: Record<ScenarioId, number>;

  // Vector evolution (populated after 7+ days of chat data)
  drift?: {
    trust_threshold?: number;
    boundary_strength?: number;
    attachment_score?: number;
  };
}

export interface ScriptResultShareCard {
  archetype: string;              // e.g. "边界守卫者"
  headline: string;               // e.g. "你守护的，比你说出来的多得多"
  description: string;            // 1 sentence for sharing
  cta: string;                    // e.g. "测测你是哪种性格？"
}

export interface ScriptEvidence {
  id: string;
  scenarioId: string;
  dimensionId: string;
  choice: ChoiceOption;
  choiceLabel: string;
  choiceText: string;
  scenarioTitle: string;
  context: string;
  expectedSignal: 'high' | 'mid-high' | 'mid-low' | 'low';
  vectorPatch: Partial<PersonalityVector>;
}

export interface AssessmentDebriefState {
  source_id: string;
  source_type: 'baseline' | 'micro_sandbox';
  key_insight: string;
  evidence: ScriptEvidence[];
  remaining_turns: number;
  confirmed_or_refuted: boolean;
  created_at: number;
}

export interface ScriptResult {
  choices: ScenarioChoice[];
  vector: PersonalityVector;
  /** Structured source facts used by report, roast, correction, and audit views. */
  evidence_log: ScriptEvidence[];
  // Evidence-based narrative (no labels, just observations citing their choices)
  narrative: string;
  // One Eva-style insight (punchy, slightly challenging)
  key_insight: string;
  // Eva's first message entering chat (bridges script → chat)
  ather_opening: string;
  share_card: ScriptResultShareCard;
  /** Slug-based archetype id (e.g. "boundary_guard") for frontend bucketing. */
  archetype_id: string;
  /** Legacy compatibility: optional reality inputs supplied with a scored run. */
  free_text_answers?: Record<string, string>;
  /** Legacy compatibility: deterministic prompts for reviewing supplied reality inputs. */
  ather_wants_to_confirm?: string[];
}

export interface ScriptRunState {
  current_scenario_index: number;  // 0-7
  choices: ScenarioChoice[];
  phase: 'intro' | 'scenario' | 'feedback' | 'result';
}

// ---------------------------------------------------------------
// UBV — Unified Belief Vector (L1+L3 core data structure)
// All sources (script/chat/diary) write to and read from this.
// ---------------------------------------------------------------

export type UBVEvidenceSource = 'script' | 'chat' | 'diary' | 'self_report';

/**
 * Whether this dimension measures a stable trait, a transient state, or
 * a weak linguistic signal inferred from conversation.
 *
 * Determines confidence decay speed:
 *   trait   → half-life 90 days
 *   state   → half-life 7 days
 *   signal  → half-life 1 day
 */
export type BeliefDimKind = 'trait' | 'state' | 'signal';

export interface BeliefDim {
  value: number;            // 0-100, population-centred (50 = average)
  variance: number;         // measurement variance (SEM²) — drives CI width
  evidence_count: number;   // total observations contributing to this dimension
  last_updated: number;     // timestamp of last value update
  /** Timestamp of most recent supporting evidence event (used for decay). */
  last_evidence_at: number;
  sources: UBVEvidenceSource[];  // which inputs contributed (for transparency)
  /** Derived confidence: 0-1, clamped to [0.1, 0.95] */
  confidence: number;
  /**
   * Trait vs state vs signal classification.
   * Drives confidence decay rate and interpretation copy.
   * Defaults to 'trait' for backward compatibility.
   */
  kind: BeliefDimKind;
  /**
   * Number of times the user has explicitly corrected this dimension.
   * Drives confidence penalty in correction-analytics.
   */
  correction_count: number;
}

export interface UBV {
  // L1 Core: Big Five + attachment (8 dimensions)
  trustBoundaries:      BeliefDim;   // 人格：外向/内向轴
  conflictResponse:     BeliefDim;   // 人格：宜人性
  attachment:           BeliefDim;   // 依恋：安全/焦虑/回避
  emotionRegulation:   BeliefDim;   // 情绪调节：Gross模型
  stressResponse:      BeliefDim;   // 压力应对
  achievementMotivation:    BeliefDim;   // 成就动机
  selfCognition:       BeliefDim;   // 自我概念清晰度
  socialEnergy:        BeliefDim;   // 内外向

  // L3 Frontier: psycholinguistic dimensions (inferred from language)
  emotionalGranularity: BeliefDim;  // 情绪粒度 (Lieberman affect labeling)
  shameSensitivity:     BeliefDim;  // 羞耻敏感度
  helpSeekingPattern:   BeliefDim;  // 求助模式
  linguisticExtraversion: BeliefDim; // 从语言推断的外向性 (LIWC)
  narrativeCoherence:   BeliefDim;  // 叙事一致性
  growthOrientation:   BeliefDim;  // 成长导向

  // L2 Design: state tracking (NOT mixed into trait vector)
  currentMood: { label: string; intensity: number; timestamp: number };
  quickState: {
    active_topics: string[];
    mention_counts: Record<string, number>;
    last_active: number;
  };

  // Meta
  meta: {
    created_at: number;
    last_active: number;
    total_turns: number;
    script_completed: boolean;
  };
}

export interface RCIResult {
  dimension: string;
  current: number;
  baseline: number;
  SE: number;         // √(variance_current + variance_baseline)
  RCI: number;         // (current - baseline) / SE
  significant: boolean; // |RCI| > 1.96
}

/**
 * How large the shift is (based on |RCI| magnitude).
 * subtle: 1.96–3.0 — noticeable but could be noise
 * moderate: 3.0–5.0 — clear, consistent shift
 * profound: >5.0 — fundamental-level change
 */
export type ShiftMagnitude = 'subtle' | 'moderate' | 'profound';

/**
 * Which baseline triggered.
 * recent: rolling_baseline (last 30 days) — "你最近变了"
 * longterm: original baseline_ubv — "你跟一年前完全不同"
 * both: both baselines triggered — accelerating / compounding change
 */
export type ShiftComparisonType = 'recent' | 'longterm' | 'both';

export interface YouShifted {
  dimension: string;
  RCI: RCIResult;
  narrative_insight: string;
  evidence_sources: UBVEvidenceSource[];
  /** 该维度最早的用户原话（用于"变化前"展示） */
  before_quote?: string;
  /** 该维度最近的用户原话（用于"变化后"展示） */
  after_quote?: string;
  /** 变化量级：细微 / 明显 / 深层 */
  magnitude: ShiftMagnitude;
  /** 对比类型：近期 / 长期 / 两者都有 */
  comparison_type: ShiftComparisonType;
}

// ---------------------------------------------------------------
// Memory Layer
// ---------------------------------------------------------------

export interface PersonEntity {
  id: string;
  name: string;                   // display name or pronoun reference
  relation: string;               // 朋友 | 同事 | 男友 | 家人 | etc.
  mention_count: number;
  sentiment: number;              // -1 to 1
  last_mentioned: number;         // timestamp
  tags: string[];
}

export interface EventEntity {
  id: string;
  summary: string;
  type: 'work' | 'relationship' | 'personal' | 'social' | 'other';
  emotion: string;
  intensity: number;              // 0-1
  timestamp: number;
  related_persons: string[];      // PersonEntity ids
}

export interface ConversationTurn {
  id: string;
  role: 'user' | 'ather';
  content: string;
  timestamp: number;
  engine_triggered?: ChatEngineType;
  topic_tags?: string[];          // extracted topic keywords
}

export interface DiaryEntry {
  id: string;
  date: string;                   // YYYY-MM-DD
  events: EventEntity[];
  emotions: Array<{ label: string; intensity: number }>;
  persons_mentioned: string[];    // PersonEntity ids
  raw_user_messages: string[];    // original text for reference
  patterns: string[];             // e.g. ["今天第3次提到工作", "情绪强度 0.7"]
}

export interface WeeklySummary {
  week_start: string;             // YYYY-MM-DD
  week_end: string;
  dominant_emotion: string;
  pattern_discoveries: string[];
  key_events: EventEntity[];
  vector_drift: Partial<PersonalityVector>;
  ather_message: string;          // Eva's weekly review message
  generated_at: number;
}

export interface QuickState {
  recent_mood: string;
  mood_intensity: number;         // 0-1
  active_topics: string[];        // topics mentioned in last 3 user turns
  mention_counts: Record<string, number>; // topic/keyword → total count
  last_active: number;
}

export interface Memory {
  user_id: string;
  script_result: ScriptResult | null;
  personality_vector: PersonalityVector | null;
  pnn_vector: PNNVector | null;               // 12-dimensional extended vector
  ubv: UBV | null;                             // Unified Belief Vector — single source of truth
  /** 第一次做完脚本测试时的 UBV 快照，永久冻结，代表"你是从哪里出发的" */
  baseline_ubv: UBV | null;
  /**
   * 滚动基线：每 30 天从当前 UBV 更新一次快照。
   * 用于检测近期变化（recent）；original baseline_ubv 用于长期对比（longterm）。
   */
  rolling_baseline_ubv: UBV | null;
  quick_state: QuickState;
  entities: {
    persons: PersonEntity[];
    events: EventEntity[];
    value_conflicts: string[];    // detected value tension lines
  };
  conversation_history: ConversationTurn[];
  diary_entries: DiaryEntry[];
  weekly_summaries: WeeklySummary[];
  refutation_log: RefutationEntry[];          // history of user refutations
  time_capsules: TimeCapsule[];               // stored quotes for future surfacing
  meta: {
    created_at: number;
    last_active: number;
    total_turns: number;
    script_completed: boolean;
    /** Explicit state flag for routing: whether baseline 8-question run has been completed. */
    baseline_completed?: boolean;
    /** Forces the first chat turns after an assessment to cite fresh assessment evidence. */
    assessment_debrief?: AssessmentDebriefState | null;
    last_youshifted_turn?: number;  // cooldown tracker for YouShifted (prevents repeated triggers)
    /** 滚动基线最近一次更新的时间戳（ms），用于判断是否已过 30 天 */
    rolling_baseline_updated_at?: number;
  };
}

// ---------------------------------------------------------------
// Chat Layer
// ---------------------------------------------------------------

export interface ChatRequest {
  user_message: string;
  memory: Memory;
  llm_caller: LLMCaller;
  locale?: string;
  /** Dimensions with user corrections in the last 14 days — suppress YouShifted on these */
  recent_corrections?: string[];
  /** Stable feature payload hydrated by backend before every chat request */
  hydration_hints?: {
    top_low_confidence_dimensions: string[];
    recent_corrections_by_dimension: Array<{ dimension: string; count: number }>;
    recent_evidence_summary: Array<{ dimension: string; count: number; weighted_delta: number }>;
    baseline_vs_current_delta_top3: Array<{ dimension: string; delta: number }>;
  };
}

export interface ChatCorrectionSignal {
  source_type: 'chat_claim';
  source_id: string;
  dimension: string;
  original_text: string;
  corrected_text: string;
  explanation: string;
}

/**
 * Test format types for multi-format test variety.
 * Each format taps personality differently to prevent fatigue.
 */
export type TestFormat =
  | 'scenario_choice'       // Current: 4-option situational scenario
  | 'forced_dilemma'        // Binary extreme trade-off (only 2 options)
  | 'sentence_completion'   // User completes an open-ended sentence stem
  | 'priority_ranking'      // Rank 4-5 values/actions in order
  | 'counterfactual'        // "If you had chosen differently last time..."
  | 'emotion_slider';       // Continuous slider (0-100) for state tracking

/**
 * Proactive recommendation for the next test round.
 * Generated when chat closes, based on what was discovered in dialogue.
 */
export interface NextTestRecommendation {
  /** Why this test is suggested — references specific chat evidence */
  reason: string;
  /** The UBV dimension to probe next */
  target_dimension: string;
  /** Suggested test format for variety */
  suggested_format: TestFormat;
  /** How urgent is this measurement gap? */
  urgency: 'high' | 'medium' | 'low';
  /** Personalized intro line shown before the test starts */
  personalized_intro: string;
}

export interface ChatResponse {
  ather_message: string;
  engine_used: ChatEngineType | null;
  updated_memory: Memory;
  diary_update?: DiaryEntry;
  /** Fired when RCI > 1.96 on any dimension — signals a statistically significant shift */
  you_shifted?: YouShifted;
  /** Auto-generated when user explicitly refutes Eva's claim in chat. */
  correction_signal?: ChatCorrectionSignal;
  /** Dialogue state after this turn — null if state unchanged */
  updated_state?: DialogueState;
  /** Proactive suggestion for next test — generated when dialogue reaches 'closed' phase */
  next_test_recommendation?: NextTestRecommendation;
}

// ---------------------------------------------------------------
// Dialogue Orchestrator State Machine (Phase 3)
// ---------------------------------------------------------------

export type DialoguePhase =
  | 'probing'      // Active measurement — Eva is probing for evidence
  | 'insufficient' // Not enough evidence yet — keep going
  | 'enough'       // Sufficient evidence — start soft-guiding toward close
  | 'closing'      // Soft-closing: guiding conversation toward natural end (turns 4-6)
  | 'needs_micro'  // Triggered a micro-test — awaiting user response
  | 'closed';      // Turn/dimension closed, moving to report

export interface DialogueState {
  /** Current measurement phase */
  phase: DialoguePhase;
  /** Cumulative evidence count for current dimension */
  evidence_count: number;
  /** Dimensions that have been closed this session */
  closed_dimensions: string[];
  /** Turn count in current phase */
  turn_in_phase: number;
  /** Total turns in this dialogue session */
  total_turns: number;
  /** Maximum turns before force-closing (default: 8) */
  max_turns: number;
  /** Whether micro-test was triggered this turn */
  micro_test_pending: boolean;
  /** Eva's last probe hint (for context continuity) */
  last_probe_hint: string;
}

export function createDialogueState(): DialogueState {
  return {
    phase: 'probing',
    evidence_count: 0,
    closed_dimensions: [],
    turn_in_phase: 0,
    total_turns: 0,
    max_turns: 8,
    micro_test_pending: false,
    last_probe_hint: '',
  };
}

// LLM-agnostic caller (user provides OpenAI / Claude / local)
export type LLMCaller = (params: {
  system: string;
  messages: Array<{ role: 'user' | 'assistant'; content: string }>;
  max_tokens?: number;
  temperature?: number;
}) => Promise<string>;
