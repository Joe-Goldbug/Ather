// ================================================================
// Ather Engine - Memory Manager
// All CRUD operations on the Memory object.
// Stateless functions — caller owns persistence (DB / localStorage / Redis).
// ================================================================

import type {
  Memory, ConversationTurn, DiaryEntry, WeeklySummary,
  PersonEntity, EventEntity, QuickState, ScriptResult,
  RefutationEntry, TimeCapsule, PNNVector, VectorDimension,
  RefutationResponse, PersonalityVector,
  ShiftMagnitude, ShiftComparisonType,
} from '../shared/types.js';

// ---------------------------------------------------------------
// Factory: Create a fresh Memory for a new user
// ---------------------------------------------------------------

export function createMemory(user_id: string): Memory {
  const now = Date.now();
  return {
    user_id,
    script_result: null,
    personality_vector: null,
    quick_state: {
      recent_mood: '',
      mood_intensity: 0,
      active_topics: [],
      mention_counts: {},
      last_active: now,
    },
    entities: {
      persons: [],
      events: [],
      value_conflicts: [],
    },
    conversation_history: [],
    diary_entries: [],
    weekly_summaries: [],
    refutation_log: [],
    time_capsules: [],
    pnn_vector: null,
    ubv: null,
    baseline_ubv: null,
    rolling_baseline_ubv: null,
    meta: {
      created_at: now,
      last_active: now,
      total_turns: 0,
      script_completed: false,
      baseline_completed: false,
    },
  };
}

/**
 * Normalize a partially populated Memory object loaded from DB.
 * Older rows or interrupted writes may miss nested objects such as quick_state.
 * This keeps runtime code from crashing on legacy / partial records.
 */
export function normalizeMemory(
  memory: Partial<Memory> | null | undefined,
  user_id = '',
): Memory {
  const base = createMemory(memory?.user_id ?? user_id);
  if (!memory) return base;

  return {
    ...base,
    ...memory,
    user_id: memory.user_id ?? user_id ?? base.user_id,
    quick_state: {
      ...base.quick_state,
      ...(memory.quick_state ?? {}),
    },
    entities: {
      ...base.entities,
      ...(memory.entities ?? {}),
      persons: memory.entities?.persons ?? base.entities.persons,
      events: memory.entities?.events ?? base.entities.events,
      value_conflicts: memory.entities?.value_conflicts ?? base.entities.value_conflicts,
    },
    conversation_history: memory.conversation_history ?? base.conversation_history,
    diary_entries: memory.diary_entries ?? base.diary_entries,
    weekly_summaries: memory.weekly_summaries ?? base.weekly_summaries,
    refutation_log: memory.refutation_log ?? base.refutation_log,
    time_capsules: memory.time_capsules ?? base.time_capsules,
    meta: {
      ...base.meta,
      ...(memory.meta ?? {}),
    },
  };
}

// ---------------------------------------------------------------
// Script result integration
// ---------------------------------------------------------------

export function applyScriptResult(memory: Memory, result: ScriptResult): Memory {
  const withScript: Memory = {
    ...memory,
    script_result: result,
    personality_vector: result.vector,
    meta: {
      ...memory.meta,
      script_completed: true,
      baseline_completed: true,
      last_active: Date.now(),
    },
  };
  // Apply assessment evidence onto the existing UBV when present. This preserves
  // decay, correction_count, and non-script dimensions across later retests.
  const startingUbv = memory.ubv ?? createUBV(true);
  const seeded = mapScriptToUBV(startingUbv, result.vector);
  // Keep the first baseline stable for future RCI/YouShifted comparisons.
  const baseline = memory.baseline_ubv ?? JSON.parse(JSON.stringify(seeded)) as UBV;
  // rolling_baseline_ubv: same as baseline on first run; will be rolled every 30 days.
  const rolling = memory.rolling_baseline_ubv ?? JSON.parse(JSON.stringify(seeded)) as UBV;
  return initPNNVector({ ...withScript, ubv: seeded, baseline_ubv: baseline, rolling_baseline_ubv: rolling });
}

/**
 * Apply a new personality vector onto current memory without resetting baseline snapshots.
 * Used by follow-up micro-sandbox updates after baseline is already established.
 */
export function applyPersonalityVectorUpdate(memory: Memory, vector: PersonalityVector): Memory {
  const startingUbv = memory.ubv ?? createUBV(true);
  const updatedUbv = mapScriptToUBV(startingUbv, vector);
  return {
    ...memory,
    personality_vector: vector,
    ubv: updatedUbv,
    meta: {
      ...memory.meta,
      last_active: Date.now(),
    },
  };
}

/** Map PersonalityVector (script) → UBV dimensions via heuristic rules */
function mapScriptToUBV(ubv: UBV, pv: PersonalityVector): UBV {
  // trust_threshold (0=open, 1=guarded) → trustBoundaries (0-100, 50=avg)
  let seeded = updateUBVFromSource(ubv, 'trustBoundaries', (1 - pv.trust_threshold) * 100, 'script');
  // attachment_score (0=low security, 1=high) → attachment
  seeded = updateUBVFromSource(seeded, 'attachment', pv.attachment_score * 100, 'script');
  // stressResponse: blend stress_score (behavioral) with stress_response pattern (categorical)
  // Both contribute — behavioral score (0-1) + categorical pattern (weighted average)
  const stressScoreVal = pv.stress_score * 100;
  const stressMap: Record<string, number> = { rumination: 30, activation: 60, suppression: 40, mindfulness: 75 };
  const stressPatternVal = stressMap[pv.stress_response] ?? 50;
  seeded = updateUBVFromSource(seeded, 'stressResponse', (stressScoreVal * 0.6 + stressPatternVal * 0.4), 'script');
  // achievement_drive + perfectionism_score → achievementMotivation
  const achievementMap: Record<string, number> = {
    high_standards: 75,
    recognition_seeking: 60,
    avoidance: 30,
    flow_state: 70,
  };
  const achievementVal = (achievementMap[pv.achievement_drive] ?? 50) * 0.5 + pv.perfectionism_score * 100 * 0.5;
  seeded = updateUBVFromSource(seeded, 'achievementMotivation', achievementVal, 'script');
  // growth_mindset_score → selfCognition (core) and growthOrientation (extended)
  seeded = updateUBVFromSource(seeded, 'selfCognition', pv.growth_mindset_score * 100, 'script');
  seeded = updateUBVFromSource(seeded, 'growthOrientation', pv.growth_mindset_score * 100, 'script');
  // conflict_score → conflictResponse
  seeded = updateUBVFromSource(seeded, 'conflictResponse', pv.conflict_score * 100, 'script');
  // emotional_regulation → emotionRegulation (categorical → numeric)
  const emotionMap: Record<string, number> = { internalizing: 30, externalizing: 60, rational: 70, deflecting: 40 };
  seeded = updateUBVFromSource(seeded, 'emotionRegulation', emotionMap[pv.emotional_regulation] ?? 50, 'script');
  // social_energy_score → socialEnergy
  seeded = updateUBVFromSource(seeded, 'socialEnergy', pv.social_energy_score * 100, 'script');
  return seeded;
}

// ---------------------------------------------------------------
// Conversation history management
// Keep last 40 turns in hot memory (older turns go to diary_entries)
// ---------------------------------------------------------------

const HOT_HISTORY_LIMIT = 40;

export function appendTurn(memory: Memory, turn: ConversationTurn): Memory {
  const history = [...memory.conversation_history, turn];
  const trimmed = history.length > HOT_HISTORY_LIMIT
    ? history.slice(history.length - HOT_HISTORY_LIMIT)
    : history;

  return {
    ...memory,
    conversation_history: trimmed,
    meta: {
      ...memory.meta,
      total_turns: memory.meta.total_turns + 1,
      last_active: turn.timestamp,
    },
  };
}

// ---------------------------------------------------------------
// Quick state update (called after every user message)
// ---------------------------------------------------------------

const EMOTION_PATTERNS: Array<{ pattern: RegExp; label: string; intensity: number }> = [
  { pattern: /好烦|烦死|烦透了|烦了/, label: '烦躁', intensity: 0.65 },
  { pattern: /累死|好累|累了|太累/, label: '疲惫', intensity: 0.7 },
  { pattern: /气死|好气|超气|生气|愤怒/, label: '愤怒', intensity: 0.8 },
  { pattern: /委屈|难过|心里堵|很难受|伤心/, label: '难过', intensity: 0.75 },
  { pattern: /开心|好开心|高兴|激动|兴奋/, label: '开心', intensity: 0.65 },
  { pattern: /焦虑|紧张|不安|担心|害怕/, label: '焦虑', intensity: 0.7 },
  { pattern: /孤独|孤单|一个人|没人/, label: '孤独', intensity: 0.6 },
  { pattern: /无聊|没意思|空虚/, label: '空虚', intensity: 0.5 },
  { pattern: /还行|挺好|没事|不错/, label: '平静', intensity: 0.3 },
];

const HIGH_VALUE_TOPICS = [
  '边界', '信任', '冲突', '分手', '失去', '失败', '自我价值',
  '不值得', '不重要', '被忽视', '控制', '压力', '改变', '后悔',
];

export function updateQuickState(
  quick_state: QuickState,
  user_message: string,
): QuickState {
  const lowered = user_message;

  // Detect mood
  let recent_mood = quick_state.recent_mood;
  let mood_intensity = quick_state.mood_intensity;
  for (const ep of EMOTION_PATTERNS) {
    if (ep.pattern.test(lowered)) {
      recent_mood = ep.label;
      mood_intensity = ep.intensity;
      break;
    }
  }

  // Update mention counts (topics + person-like words)
  const mention_counts = { ...quick_state.mention_counts };
  for (const topic of HIGH_VALUE_TOPICS) {
    if (lowered.includes(topic)) {
      mention_counts[topic] = (mention_counts[topic] ?? 0) + 1;
    }
  }

  // Extract active topics (words ≥2 chars that appear in message, simplified)
  const active_topics = Object.entries(mention_counts)
    .filter(([, count]) => count >= 1)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([t]) => t);

  return {
    recent_mood,
    mood_intensity,
    active_topics,
    mention_counts,
    last_active: Date.now(),
  };
}

// ---------------------------------------------------------------
// Entity extraction (rule-based, no LLM)
// Extend with LLM extraction in prompts.ts for richer results
// ---------------------------------------------------------------

const RELATION_KEYWORDS: Record<string, string> = {
  朋友: '朋友', 闺蜜: '朋友', 基友: '朋友', 死党: '朋友',
  男友: '伴侣', 女友: '伴侣', 对象: '伴侣', 老公: '伴侣', 老婆: '伴侣',
  前任: '前任', 前男友: '前任', 前女友: '前任',
  同事: '同事', 领导: '领导', 老板: '领导', 上司: '领导',
  妈妈: '家人', 爸爸: '家人', 妈: '家人', 爸: '家人', 兄弟: '家人', 姐姐: '家人', 哥哥: '家人',
};

export function extractPersonMentions(
  user_message: string,
  existing: PersonEntity[],
): PersonEntity[] {
  const now = Date.now();
  const updated = existing.map((p) => ({ ...p }));

  for (const [keyword, relation] of Object.entries(RELATION_KEYWORDS)) {
    if (user_message.includes(keyword)) {
      const existing_person = updated.find((p) => p.relation === relation && p.name === keyword);
      if (existing_person) {
        existing_person.mention_count += 1;
        existing_person.last_mentioned = now;
      } else {
        updated.push({
          id: `person_${Date.now()}_${keyword}`,
          name: keyword,
          relation,
          mention_count: 1,
          sentiment: 0,
          last_mentioned: now,
          tags: [],
        });
      }
    }
  }

  return updated;
}

// ---------------------------------------------------------------
// Diary entry: generate today's entry from conversation turns
// Call at end of session or daily cron
// ---------------------------------------------------------------

export function buildDiaryEntry(
  turns: ConversationTurn[],
  quick_state: QuickState,
  persons: PersonEntity[],
): DiaryEntry {
  const now = new Date();
  const date = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

  const user_turns = turns
    .filter((t) => t.role === 'user')
    .slice(-20); // Last 20 user messages for today's diary

  const events: EventEntity[] = [];
  const raw_messages = user_turns.map((t) => t.content);
  const patterns: string[] = [];

  // Detect high-mention topics as patterns
  for (const [topic, count] of Object.entries(quick_state.mention_counts)) {
    if (count >= 3) {
      patterns.push(`今天第${count}次提到"${topic}"`);
    }
  }

  // Detect high intensity emotions
  if (quick_state.mood_intensity >= 0.7) {
    patterns.push(`情绪强度 ${quick_state.mood_intensity}（${quick_state.recent_mood}）`);
  }

  // Simple event extraction from last user message
  const last_user = raw_messages[raw_messages.length - 1] ?? '';
  if (last_user.length > 5) {
    events.push({
      id: `event_${Date.now()}`,
      summary: last_user.slice(0, 60),
      type: 'other',
      emotion: quick_state.recent_mood,
      intensity: quick_state.mood_intensity,
      timestamp: Date.now(),
      related_persons: persons
        .filter((p) => p.last_mentioned > Date.now() - 86400_000)
        .map((p) => p.id),
    });
  }

  const emotions = quick_state.recent_mood
    ? [{ label: quick_state.recent_mood, intensity: quick_state.mood_intensity }]
    : [];

  return {
    id: `diary_${date}`,
    date,
    events,
    emotions,
    persons_mentioned: persons
      .filter((p) => p.last_mentioned > Date.now() - 86400_000)
      .map((p) => p.id),
    raw_user_messages: raw_messages,
    patterns,
  };
}

// ---------------------------------------------------------------
// Weekly summary scaffold (narrative filled by LLM in chat-engine)
// ---------------------------------------------------------------

export function buildWeeklySummaryScaffold(
  diary_entries: DiaryEntry[],
): Omit<WeeklySummary, 'ather_message'> {
  const now = new Date();
  const week_end = now.toISOString().slice(0, 10);
  const week_start_d = new Date(now);
  week_start_d.setDate(now.getDate() - 6);
  const week_start = week_start_d.toISOString().slice(0, 10);

  // Aggregate emotions
  const emotion_counts: Record<string, number> = {};
  for (const entry of diary_entries) {
    for (const e of entry.emotions) {
      emotion_counts[e.label] = (emotion_counts[e.label] ?? 0) + 1;
    }
  }
  const dominant_emotion =
    Object.entries(emotion_counts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? '未知';

  const all_patterns = diary_entries.flatMap((d) => d.patterns);
  const key_events = diary_entries.flatMap((d) => d.events).slice(0, 5);

  // Compute simple vector drift (compare week start vs stored baseline)
  const vector_drift = {};

  return {
    week_start,
    week_end,
    dominant_emotion,
    pattern_discoveries: [...new Set(all_patterns)].slice(0, 6),
    key_events,
    vector_drift,
    generated_at: Date.now(),
  };
}

// ---------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------

export function getRecentTurns(memory: Memory, n: number): ConversationTurn[] {
  return memory.conversation_history.slice(-n);
}

export function getTopicMentionCount(memory: Memory, topic: string): number {
  return memory.quick_state.mention_counts[topic] ?? 0;
}

export function getPersonByRelation(memory: Memory, relation: string): PersonEntity | undefined {
  return memory.entities.persons.find((p) => p.relation === relation);
}

// ================================================================
// Mechanism A: Refutable Personality Vector
// ================================================================

// Confidence deltas per response type
const CONFIDENCE_DELTA: Record<RefutationResponse, number> = {
  agree:    +0.20,
  partial:  +0.10,
  disagree: -0.05,  // slight drop but new evidence is still informative
};

/**
 * Record a user's refutation/confirmation of an Ather personality claim.
 * Returns updated memory with adjusted confidence in pnn_vector if available.
 */
export function recordRefutation(
  memory: Memory,
  dimension: string,
  ather_claim: string,
  user_response: RefutationResponse,
  user_nuance?: string,
): Memory {
  const delta = CONFIDENCE_DELTA[user_response];
  const entry: RefutationEntry = {
    id: `refute_${Date.now()}`,
    timestamp: Date.now(),
    dimension,
    ather_claim,
    user_response,
    user_nuance,
    confidence_delta: delta,
  };

  // If we have a PNN vector, update confidence for this dimension
  let pnn = memory.pnn_vector;
  if (pnn && dimension in pnn) {
    const dim = pnn[dimension as keyof PNNVector] as VectorDimension<unknown>;
    const new_conf = Math.min(1, Math.max(0, dim.confidence + delta));
    pnn = {
      ...pnn,
      [dimension]: {
        ...dim,
        confidence: new_conf,
        evidence_count: dim.evidence_count + 1,
        last_refuted: Date.now(),
      },
    };
  }

  return {
    ...memory,
    pnn_vector: pnn,
    refutation_log: [...memory.refutation_log, entry],
  };
}

/**
 * Initialise a PNN vector from script result.
 * Called once after script is completed.
 */
export function initPNNVector(memory: Memory): Memory {
  const v = memory.personality_vector;
  const pnn: PNNVector = {
    trust_threshold:       { value: v?.trust_threshold ?? 0.5,        confidence: 0.4, drift_rate: 'slow',   evidence_count: v ? 1 : 0 },
    conflict_style:        { value: v?.conflict_style ?? 'avoidant',   confidence: 0.4, drift_rate: 'medium', evidence_count: v ? 1 : 0 },
    attachment_pattern:    { value: v?.attachment_pattern ?? 'anxious', confidence: 0.4, drift_rate: 'fast',   evidence_count: v ? 1 : 0 },
    self_disclosure_depth: { value: 0.4,  confidence: 0.2, drift_rate: 'slow',   evidence_count: 0 },
    cognitive_rigidity:    { value: 0.5,  confidence: 0.2, drift_rate: 'slow',   evidence_count: 0 },
    emotional_granularity: { value: 0.5,  confidence: 0.2, drift_rate: 'medium', evidence_count: 0 },
    help_seeking_pattern:  { value: 'indirect', confidence: 0.2, drift_rate: 'slow', evidence_count: 0 },
    shame_sensitivity:     { value: 0.5,  confidence: 0.2, drift_rate: 'slow',   evidence_count: 0 },
    growth_orientation:    { value: 0.5,  confidence: 0.2, drift_rate: 'medium', evidence_count: 0 },
    relational_investment: { value: 0.5,  confidence: 0.2, drift_rate: 'fast',   evidence_count: 0 },
    autonomy_need:         { value: 0.5,  confidence: 0.2, drift_rate: 'slow',   evidence_count: 0 },
    meaning_seeking:       { value: 0.5,  confidence: 0.2, drift_rate: 'slow',   evidence_count: 0 },
  };
  return { ...memory, pnn_vector: pnn };
}

// ================================================================
// UBV — Unified Belief Vector (single source of truth)
// ================================================================

import type {
  UBV, BeliefDim, UBVEvidenceSource, RCIResult, YouShifted,
  BeliefDimKind,
} from '../shared/types.js';
import { DIMENSION_KIND_MAP } from '../evidence/confidence-decay.js';

const DIMENSION_KEYS = [
  'trustBoundaries', 'conflictResponse', 'attachment', 'emotionRegulation',
  'stressResponse', 'achievementMotivation', 'selfCognition', 'socialEnergy',
  'emotionalGranularity', 'shameSensitivity', 'helpSeekingPattern',
  'linguisticExtraversion', 'narrativeCoherence', 'growthOrientation',
] as const;

function beliefKindForDimension(dimension: string): BeliefDimKind {
  return DIMENSION_KIND_MAP[dimension] ?? 'trait';
}

function freshBeliefDim(source: UBVEvidenceSource): BeliefDim {
  const now = Date.now();
  return {
    value: 50,
    variance: 100,
    evidence_count: 0,
    last_updated: now,
    last_evidence_at: now,
    sources: [source],
    confidence: 0.2,
    kind: 'trait',
    correction_count: 0,
  };
}

export function createUBV(scriptCompleted = false): UBV {
  const now = Date.now();
  const ubv: Record<string, BeliefDim> = {};
  const src: UBVEvidenceSource = scriptCompleted ? 'script' : 'self_report';
  for (const k of DIMENSION_KEYS) {
    ubv[k] = { ...freshBeliefDim(src), kind: beliefKindForDimension(k) };
  }

  return {
    trustBoundaries:      ubv.trustBoundaries,
    conflictResponse:     ubv.conflictResponse,
    attachment:           ubv.attachment,
    emotionRegulation:   ubv.emotionRegulation,
    stressResponse:      ubv.stressResponse,
    achievementMotivation:    ubv.achievementMotivation,
    selfCognition:       ubv.selfCognition,
    socialEnergy:        ubv.socialEnergy,
    emotionalGranularity: ubv.emotionalGranularity,
    shameSensitivity:     ubv.shameSensitivity,
    helpSeekingPattern:   ubv.helpSeekingPattern,
    linguisticExtraversion: ubv.linguisticExtraversion,
    narrativeCoherence:   ubv.narrativeCoherence,
    growthOrientation:   ubv.growthOrientation,
    currentMood: { label: '', intensity: 0, timestamp: now },
    quickState: { active_topics: [], mention_counts: {}, last_active: now },
    meta: {
      created_at: now,
      last_active: now,
      total_turns: 0,
      script_completed: scriptCompleted,
    },
  };
}

export function updateUBVFromSource(
  ubv: UBV,
  dimension: string,
  newValue: number,
  source: UBVEvidenceSource,
): UBV {
  if (!(dimension in ubv)) return ubv;

  const dim = ubv[dimension as keyof UBV] as BeliefDim;
  if (!dim || typeof dim !== 'object' || !('value' in dim)) return ubv;

  // Source weights: controls how much a single observation moves the posterior
  // script = high confidence (assessment), chat = moderate, diary = light, self_report = lightest
  const SOURCE_WEIGHT: Record<UBVEvidenceSource, number> = {
    script: 0.65,
    chat: 0.20,
    diary: 0.15,
    self_report: 0.10,
  };
  const weight = SOURCE_WEIGHT[source] ?? 0.20;

  const n = dim.evidence_count + 1;
  // Variance inversely proportional to weight: script observation is "trustworthy"
  // weight=0.65 → effective_variance lower → stronger pull toward newValue
  const new_obs_variance = (100 / n) / weight;
  // Pooled variance (inverse-variance weighting)
  const pooled_variance = 1 / (1 / dim.variance + 1 / new_obs_variance);
  // Posterior mean (precision-weighted)
  const posterior_mean = pooled_variance * (dim.value / dim.variance + newValue / new_obs_variance);

  const updated_dim: BeliefDim = {
    value: Math.round(posterior_mean * 10) / 10,
    variance: Math.round(pooled_variance * 100) / 100,
    evidence_count: n,
    last_updated: Date.now(),
    last_evidence_at: Date.now(),
    sources: dim.sources.includes(source) ? dim.sources : [...dim.sources, source],
    confidence: Math.min(0.99, n / (n + 4)),
    kind: dim.kind ?? beliefKindForDimension(dimension),
    correction_count: dim.correction_count ?? 0,
  };

  return { ...ubv, [dimension]: updated_dim };
}

// ================================================================
// Rolling Baseline — 每 30 天自动滚动一次
// ================================================================

const ROLLING_BASELINE_INTERVAL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

/**
 * 每次对话开始时调用。
 * 如果距离上次滚动已超过 30 天，将 rolling_baseline_ubv 更新为当前 UBV 快照。
 * original baseline_ubv 永不改变。
 */
export function maybeRollBaseline(memory: Memory): Memory {
  if (!memory.ubv) return memory;

  const lastRolled = memory.meta.rolling_baseline_updated_at ?? 0;
  const now = Date.now();

  if (now - lastRolled < ROLLING_BASELINE_INTERVAL_MS) return memory;

  return {
    ...memory,
    rolling_baseline_ubv: JSON.parse(JSON.stringify(memory.ubv)) as UBV,
    meta: {
      ...memory.meta,
      rolling_baseline_updated_at: now,
    },
  };
}

export function computeRCI(
  current: UBV,
  baseline: UBV,
  dimension: string,
): RCIResult | null {
  const cur = current[dimension as keyof UBV] as BeliefDim | undefined;
  const bas = baseline[dimension as keyof UBV] as BeliefDim | undefined;
  if (!cur || !bas) return null;

  const SE = Math.sqrt(cur.variance + bas.variance);
  if (SE === 0) return null;

  const rciValue = (cur.value - bas.value) / SE;
  return {
    dimension,
    current: cur.value,
    baseline: bas.value,
    SE,
    RCI: rciValue,
    // p < 0.05 two-tailed on a standard-normal RCI distribution (Jacobson & Truax)
    significant: Math.abs(rciValue) > 1.96,
  };
}

export function detectYouShifted(
  current: UBV,
  originalBaseline: UBV,
  locale: string = 'zh-CN',
  recentCorrections: string[] = [],
  recentMessages: Array<{ content: string }> = [],
  rollingBaseline?: UBV | null,
): YouShifted | null {
  // ── 通俗维度名称 ──
  const dimLabels: Record<string, Record<string, string>> = {
    trustBoundaries:      { 'zh-CN': '对人的信任度',       en: 'How Much You Trust Others',       ja: '人への信頼度',           es: 'Confianza en los Demás' },
    conflictResponse:     { 'zh-CN': '遇到冲突的反应',     en: 'How You Handle Conflict',         ja: '対立時の反応',           es: 'Cómo Reaccionas al Conflicto' },
    attachment:           { 'zh-CN': '跟别人的亲近感',     en: 'Closeness with Others',           ja: '人との親密さ',           es: 'Cercanía con los Demás' },
    emotionRegulation:    { 'zh-CN': '管理情绪的方式',     en: 'How You Manage Emotions',         ja: '感情の扱い方',           es: 'Cómo Manejas las Emociones' },
    stressResponse:       { 'zh-CN': '压力下的状态',       en: 'How You Handle Pressure',         ja: 'プレッシャー下の状態',   es: 'Cómo Manejas la Presión' },
    achievementMotivation:{ 'zh-CN': '做事的动力',         en: 'Your Drive to Do Things',         ja: '行動への意欲',           es: 'Tu Motivación para Actuar' },
    selfCognition:        { 'zh-CN': '了解自己的程度',     en: 'How Well You Know Yourself',      ja: '自分の理解度',           es: 'Cuánto Te Conoces' },
    socialEnergy:         { 'zh-CN': '和人相处的能量',     en: 'Energy Around People',            ja: '人付き合いのエネルギー', es: 'Energía con las Personas' },
    emotionalGranularity: { 'zh-CN': '感受情绪的细腻程度', en: 'How Precisely You Feel Emotions', ja: '感情の細やかさ',         es: 'Precisión al Sentir Emociones' },
    shameSensitivity:     { 'zh-CN': '被否定时的感受',     en: 'Sensitivity to Criticism',        ja: '批判への敏感さ',         es: 'Sensibilidad a las Críticas' },
    helpSeekingPattern:   { 'zh-CN': '遇到困难会不会求助', en: 'Whether You Ask for Help',        ja: '困ったとき助けを求めるか', es: 'Si Pides Ayuda cuando la Necesitas' },
    linguisticExtraversion:{ 'zh-CN': '说话的表达方式',   en: 'How You Express Yourself',        ja: '表現の仕方',             es: 'Cómo Te Expresas' },
    narrativeCoherence:   { 'zh-CN': '讲故事的连贯程度',   en: 'How Coherently You Tell Stories', ja: '話の一貫性',             es: 'Coherencia al Contar tu Historia' },
    growthOrientation:    { 'zh-CN': '想要改变的意愿',     en: 'How Much You Want to Change',     ja: '変わりたいという意欲',   es: 'Deseo de Cambiar y Crecer' },
  };

  const l = locale === 'en' || locale === 'ja' || locale === 'es' ? locale : 'zh-CN';

  // ── 对两条基线分别做 RCI 检测 ──
  type SigResult = { dim: string; rci: RCIResult; type: 'recent' | 'longterm' | 'both' };
  const sigMap = new Map<string, { recent?: RCIResult; longterm?: RCIResult }>();

  for (const dim of DIMENSION_KEYS) {
    if (recentCorrections.includes(dim)) continue;

    // 近期变化：对比 rolling baseline（如果有）
    if (rollingBaseline) {
      const rci = computeRCI(current, rollingBaseline, dim);
      if (rci && Math.abs(rci.RCI) > 1.96) {
        const entry = sigMap.get(dim) ?? {};
        entry.recent = { ...rci, significant: true };
        sigMap.set(dim, entry);
      }
    }

    // 长期变化：对比 original baseline
    const rci = computeRCI(current, originalBaseline, dim);
    if (rci && Math.abs(rci.RCI) > 1.96) {
      const entry = sigMap.get(dim) ?? {};
      entry.longterm = { ...rci, significant: true };
      sigMap.set(dim, entry);
    }
  }

  if (sigMap.size === 0) return null;

  // ── 选出最强信号：both > recent > longterm，同类中取 |RCI| 最大 ──
  let best: SigResult | null = null;
  let bestScore = 0;

  for (const [dim, { recent, longterm }] of sigMap) {
    // Multi-source gating: require ≥2 distinct source types
    const sources = (current[dim as keyof UBV] as BeliefDim)?.sources ?? [];
    if ([...new Set(sources)].length < 2) continue;

    const rciToUse = recent ?? longterm!;
    const score = Math.abs(rciToUse.RCI) * (recent && longterm ? 1.5 : 1);

    if (score > bestScore) {
      bestScore = score;
      best = {
        dim,
        rci: rciToUse,
        type: recent && longterm ? 'both' : recent ? 'recent' : 'longterm',
      };
    }
  }

  if (!best) return null;

  const { dim, rci: top, type: comparison_type } = best;
  const direction_key = top.RCI > 0 ? 'positive' : 'negative';
  const sources = (current[dim as keyof UBV] as BeliefDim)?.sources ?? [];
  const dimLabel = dimLabels[dim]?.[l] ?? dimLabels[dim]?.['en'] ?? dim;

  // ── 量级：|RCI| → subtle / moderate / profound ──
  const absRCI = Math.abs(top.RCI);
  const magnitude: ShiftMagnitude = absRCI >= 5.0 ? 'profound' : absRCI >= 3.0 ? 'moderate' : 'subtle';

  // ── 从最近对话提取原话 ──
  const meaningful = recentMessages.filter((m) => m.content.trim().length > 15);
  let before_quote: string | undefined;
  let after_quote: string | undefined;
  if (meaningful.length >= 2) {
    const first = meaningful[0]!;
    const last  = meaningful[meaningful.length - 1]!;
    if (first !== last) {
      before_quote = first.content.slice(0, 70) + (first.content.length > 70 ? '……' : '');
      after_quote  = last.content.slice(0, 70) + (last.content.length > 70 ? '……' : '');
    }
  }

  // ── 叙事模板矩阵：comparison_type × magnitude × direction × locale ──
  // 设计原则：
  //   recent × subtle   → 轻声提示，"悄悄"，不打断，语气平和
  //   recent × moderate → 明确指出，带证据，语气直接
  //   recent × profound → 有点震惊，庆祝或关怀，停下来说清楚
  //   longterm × any    → 回望视角，"跟最初的你"，时间感更强
  //   both              → 加速感，"不只是最近，一直在变"
  type NarrativeFn = (dimLabel: string, bq?: string, aq?: string) => string;
  type NarrativeKey = `${ShiftComparisonType}_${ShiftMagnitude}_${typeof direction_key}`;

  const NARRATIVES: Record<NarrativeKey, Record<string, NarrativeFn>> = {
    recent_subtle_positive: {
      'zh-CN': (d, bq, aq) => bq && aq
        ? `最近，你在「${d}」这件事上悄悄变好了一点。\n\n你之前说：「${bq}」\n最近你说：「${aq}」\n\n不是感觉，是真的在变。`
        : `最近，你在「${d}」这件事上，悄悄有了一些不同。`,
      en: (d, bq, aq) => bq && aq
        ? `Lately, there's been a quiet shift in "${d}".\n\nYou used to say: "${bq}"\nNow: "${aq}"\n\nNot just a feeling — it's real.`
        : `Lately, something has quietly shifted in "${d}".`,
      ja: (d, bq, aq) => bq && aq
        ? `最近、「${d}」にそっと変化があった。\n\n以前：「${bq}」\n最近：「${aq}」\n\n感覚ではなく、本当に変わっている。`
        : `最近、「${d}」にそっと変化が見られる。`,
      es: (d, bq, aq) => bq && aq
        ? `Últimamente, hay un cambio silencioso en "${d}".\n\nAntes decías: "${bq}"\nAhora: "${aq}"\n\nNo es solo una sensación — es real.`
        : `Últimamente, algo ha cambiado sutilmente en "${d}".`,
    },
    recent_subtle_negative: {
      'zh-CN': (d, bq, aq) => bq && aq
        ? `最近在「${d}」这件事上，你有一点退步，幅度不大，但我注意到了。\n\n你之前说：「${bq}」\n最近你说：「${aq}」`
        : `最近在「${d}」这件事上，有一点退步——幅度不大，不用担心，但值得注意。`,
      en: (d, bq, aq) => bq && aq
        ? `There's been a small dip in "${d}" recently. Not big, but I noticed.\n\nBefore: "${bq}"\nNow: "${aq}"`
        : `There's been a small dip in "${d}" recently. Not alarming, but worth noting.`,
      ja: (d, bq, aq) => bq && aq
        ? `最近「${d}」に少し後退が見られる。大きくはないが気づいた。\n\n以前：「${bq}」\n最近：「${aq}」`
        : `最近「${d}」に少し後退が見られる。大きくはないが、注目しておこう。`,
      es: (d, bq, aq) => bq && aq
        ? `Ha habido una pequeña baja en "${d}" recientemente. No es grande, pero lo noté.\n\nAntes: "${bq}"\nAhora: "${aq}"`
        : `Ha habido una pequeña baja en "${d}" recientemente. No es alarmante, pero vale la pena notar.`,
    },
    recent_moderate_positive: {
      'zh-CN': (d, bq, aq) => bq && aq
        ? `这个月，你在「${d}」上变化很明显——你现在处理这件事的方式，跟一个月前完全不一样了。\n\n你之前说：「${bq}」\n最近你说：「${aq}」`
        : `这个月，你在「${d}」上的变化很明显。你现在处理这件事的方式，已经不一样了。`,
      en: (d, bq, aq) => bq && aq
        ? `This month, the change in "${d}" is clear — how you handle it now is completely different from a month ago.\n\nBefore: "${bq}"\nNow: "${aq}"`
        : `This month, the change in "${d}" is clear. How you handle this has shifted.`,
      ja: (d, bq, aq) => bq && aq
        ? `今月、「${d}」の変化は明確だ。今の対処の仕方は1ヶ月前とは全く違う。\n\n以前：「${bq}」\n最近：「${aq}」`
        : `今月、「${d}」の変化は明確だ。今の対処の仕方は変わっている。`,
      es: (d, bq, aq) => bq && aq
        ? `Este mes, el cambio en "${d}" es claro — cómo lo manejas ahora es completamente diferente a hace un mes.\n\nAntes: "${bq}"\nAhora: "${aq}"`
        : `Este mes, el cambio en "${d}" es claro. Cómo manejas esto ha cambiado.`,
    },
    recent_moderate_negative: {
      'zh-CN': (d, bq, aq) => bq && aq
        ? `这个月「${d}」有些波动，变化挺明显的。\n\n你之前说：「${bq}」\n最近你说：「${aq}」\n\n我们一起看看是什么影响到了你。`
        : `这个月「${d}」有些波动，变化挺明显的——我们一起看看是什么在影响你。`,
      en: (d, bq, aq) => bq && aq
        ? `There's been noticeable turbulence in "${d}" this month.\n\nBefore: "${bq}"\nNow: "${aq}"\n\nLet's look at what's been affecting you.`
        : `There's been noticeable turbulence in "${d}" this month. Let's look at what's affecting you.`,
      ja: (d, bq, aq) => bq && aq
        ? `今月「${d}」に顕著な波があった。\n\n以前：「${bq}」\n最近：「${aq}」\n\n何が影響しているか見てみよう。`
        : `今月「${d}」に顕著な波があった。何が影響しているか見てみよう。`,
      es: (d, bq, aq) => bq && aq
        ? `Ha habido turbulencia notable en "${d}" este mes.\n\nAntes: "${bq}"\nAhora: "${aq}"\n\nVeamos qué te ha estado afectando.`
        : `Ha habido turbulencia notable en "${d}" este mes. Veamos qué te afecta.`,
    },
    recent_profound_positive: {
      'zh-CN': (d, bq, aq) => bq && aq
        ? `你最近在「${d}」上的变化挺大的——这不是小波动，你真的在往前走。\n\n你之前说：「${bq}」\n现在你说：「${aq}」\n\n这值得我们专门聊一聊。`
        : `你最近在「${d}」上的变化很大。这不是小波动——你真的在往前走。`,
      en: (d, bq, aq) => bq && aq
        ? `You've changed a lot in "${d}" recently — this isn't a small shift, you're really moving forward.\n\nBefore: "${bq}"\nNow: "${aq}"\n\nThis deserves a real conversation.`
        : `You've changed a lot in "${d}" recently. This isn't a small shift — you're genuinely moving forward.`,
      ja: (d, bq, aq) => bq && aq
        ? `最近「${d}」で大きな変化があった。これは小さな波ではなく、本当に前進している。\n\n以前：「${bq}」\n今：「${aq}」\n\nこれについてちゃんと話そう。`
        : `最近「${d}」で大きな変化があった。これは前進だ。`,
      es: (d, bq, aq) => bq && aq
        ? `Has cambiado mucho en "${d}" recientemente — esto no es un cambio pequeño, realmente estás avanzando.\n\nAntes: "${bq}"\nAhora: "${aq}"\n\nEsto merece una conversación real.`
        : `Has cambiado mucho en "${d}" recientemente. Esto no es pequeño — realmente estás avanzando.`,
    },
    recent_profound_negative: {
      'zh-CN': (d, bq, aq) => bq && aq
        ? `你最近在「${d}」上变化很大——这块需要我们认真看一下。\n\n你之前说：「${bq}」\n最近你说：「${aq}」\n\n我想了解发生了什么。`
        : `你最近在「${d}」上变化很大——这块需要我们认真坐下来聊聊。`,
      en: (d, bq, aq) => bq && aq
        ? `You've changed a lot in "${d}" recently — this needs a real look.\n\nBefore: "${bq}"\nNow: "${aq}"\n\nI want to understand what happened.`
        : `You've changed a lot in "${d}" recently. This needs a real conversation.`,
      ja: (d, bq, aq) => bq && aq
        ? `最近「${d}」で大きな変化があった。ちゃんと向き合う必要がある。\n\n以前：「${bq}」\n最近：「${aq}」\n\n何があったのか聞かせて。`
        : `最近「${d}」で大きな変化があった。ちゃんと話し合おう。`,
      es: (d, bq, aq) => bq && aq
        ? `Has cambiado mucho en "${d}" recientemente — esto necesita una mirada seria.\n\nAntes: "${bq}"\nAhora: "${aq}"\n\nQuiero entender qué pasó.`
        : `Has cambiado mucho en "${d}" recientemente. Esto necesita una conversación seria.`,
    },
    longterm_subtle_positive: {
      'zh-CN': (d, bq, aq) => bq && aq
        ? `回头看，你在「${d}」上慢慢地有了一些不同——那种不容易察觉、但真实发生的变化。\n\n你之前说过：「${bq}」\n现在你会说：「${aq}」`
        : `回头看，你在「${d}」上慢慢地有了一些不同——那种不容易察觉、但真实发生的变化。`,
      en: (d, bq, aq) => bq && aq
        ? `Looking back, you've slowly changed in "${d}" — the kind of shift that's hard to notice but real.\n\nYou used to say: "${bq}"\nNow you'd say: "${aq}"`
        : `Looking back, you've slowly changed in "${d}" — the kind of shift that's hard to notice but real.`,
      ja: (d, bq, aq) => bq && aq
        ? `振り返ると、「${d}」でゆっくりと変化があった——気づきにくいが本物の変化だ。\n\n以前：「${bq}」\n今：「${aq}」`
        : `振り返ると、「${d}」でゆっくりと変化があった。気づきにくいが本物だ。`,
      es: (d, bq, aq) => bq && aq
        ? `Mirando atrás, has cambiado lentamente en "${d}" — el tipo de cambio difícil de notar pero real.\n\nAntes: "${bq}"\nAhora: "${aq}"`
        : `Mirando atrás, has cambiado lentamente en "${d}" — difícil de notar pero real.`,
    },
    longterm_subtle_negative: {
      'zh-CN': (d) => `从长远来看，你在「${d}」上有些积累的退步——不急，但这是值得关注的一条线。`,
      en: (d) => `Looking at the longer picture, there's been some gradual drift in "${d}" — not urgent, but a line worth watching.`,
      ja: (d) => `長い目で見ると、「${d}」にじわじわとした後退がある——急ぎではないが、注目すべき傾向だ。`,
      es: (d) => `Mirando el panorama general, ha habido una deriva gradual en "${d}" — no urgente, pero una tendencia que vale la pena observar.`,
    },
    longterm_moderate_positive: {
      'zh-CN': (d, bq, aq) => bq && aq
        ? `跟你刚开始用 Ather 的时候比，你在「${d}」这件事上已经不一样了。\n\n你之前说：「${bq}」\n现在你会说：「${aq}」\n\n这是真实的成长。`
        : `跟你刚开始用 Ather 的时候比，你在「${d}」这件事上已经不一样了。这是真实的成长。`,
      en: (d, bq, aq) => bq && aq
        ? `Compared to when you first started, you've genuinely changed in "${d}".\n\nYou used to say: "${bq}"\nNow: "${aq}"\n\nThat's real growth.`
        : `Compared to when you first started, you've genuinely changed in "${d}". That's real growth.`,
      ja: (d, bq, aq) => bq && aq
        ? `最初と比べると、「${d}」で本当に変わった。\n\n以前：「${bq}」\n今：「${aq}」\n\nこれは本物の成長だ。`
        : `最初と比べると、「${d}」で本当に変わった。これは本物の成長だ。`,
      es: (d, bq, aq) => bq && aq
        ? `Comparado con cuando empezaste, has cambiado genuinamente en "${d}".\n\nAntes: "${bq}"\nAhora: "${aq}"\n\nEso es crecimiento real.`
        : `Comparado con cuando empezaste, has cambiado genuinamente en "${d}". Eso es crecimiento real.`,
    },
    longterm_moderate_negative: {
      'zh-CN': (d) => `跟你最初相比，「${d}」这一块有些漂移——有什么东西在慢慢影响你，我们可以一起找找看。`,
      en: (d) => `Compared to when you started, there's been some drift in "${d}" — something has been slowly affecting you. Let's look at it together.`,
      ja: (d) => `最初と比べると、「${d}」にある程度の漂流がある——何かがじわじわと影響している。一緒に見てみよう。`,
      es: (d) => `Comparado con cuando empezaste, ha habido una deriva en "${d}" — algo te ha estado afectando lentamente. Veámoslo juntos.`,
    },
    longterm_profound_positive: {
      'zh-CN': (d, bq, aq) => bq && aq
        ? `你跟一开始的自己，在「${d}」这件事上，已经不是同一个人了。\n\n你当时说：「${bq}」\n现在你会说：「${aq}」\n\n这是真实的成长，不是表演。`
        : `你跟一开始的自己，在「${d}」这件事上，已经不是同一个人了。这是真实的成长。`,
      en: (d, bq, aq) => bq && aq
        ? `You're not the same person you were when you started — at least in "${d}".\n\nBack then you said: "${bq}"\nNow you say: "${aq}"\n\nThis is real growth, not performance.`
        : `You're not the same person you were when you started — at least in "${d}". This is real growth.`,
      ja: (d, bq, aq) => bq && aq
        ? `「${d}」については、最初の自分とは別人になった。\n\n当時：「${bq}」\n今：「${aq}」\n\nこれは本物の成長だ。`
        : `「${d}」については、最初の自分とは別人になった。これは本物の成長だ。`,
      es: (d, bq, aq) => bq && aq
        ? `Ya no eres la misma persona que eras cuando empezaste — al menos en "${d}".\n\nAntes decías: "${bq}"\nAhora dices: "${aq}"\n\nEso es crecimiento real, no actuación.`
        : `Ya no eres la misma persona que eras cuando empezaste — al menos en "${d}". Eso es crecimiento real.`,
    },
    longterm_profound_negative: {
      'zh-CN': (d) => `从最初到现在，你在「${d}」上有了很大的变化——这不是坏事，但值得我们深聊，因为这条线是从很久之前就开始的。`,
      en: (d) => `From the start until now, you've changed a lot in "${d}" — not necessarily bad, but worth a deep conversation. This line started a long time ago.`,
      ja: (d) => `最初から今まで、「${d}」で大きな変化があった——悪いことではないが、深く話す価値がある。この流れはずっと前から始まっていた。`,
      es: (d) => `Desde el inicio hasta ahora, has cambiado mucho en "${d}" — no necesariamente malo, pero merece una conversación profunda. Esta línea comenzó hace mucho.`,
    },
    both_subtle_positive:   { 'zh-CN': (d) => `你在「${d}」上的变化，不只是最近——从开始到现在，一直在慢慢往好的方向走。`,  en: (d) => `The change in "${d}" isn't just recent — you've been slowly moving in a better direction from the very start.`, ja: (d) => `「${d}」の変化は最近だけでなく、最初からずっとよい方向に向かっている。`, es: (d) => `El cambio en "${d}" no es solo reciente — has ido lentamente en una mejor dirección desde el principio.` },
    both_subtle_negative:   { 'zh-CN': (d) => `我注意到你在「${d}」上的变化，不只是最近——从一开始就在慢慢积累，我们来看看这条线。`, en: (d) => `The shift in "${d}" isn't just recent — it's been accumulating from the start. Let's look at this pattern.`, ja: (d) => `「${d}」の変化は最近だけでなく、最初から積み重なっている。このパターンを見てみよう。`, es: (d) => `El cambio en "${d}" no es solo reciente — ha ido acumulándose desde el principio. Veamos este patrón.` },
    both_moderate_positive: { 'zh-CN': (d, bq, aq) => bq && aq ? `你不只是最近在变——在「${d}」这件事上，从你一开始用 Ather 到现在，一直在走一条新的路。\n\n你之前说：「${bq}」\n现在你说：「${aq}」` : `你不只是最近在变——在「${d}」这件事上，从一开始到现在，一直在走一条新的路。`, en: (d, bq, aq) => bq && aq ? `You haven't just changed recently — in "${d}", you've been on a new path since the very beginning.\n\nBefore: "${bq}"\nNow: "${aq}"` : `You haven't just changed recently — in "${d}", you've been on a new path all along.`, ja: (d, bq, aq) => bq && aq ? `「${d}」の変化は最近だけでなく、最初から新しい道を歩んでいる。\n\n以前：「${bq}」\n今：「${aq}」` : `「${d}」の変化は最近だけでなく、最初から新しい道を歩んでいる。`, es: (d, bq, aq) => bq && aq ? `No solo has cambiado recientemente — en "${d}", has estado en un nuevo camino desde el principio.\n\nAntes: "${bq}"\nAhora: "${aq}"` : `No solo has cambiado recientemente — en "${d}", has estado en un nuevo camino desde el principio.` },
    both_moderate_negative: { 'zh-CN': (d) => `在「${d}」上，近期和长期都有变化的信号——这条线需要我们认真聊聊。`, en: (d) => `There are signals of change in "${d}" both recently and over time — this pattern deserves a serious conversation.`, ja: (d) => `「${d}」には短期・長期両方で変化のサインがある。このパターンについてちゃんと話そう。`, es: (d) => `Hay señales de cambio en "${d}" tanto recientemente como a largo plazo — este patrón merece una conversación seria.` },
    both_profound_positive: { 'zh-CN': (d, bq, aq) => bq && aq ? `从你开始用 Ather 到今天，你在「${d}」上的变化，已经跨越了几个阶段。\n\n你最初说：「${bq}」\n现在你说：「${aq}」\n\n这是你自己走出来的路。` : `从你开始用 Ather 到今天，你在「${d}」上的变化已经跨越了几个阶段。这是你自己走出来的路。`, en: (d, bq, aq) => bq && aq ? `From when you started to today, the change in "${d}" has spanned multiple chapters.\n\nAt first: "${bq}"\nNow: "${aq}"\n\nThis is a path you built yourself.` : `From when you started to today, the change in "${d}" has spanned multiple chapters. This is a path you built yourself.`, ja: (d, bq, aq) => bq && aq ? `最初から今日まで、「${d}」の変化はいくつかの段階を経てきた。\n\n最初：「${bq}」\n今：「${aq}」\n\nこれはあなた自身が歩んだ道だ。` : `最初から今日まで、「${d}」の変化はいくつかの段階を経てきた。これはあなた自身の道だ。`, es: (d, bq, aq) => bq && aq ? `Desde que empezaste hasta hoy, el cambio en "${d}" ha abarcado varios capítulos.\n\nAl principio: "${bq}"\nAhora: "${aq}"\n\nEste es un camino que tú mismo construiste.` : `Desde que empezaste hasta hoy, el cambio en "${d}" ha abarcado varios capítulos. Este es un camino que tú mismo construiste.` },
    both_profound_negative: { 'zh-CN': (d) => `在「${d}」上，你的变化是长期积累的——近期加速了。我们需要停下来认真看看这条线从哪里开始。`, en: (d) => `The change in "${d}" has been building for a long time — and it's accelerating recently. We need to stop and look at where this line started.`, ja: (d) => `「${d}」の変化は長期間積み重なり、最近加速している。この流れがどこから始まったか、立ち止まってちゃんと見てみよう。`, es: (d) => `El cambio en "${d}" ha estado acumulándose por mucho tiempo — y está acelerando recientemente. Necesitamos detenernos y ver dónde comenzó esta línea.` },
  };

  const key: NarrativeKey = `${comparison_type}_${magnitude}_${direction_key}`;
  const templateMap = NARRATIVES[key];
  const templateFn = templateMap?.[l] ?? templateMap?.['en'];
  const narrative_insight = templateFn
    ? templateFn(dimLabel, before_quote, after_quote)
    : direction_key === 'positive'
      ? (l === 'zh-CN' ? `你在「${dimLabel}」上变好了——真实发生的变化。` : `You've improved in "${dimLabel}" — real change.`)
      : (l === 'zh-CN' ? `你在「${dimLabel}」上有些退步——我们一起看看。` : `There's been a dip in "${dimLabel}" — let's look together.`);

  return {
    dimension: dim,
    RCI: top,
    narrative_insight,
    evidence_sources: [...new Set(sources)] as UBVEvidenceSource[],
    before_quote,
    after_quote,
    magnitude,
    comparison_type,
  };
}

export function updateUBVMood(
  ubv: UBV,
  label: string,
  intensity: number,
): UBV {
  return {
    ...ubv,
    currentMood: { label, intensity, timestamp: Date.now() },
  };
}

export function updateUBVQuickState(
  ubv: UBV,
  active_topics: string[],
  mention_counts: Record<string, number>,
): UBV {
  return {
    ...ubv,
    quickState: { active_topics, mention_counts, last_active: Date.now() },
    meta: { ...ubv.meta, last_active: Date.now() },
  };
}

export function getUBVConfidence(ubv: UBV, dimension: string): number {
  const dim = ubv[dimension as keyof UBV] as BeliefDim | undefined;
  return dim?.confidence ?? 0;
}

export function getUBVDimensionValue(ubv: UBV, dimension: string): number {
  const dim = ubv[dimension as keyof UBV] as BeliefDim | undefined;
  return dim?.value ?? 50;
}

// ================================================================
// Mechanism B: Time Capsule
// ================================================================

// Patterns that indicate a quote is worth storing for future contradiction detection
const QUOTE_PATTERNS: Array<{ pattern: RegExp; dimension: string; trigger_condition: TimeCapsule['trigger_condition'] }> = [
  { pattern: /我不在乎|不关心我|无所谓|没必要|不值得/, dimension: 'shame_sensitivity',      trigger_condition: 'contradiction' },
  { pattern: /我不需要任何人|一个人也行|不需要朋友/, dimension: 'relational_investment',    trigger_condition: 'contradiction' },
  { pattern: /我不怕冲突|我不会退步|我会直说/, dimension: 'conflict_style',              trigger_condition: 'contradiction' },
  { pattern: /我很理性|情绪不影响我|我很冷静/, dimension: 'emotional_granularity',       trigger_condition: 'contradiction' },
  { pattern: /我清楚自己想要什么|我知道自己的方向/, dimension: 'meaning_seeking',           trigger_condition: 'elapsed_7d' },
  { pattern: /我不会再|我绝对不会|我发誓/, dimension: 'cognitive_rigidity',            trigger_condition: 'contradiction' },
];

/**
 * Extract quoteable statements from a user message and return new TimeCapsule entries.
 */
export function extractTimeCapsules(
  memory: Memory,
  user_message: string,
): TimeCapsule[] {
  const results: TimeCapsule[] = [];

  for (const { pattern, dimension, trigger_condition } of QUOTE_PATTERNS) {
    if (pattern.test(user_message)) {
      // Avoid duplicate capsules for same dimension within 3 days
      const recent_capsule = memory.time_capsules.find(
        (c) => c.dimension_hint === dimension && Date.now() - c.timestamp < 3 * 24 * 60 * 60 * 1000,
      );
      if (recent_capsule) continue;

      results.push({
        id: `capsule_${Date.now()}_${dimension}`,
        quote: user_message.slice(0, 200),
        timestamp: Date.now(),
        context_tags: memory.quick_state.active_topics.slice(0, 5),
        dimension_hint: dimension,
        triggered: false,
        trigger_condition,
      });
    }
  }

  return results;
}

/**
 * Add new time capsules to memory.
 */
export function addTimeCapsules(memory: Memory, capsules: TimeCapsule[]): Memory {
  if (capsules.length === 0) return memory;
  return { ...memory, time_capsules: [...memory.time_capsules, ...capsules] };
}

/**
 * Find the best time capsule to surface right now.
 * Returns a capsule if:
 *   (a) trigger_condition === 'contradiction' AND current message contradicts the quote
 *   (b) trigger_condition === 'elapsed_7d' AND 7+ days have passed
 *
 * Fires at most once every 10 turns.
 */
export function detectTimeCapsule(
  memory: Memory,
  user_message: string,
): TimeCapsule | undefined {
  // Cool-down: at most once every 10 turns
  const last_tc_turn = memory.conversation_history
    .slice()
    .reverse()
    .findIndex((t) => t.engine_triggered === 'timecapsule');
  if (last_tc_turn !== -1 && last_tc_turn < 10) return undefined;

  const now = Date.now();

  for (const capsule of memory.time_capsules) {
    if (capsule.triggered) continue;

    if (
      capsule.trigger_condition === 'elapsed_7d' &&
      now - capsule.timestamp >= 7 * 24 * 60 * 60 * 1000
    ) {
      return capsule;
    }

    if (capsule.trigger_condition === 'contradiction') {
      // Look for behavioral contradiction: topic_repeat_count ≥ 3 for a related topic
      for (const tag of capsule.context_tags) {
        const count = memory.quick_state.mention_counts[tag] ?? 0;
        // If user originally claimed not to care about topic X, but has mentioned it 5+ times
        if (count >= 5) return capsule;
      }
      // Also fire if 14+ days elapsed since capture
      if (now - capsule.timestamp >= 14 * 24 * 60 * 60 * 1000) return capsule;
    }
  }

  return undefined;
}

/**
 * Mark a time capsule as triggered.
 */
export function markTimeCapsuleTriggered(memory: Memory, capsule_id: string): Memory {
  return {
    ...memory,
    time_capsules: memory.time_capsules.map((c) =>
      c.id === capsule_id ? { ...c, triggered: true } : c,
    ),
  };
}
