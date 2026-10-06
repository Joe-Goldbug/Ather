// ================================================================
// EVA Engine - Script Engine
// Processes user choices → PersonalityVector → ScriptResult
// Pure functions, no side effects, no LLM calls needed here
// ================================================================

import type {
  ScenarioChoice, ScenarioId, PersonalityVector, ScriptResult,
  ScriptRunState, ChoiceOption, LLMCaller, DiaryEntry, ScriptEvidence,
  SocialEnergyStyle,
} from '../shared/types.js';
import type { Locale } from '../shared/locales.js';
import {
  SCENARIO_SCHEMAS,
  SCORED_SCENARIO_IDS,
  ALL_SCENARIO_SCHEMAS,
  ARCHETYPES,
  CONTRADICTION_RULES,
  TRUST_NARRATIVES,
  CONFLICT_NARRATIVES,
  ATTACHMENT_NARRATIVES,
  REGULATION_NARRATIVES,
  STRESS_NARRATIVES,
  ACHIEVEMENT_NARRATIVES,
  SELFVIEW_NARRATIVES,
  SOCIALENERGY_NARRATIVES,
  OPENING_MESSAGES,
  type ChoiceVectorPatch,
} from './script-schema.js';
import { getScenarioCopy } from './script-copy.js';
import { buildDynamicScriptPrompt } from '../dialogue/prompts.js';

// Re-export DynamicScenarioDef from script-engine (not types, to avoid circular)
export interface DynamicScenarioDef {
  id: string;
  title: string;
  setup: string;
  prompt: string;
  options: Record<ChoiceOption, ScenarioOptionDef>;
  vector_patch: Record<ChoiceOption, ChoiceVectorPatch>;
}

/** Full scenario definition returned by getScenarioDef — locale-aware merge of schema + copy */
export interface ScenarioDef {
  id: string;
  title: string;
  setup: string;
  prompt: string;
  options: Record<ChoiceOption, ScenarioOptionDef>;
  vector_patch: Record<ChoiceOption, ChoiceVectorPatch>;
}

export interface ScenarioOptionDef {
  text: string;
  label: string;
  feedback: string;
}

const DYNAMIC_OPTIONS: ReadonlyArray<ChoiceOption> = ['A', 'B', 'C', 'D'];
const ALLOWED_VECTOR_PATCH_KEYS = new Set<keyof PersonalityVector>([
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
  'openness_score',
  'stability_score',
  'neuroticism_score',
  'confidence',
]);

const PAT_KEY_MAP: Record<string, string> = {
  'trustboundarythreshold': 'trust_threshold',
  'trust_boundary_threshold': 'trust_threshold',
  'trust_threshold_boundary': 'trust_threshold',
  'trustscore': 'trust_threshold',
  'boundarystrength': 'boundary_strength',
  'boundary_strength_threshold': 'boundary_strength',
  'conflictstyle': 'conflict_style',
  'conflictscore': 'conflict_score',
  'attachmentpattern': 'attachment_pattern',
  'attachmentscore': 'attachment_score',
  'emotionalregulation': 'emotional_regulation',
  'stressresponse': 'stress_response',
  'stressscore': 'stress_score',
  'achievementdrive': 'achievement_drive',
  'perfectionismscore': 'perfectionism_score',
  'selfviewpattern': 'selfview_pattern',
  'growthmindsetscore': 'growth_mindset_score',
  'socialenergy': 'social_energy_style',
  'socialenergyscore': 'social_energy_score',
  'social_energy': 'social_energy_style',
};

const NUMERIC_VECTOR_KEYS = [
  'trust_threshold',
  'boundary_strength',
  'conflict_score',
  'attachment_score',
  'stress_score',
  'perfectionism_score',
  'growth_mindset_score',
  'social_energy_score',
] as const;

const CATEGORICAL_VECTOR_KEYS = [
  'conflict_style',
  'attachment_pattern',
  'emotional_regulation',
  'stress_response',
  'achievement_drive',
  'selfview_pattern',
  'social_energy_style',
] as const;

function createDefaultConfidence(): Record<ScenarioId, number> {
  const confidence = {} as Record<ScenarioId, number>;
  for (const schema of ALL_SCENARIO_SCHEMAS) {
    confidence[schema.id as ScenarioId] = 0.6;
  }
  return confidence;
}

function assertNonEmptyString(value: unknown, field: string): asserts value is string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`LLM returned format error: invalid ${field}`);
  }
}

function validateDynamicScenario(item: unknown, index: number): asserts item is DynamicScenarioDef {
  if (!item || typeof item !== 'object') {
    throw new Error(`LLM returned format error: scenario[${index}] must be an object`);
  }
  const scenario = item as Record<string, unknown>;
  assertNonEmptyString(scenario.id, `scenario[${index}].id`);
  assertNonEmptyString(scenario.title, `scenario[${index}].title`);
  assertNonEmptyString(scenario.setup, `scenario[${index}].setup`);
  assertNonEmptyString(scenario.prompt, `scenario[${index}].prompt`);

  const options = scenario.options as Record<string, unknown>;
  const vectorPatch = scenario.vector_patch as Record<string, unknown>;
  if (!options || typeof options !== 'object') {
    throw new Error(`LLM returned format error: scenario[${index}].options missing`);
  }
  if (!vectorPatch || typeof vectorPatch !== 'object') {
    throw new Error(`LLM returned format error: scenario[${index}].vector_patch missing`);
  }

  for (const key of DYNAMIC_OPTIONS) {
    let option = options[key] as unknown;
    // Auto-wrap: if LLM gives a plain string instead of {text, label, feedback}
    // we honor the option text as feedback. No debug markers leak to the user.
    if (typeof option === 'string') {
      option = { text: option, label: key, feedback: option };
      options[key] = option;
    }
    if (!option || typeof option !== 'object') {
      throw new Error(`LLM returned format error: scenario[${index}].options.${key} missing`);
    }
    const optObj = option as Record<string, unknown>;
    assertNonEmptyString(optObj.text, `scenario[${index}].options.${key}.text`);
    assertNonEmptyString(optObj.label, `scenario[${index}].options.${key}.label`);
    assertNonEmptyString(optObj.feedback, `scenario[${index}].options.${key}.feedback`);

    // Normalize label == key: both the auto-wrap fallback and the LLM itself
    // sometimes put the choice key (A/B/C/D) in `label`. Clear it so the
    // frontend "{choice}. {label}" template doesn't render "A. A".
    if (optObj.label === key) {
      optObj.label = '';
      options[key] = option;
    }

    let patch = vectorPatch[key] as Record<string, unknown> | undefined;
    if (!patch || typeof patch !== 'object') {
      throw new Error(`LLM returned format error: scenario[${index}].vector_patch.${key} missing`);
    }
    // Normalize common PascalCase keys to snake_case
    const normalizedPatch: Record<string, unknown> = {};
    for (const pk of Object.keys(patch)) {
      let normalizedKey = pk;
      const lower = pk.toLowerCase();
      if (PAT_KEY_MAP[lower]) {
        normalizedKey = PAT_KEY_MAP[lower];
      }
      normalizedPatch[normalizedKey] = patch[pk];
    }
    patch = normalizedPatch;

    const patchKeys = Object.keys(patch);
    if (patchKeys.length === 0) {
      throw new Error(`LLM returned format error: scenario[${index}].vector_patch.${key} is empty`);
    }
    for (const patchKey of patchKeys) {
      if (!ALLOWED_VECTOR_PATCH_KEYS.has(patchKey as keyof PersonalityVector)) {
        throw new Error(`LLM returned format error: invalid vector_patch key "${patchKey}"`);
      }
      const patchValue = patch[patchKey];
      if (typeof patchValue !== 'number' && typeof patchValue !== 'string' && typeof patchValue !== 'object') {
        throw new Error(`LLM returned format error: invalid vector_patch value for "${patchKey}"`);
      }
    }
  }
}

/** Merge schema + locale copy into a full display-ready scenario */
export function getScenarioDef(locale: Locale, index: number) {
  const schema = SCENARIO_SCHEMAS[index];
  if (!schema) return null;
  const copy = getScenarioCopy(locale, schema.id);
  if (!copy) return null;
  return {
    id: schema.id,
    dimension: schema.dimension,
    measurementIntent: schema.measurementIntent,
    title: copy.title,
    setup: copy.setup,
    prompt: copy.prompt,
    options: copy.options,
    vector_patch: schema.vector_patch,
  };
}

export function getTotalScenarios() {
  return SCENARIO_SCHEMAS.length;
}

// ---------------------------------------------------------------
// Step 1: Advance script state after each choice
// ---------------------------------------------------------------

export function advanceScript(
  state: ScriptRunState,
  choice: ChoiceOption,
): ScriptRunState {
  const next_index = state.current_scenario_index + 1;
  const done = next_index >= SCENARIO_SCHEMAS.length;

  return {
    current_scenario_index: done ? next_index : next_index,
    choices: [...state.choices, {
      scenarioId: SCENARIO_SCHEMAS[state.current_scenario_index]!.id as ScenarioId,
      choice,
      timestamp: Date.now(),
    }],
    phase: done ? 'result' : 'feedback',
  };
}

// ---------------------------------------------------------------
// Step 2: Get instant feedback text for current choice
// ---------------------------------------------------------------

export function getChoiceFeedback(
  scenarioIndex: number,
  choice: ChoiceOption,
  locale: Locale = 'zh-CN',
): string {
  const schema = SCENARIO_SCHEMAS[scenarioIndex];
  if (!schema) return '';
  const copy = getScenarioCopy(locale, schema.id);
  if (!copy) return '';
  return copy.options[choice].feedback;
}

// ---------------------------------------------------------------
// Step 3: Build PersonalityVector from all choices
// ---------------------------------------------------------------

function buildVector(choices: ScenarioChoice[]): PersonalityVector {
  const v: PersonalityVector = {
    trust_threshold: 0.5,
    boundary_strength: 0.5,
    conflict_style: 'analytical',
    conflict_score: 0.5,
    attachment_pattern: 'secure',
    attachment_score: 0.6,
    emotional_regulation: 'rational',
    stress_response: 'mindfulness',
    stress_score: 0.3,
    achievement_drive: 'flow_state',
    perfectionism_score: 0.5,
    selfview_pattern: 'growth_minded',
    growth_mindset_score: 0.6,
    social_energy_style: 'adaptive',
    social_energy_score: 0.5,
    openness_score: 0.5,
    stability_score: 0.6,
    neuroticism_score: 0.4,
    confidence: createDefaultConfidence(),
  };

  const numericBuckets = new Map<typeof NUMERIC_VECTOR_KEYS[number], number[]>();
  const categoricalVotes = new Map<
    typeof CATEGORICAL_VECTOR_KEYS[number],
    Map<string, { count: number; lastSeen: number }>
  >();

  for (const c of choices) {
    const schema = ALL_SCENARIO_SCHEMAS.find((s) => s.id === c.scenarioId);
    if (!schema) continue;
    const patch: ChoiceVectorPatch = schema.vector_patch[c.choice];
    for (const [rawKey, rawValue] of Object.entries(patch) as Array<[keyof ChoiceVectorPatch, unknown]>) {
      if (typeof rawValue === 'number' && NUMERIC_VECTOR_KEYS.includes(rawKey as typeof NUMERIC_VECTOR_KEYS[number])) {
        const key = rawKey as typeof NUMERIC_VECTOR_KEYS[number];
        const values = numericBuckets.get(key) ?? [];
        values.push(rawValue);
        numericBuckets.set(key, values);
        continue;
      }

      if (typeof rawValue === 'string' && CATEGORICAL_VECTOR_KEYS.includes(rawKey as typeof CATEGORICAL_VECTOR_KEYS[number])) {
        const key = rawKey as typeof CATEGORICAL_VECTOR_KEYS[number];
        const voteBucket = categoricalVotes.get(key) ?? new Map<string, { count: number; lastSeen: number }>();
        const current = voteBucket.get(rawValue) ?? { count: 0, lastSeen: -1 };
        voteBucket.set(rawValue, { count: current.count + 1, lastSeen: c.timestamp });
        categoricalVotes.set(key, voteBucket);
      }
    }
  }

  for (const key of NUMERIC_VECTOR_KEYS) {
    const values = numericBuckets.get(key);
    if (!values || values.length === 0) continue;
    const average = values.reduce((sum, value) => sum + value, 0) / values.length;
    v[key] = Number(average.toFixed(3)) as PersonalityVector[typeof key];
  }

  for (const key of CATEGORICAL_VECTOR_KEYS) {
    const voteBucket = categoricalVotes.get(key);
    if (!voteBucket || voteBucket.size === 0) continue;

    let winner: string | null = null;
    let winnerCount = -1;
    let winnerLastSeen = -1;
    for (const [value, stats] of voteBucket.entries()) {
      if (
        stats.count > winnerCount
        || (stats.count === winnerCount && stats.lastSeen > winnerLastSeen)
      ) {
        winner = value;
        winnerCount = stats.count;
        winnerLastSeen = stats.lastSeen;
      }
    }

    if (winner) {
      (v as unknown as Record<string, string>)[key] = winner;
    }
  }

  v.openness_score = Number((1 - (v.trust_threshold * 0.6 + v.boundary_strength * 0.4)).toFixed(3));
  v.stability_score = Number(
    (v.attachment_score * 0.7 + (v.conflict_score * 0.3)).toFixed(3),
  );
  v.neuroticism_score = Number(
    ((1 - v.stress_score) * 0.5 + (1 - v.growth_mindset_score) * 0.5).toFixed(3),
  );

  return v;
}

// ---------------------------------------------------------------
// Step 4: Detect active contradiction rules
// ---------------------------------------------------------------

export function detectContradictions(v: PersonalityVector) {
  return CONTRADICTION_RULES.filter((r) => r.condition(v));
}

// ---------------------------------------------------------------
// Archetype scoring (shared)
// ---------------------------------------------------------------

export function scoreArchetypes(v: PersonalityVector) {
  const scored = ARCHETYPES.map((a) => ({
    archetype: a,
    score: a.score_rules.reduce((sum, fn) => sum + fn(v), 0),
  }));
  scored.sort((x, y) => y.score - x.score);
  return scored;
}

const FALLBACK_ARCHETYPE = ARCHETYPES.find((a) => a.id === 'contradictory_explorer') ?? ARCHETYPES.at(-1)!;

// ---------------------------------------------------------------
// Step 5: Score and select archetype
// ---------------------------------------------------------------

function selectArchetype(v: PersonalityVector, locale: Locale) {
  const scored = scoreArchetypes(v);
  const winner = scored[0]?.score <= 2 ? FALLBACK_ARCHETYPE : scored[0]?.archetype ?? FALLBACK_ARCHETYPE;
  return winner[locale];
}

// ---------------------------------------------------------------
// Step 6: Build evidence-based narrative (no LLM needed)
// ---------------------------------------------------------------

function buildNarrative(choices: ScenarioChoice[], locale: Locale): string {
  const parts: string[] = [];

  for (const c of choices) {
    const schema = ALL_SCENARIO_SCHEMAS.find((s) => s.id === c.scenarioId);
    const dim = schema?.dimension;
    let line: string | undefined;
    switch (dim) {
      case 'trustBoundaries':
        line = TRUST_NARRATIVES[locale]?.[c.choice]; break;
      case 'conflictResponse':
        line = CONFLICT_NARRATIVES[locale]?.[c.choice]; break;
      case 'attachment':
        line = ATTACHMENT_NARRATIVES[locale]?.[c.choice]; break;
      case 'emotionRegulation':
        line = REGULATION_NARRATIVES[locale]?.[c.choice]; break;
      case 'stressResponse':
        line = STRESS_NARRATIVES[locale]?.[c.choice]; break;
      case 'achievementMotivation':
        line = ACHIEVEMENT_NARRATIVES[locale]?.[c.choice]; break;
      case 'selfCognition':
        line = SELFVIEW_NARRATIVES[locale]?.[c.choice]; break;
      case 'socialEnergy':
        line = SOCIALENERGY_NARRATIVES[locale]?.[c.choice]; break;
    }
    if (line) parts.push(line);
  }

  // Join with locale-appropriate separator
  return locale === 'zh-CN' ? parts.join('。\n') + '。' : parts.join('. ') + '.';
}

function buildEvidenceLog(choices: ScenarioChoice[], locale: Locale): ScriptEvidence[] {
  return choices.flatMap((c) => {
    const schema = ALL_SCENARIO_SCHEMAS.find((s) => s.id === c.scenarioId);
    if (!schema) return [];
    const copy = getScenarioCopy(locale, schema.id);
    if (!copy) return [];
    const option = copy.options[c.choice];
    return [{
      id: `${schema.id}:${c.choice}`,
      scenarioId: schema.id,
      dimensionId: schema.dimension,
      choice: c.choice,
      choiceLabel: option.label,
      choiceText: option.text,
      scenarioTitle: copy.title,
      context: copy.setup,
      expectedSignal: schema.expected_signal[c.choice],
      vectorPatch: schema.vector_patch[c.choice] as Partial<PersonalityVector>,
    }];
  });
}

function pickPrimaryEvidence(evidence: ScriptEvidence[]): ScriptEvidence | undefined {
  return evidence.find((e) => e.expectedSignal === 'high' || e.expectedSignal === 'low')
    ?? evidence.find((e) => e.expectedSignal === 'mid-high' || e.expectedSignal === 'mid-low')
    ?? evidence[0];
}

// ---------------------------------------------------------------
// Step 7: Build key insight (punchy EVA-style)
// ---------------------------------------------------------------

function buildKeyInsight(
  v: PersonalityVector,
  contradictions: typeof CONTRADICTION_RULES,
  locale: Locale,
  evidenceLog: ScriptEvidence[],
): string {
  const primary = pickPrimaryEvidence(evidenceLog);
  const contradictionProbe = contradictions.length > 0
    ? (contradictions[0].rule.probe[locale] ?? contradictions[0].rule.probe['zh-CN'])
    : '';

  if (primary) {
    const fact = locale === 'zh-CN'
      ? `具体观察：在「${primary.scenarioTitle}」这个场景中，你选择了「${primary.choiceText}」。`
      : locale === 'ja'
      ? `観察：「${primary.scenarioTitle}」で、あなたは「${primary.choiceText}」を選びました。`
      : locale === 'es'
      ? `Observación: en "${primary.scenarioTitle}", elegiste "${primary.choiceText}".`
      : `Observation: in "${primary.scenarioTitle}", you chose "${primary.choiceText}".`;
    const pattern = contradictionProbe || buildEvidenceBackedInsight(primary, v, locale);
    const refute = locale === 'zh-CN'
      ? '如果这个分析不完全符合你的实际情况，你认为最关键的例外是什么？'
      : locale === 'ja'
      ? 'もしこれがあなたの実感と異なる場合、最も重要な例外は何ですか？'
      : locale === 'es'
      ? 'Si esto no se ajusta a tu realidad, ¿cuál es la excepción más importante?'
      : 'If this does not fit your reality, what is the most important exception?';
    return `${fact}\n${pattern}\n${refute}`;
  }

  // If a contradiction exists, lead with it (locale-aware probe)
  if (contradictionProbe) {
    const prefix = locale === 'zh-CN' ? '表现倾向：'
      : locale === 'ja' ? '傾向：'
      : locale === 'es' ? 'Tendencia: '
      : 'Tendency: ';
    const refute = locale === 'zh-CN'
      ? '如果这个分析不完全符合你的实际情况，你认为最关键的例外是什么？'
      : locale === 'ja'
      ? 'もしこれがあなたの実感と異なる場合、最も重要な例外は何ですか？'
      : locale === 'es'
      ? 'Si esto no se ajusta a tu realidad, ¿cuál es la excepción más importante?'
      : 'If this does not fit your reality, what is the most important exception?';
    return `${prefix}${contradictionProbe}\n${refute}`;
  }

  // No single high-signal evidence entry found:
  // still return the same contract (fact + pattern + rebuttal), never soft archetype prose.
  const scored = scoreArchetypes(v);
  const winner = scored[0]?.score > 2 ? scored[0]?.archetype : null;
  const archetypeId = winner?.id ?? 'contradictory_explorer';
  const pattern = buildArchetypePatternInsight(archetypeId, locale);
  const fact = locale === 'zh-CN'
    ? '具体观察：综合了你在多个场景下的选择倾向。'
    : locale === 'ja'
    ? '観察：複数のシナリオにおける選択の傾向を総合的に分析しました。'
    : locale === 'es'
    ? 'Observación: se analizaron de forma integrada tus tendencias en múltiples escenarios.'
    : 'Observation: your choices across multiple scenarios were synthesized.';
  const refute = locale === 'zh-CN'
    ? '如果这个分析不完全符合你的实际情况，你认为最关键的例外是什么？'
    : locale === 'ja'
    ? 'もしこれがあなたの実感と異なる場合、最も重要な例外は何ですか？'
    : locale === 'es'
    ? 'Si esto no se ajusta a tu reality, ¿cuál es la excepción más importante?'
    : 'If this does not fit your reality, what is the most important exception?';
  return `${fact}\n${pattern}\n${refute}`;
}

function buildArchetypePatternInsight(archetypeId: string, locale: Locale): string {
  const zh: Record<string, string> = {
    boundary_guard: '模式：你把风险控制放在亲密之前，策略有效，但会让关系长期停留在“可管理”而不是“可进入”。',
    rational_explorer: '模式：你用分析换稳定，但分析过量时会延迟行动，把不确定性留在体内循环。',
    secure_connector: '模式：你能维持关系秩序，但高负荷时容易把“稳住局面”误当成“真实表达”。',
    silent_observer: '模式：你先看后说，降低了冲突成本，也提高了被误读为冷淡的概率。',
    sensitive_resonator: '模式：你对关系波动的灵敏度很高，连接能力强，但代价是情绪负载恢复更慢。',
    direct_actor: '模式：你追求即时清晰，效率高；但在权力不对称场景，直接性会放大摩擦成本。',
    balanced_mediator: '模式：你擅长维持表面平衡，但在高压力节点，容易先维护系统稳定而延后个人边界。',
    contradictory_explorer: '模式：你在相反倾向间切换速度快，适应力高；风险是关键时刻难以固定决策原则。',
  };
  const en: Record<string, string> = {
    boundary_guard: 'Pattern: you put risk control before intimacy. Effective strategy, but relationships stay manageable rather than enterable.',
    rational_explorer: 'Pattern: you use analysis to stabilize. When overused, analysis delays action and recycles uncertainty internally.',
    secure_connector: 'Pattern: you can keep relational order, but under load you may confuse keeping things stable with being fully honest.',
    silent_observer: 'Pattern: you observe first and speak later. It lowers conflict cost, but raises the chance of being read as distant.',
    sensitive_resonator: 'Pattern: high sensitivity to relationship fluctuations strengthens connection, but recovery from emotional load gets slower.',
    direct_actor: 'Pattern: you optimize for immediate clarity. High efficiency, but in power-asymmetric contexts directness increases friction cost.',
    balanced_mediator: 'Pattern: you are strong at maintaining surface balance, but under pressure may stabilize the system before defending your boundary.',
    contradictory_explorer: 'Pattern: you switch quickly between opposing tendencies. Adaptive, but hard to lock decision principles at key moments.',
  };
  const ja: Record<string, string> = {
    boundary_guard: 'パターン：あなたは親密さより先にリスク管理を置く。戦略として有効だが、関係は「入れる」より「管理できる」に留まりやすい。',
    rational_explorer: 'パターン：分析で安定を作るが、過剰分析は行動を遅らせ、不確実性を内側で循環させる。',
    secure_connector: 'パターン：関係の秩序を維持できる一方、高負荷時に「安定維持」を「本音の表現」と取り違えやすい。',
    silent_observer: 'パターン：先に観察して後で話す。衝突コストは下がるが、冷淡だと読まれる確率は上がる。',
    sensitive_resonator: 'パターン：関係の揺れへの感度が高く、接続力は強いが、感情負荷からの回復は遅くなりやすい。',
    direct_actor: 'パターン：即時の明確さを優先する。効率は高いが、権力非対称の場面では摩擦コストが増える。',
    balanced_mediator: 'パターン：表面の均衡維持が得意。ただし高圧局面では、個人境界より先にシステム安定を守りやすい。',
    contradictory_explorer: 'パターン：相反する傾向の切替が速い。適応力は高いが、要所で意思決定原則を固定しにくい。',
  };
  const es: Record<string, string> = {
    boundary_guard: 'Patrón: priorizas el control de riesgo antes que la intimidad. Es eficaz, pero la relación queda gestionable más que accesible.',
    rational_explorer: 'Patrón: usas el análisis para estabilizarte. En exceso, retrasa la acción y recicla la incertidumbre por dentro.',
    secure_connector: 'Patrón: sostienes el orden relacional, pero bajo carga puedes confundir estabilidad con honestidad plena.',
    silent_observer: 'Patrón: observas primero y hablas después. Baja el costo de conflicto, pero sube la probabilidad de parecer distante.',
    sensitive_resonator: 'Patrón: alta sensibilidad a fluctuaciones relacionales mejora la conexión, pero hace más lenta la recuperación emocional.',
    direct_actor: 'Patrón: optimizas claridad inmediata. Alta eficiencia, pero en contextos asimétricos de poder aumenta la fricción.',
    balanced_mediator: 'Patrón: mantienes bien el equilibrio de superficie, pero bajo presión puedes estabilizar el sistema antes que tu límite personal.',
    contradictory_explorer: 'Patrón: cambias rápido entre tendencias opuestas. Alta adaptación, pero cuesta fijar principios de decisión en momentos críticos.',
  };

  const map = locale === 'zh-CN' ? zh : locale === 'ja' ? ja : locale === 'es' ? es : en;
  return map[archetypeId] ?? map.contradictory_explorer;
}

function buildEvidenceBackedInsight(evidence: ScriptEvidence, v: PersonalityVector, locale: Locale): string {
  if (locale === 'zh-CN') {
    switch (evidence.dimensionId) {
      case 'trustBoundaries':
        return v.trust_threshold > 0.65
          ? '洞察：你说这是谨慎，但更准确地说，是亲密必须先通过审查，才有资格影响你。'
          : '洞察：你靠近脆弱的速度比大多数人快，这既是连接能力，也是暴露风险。';
      case 'conflictResponse':
        return v.conflict_score > 0.65
          ? '洞察：你不是单纯讨厌被质疑，你更讨厌在公开场合失去主动权。'
          : '洞察：你的冲突策略优先保护关系，但代价可能是自己的立场被放到后面。';
      case 'attachment':
        return v.attachment_score < 0.45
          ? '洞察：不确定性在你这里很难保持中性，它会很快变成“我是不是不重要了”的故事。'
          : '洞察：你的关系系统有基本信任，所以不会把每一次缺席都翻译成拒绝。';
      case 'emotionRegulation':
        return '洞察：你处理情绪的方式不是“好坏”，而是你最熟悉的自我保护路径。问题是，它是否还适合现在的你。';
      case 'stressResponse':
        return v.stress_score > 0.7
          ? '洞察：压力下你的大脑会用持续激活来夺回控制权，即使身体真正需要的是停机。'
          : '洞察：你有能力在压力变成身份级恐慌之前打断它，这是可训练的优势。';
      case 'achievementMotivation':
        return v.perfectionism_score > 0.7
          ? '洞察：你追求的可能不是完美，而是避免被别人抓住“不够好”的证据。'
          : '洞察：你能放过不完美，但也要小心把“松弛”用成逃离压力的理由。';
      case 'selfCognition':
        return v.growth_mindset_score > 0.65
          ? '洞察：你愿意让反馈刺进来，这很少见；但也意味着你容易把别人的一句话变成自我审判。'
          : '洞察：你保护自我形象的速度很快，这能让你稳住，也可能让真正有用的反馈进不来。';
      case 'socialEnergy':
        return v.social_energy_score > 0.65
          ? '洞察：你不是单纯外向，你是在用他人的存在把自己重新点亮。'
          : '洞察：你不是不需要人，而是你对低质量连接的容忍度很低。';
      default:
        return '洞察：这是一条行为证据，不是人格判决。EVA 应该继续验证它，而不是用它困住你。';
    }
  }

  if (locale === 'ja') {
    switch (evidence.dimensionId) {
      case 'trustBoundaries':
        return v.trust_threshold > 0.65
          ? '洞察：あなたはこれを慎重さと呼ぶかもしれないが、より正確には、親密さはあなたに影響を与える前にまず審査を通過しなければならないということだ。'
          : '洞察：あなたはほとんどの人よりも早く脆弱性に近づく。これはつながる力であり、同時に露出のリスクでもある。';
      case 'conflictResponse':
        return v.conflict_score > 0.65
          ? '洞察：あなたは単に異議を唱えられるのが嫌いなのではない。公の場で主導権を失うのがもっと嫌いなのだ。'
          : '洞察：あなたの対立戦略は関係を優先的に守るが、その代償として自分の立場が後回しになる可能性がある。';
      case 'attachment':
        return v.attachment_score < 0.45
          ? '洞察：あなたにとって不確実性は中立のままではいられず、すぐに「自分はもう重要ではないのか」という物語に変わる。'
          : '洞察：あなたの関係システムには基本的な信頼があるため、あらゆる不在を拒絶と翻訳することはない。';
      case 'emotionRegulation':
        return '洞察：あなたの感情処理の方法は「良い悪い」ではなく、あなたにとって最も馴染みのある自己防衛の経路だ。問題は、それが今のあなたにまだ適しているかどうかだ。';
      case 'stressResponse':
        return v.stress_score > 0.7
          ? '洞察：プレッシャーの下で、あなたの脳は持続的な活性化でコントロールを取り戻そうとする。体が実際に必要としているのは停止であっても。'
          : '洞察：あなたにはストレスがアイデンティティレベルのパニックになる前にそれを遮断する能力がある。これは訓練可能な強みだ。';
      case 'achievementMotivation':
        return v.perfectionism_score > 0.7
          ? '洞察：あなたが追い求めているのは完璧ではなく、他人に「十分ではない」証拠を掴まれないことかもしれない。'
          : '洞察：あなたは不完全さを手放せるが、「リラックス」をプレッシャーから逃げる言い訳にしないように注意すること。';
      case 'selfCognition':
        return v.growth_mindset_score > 0.65
          ? '洞察：あなたはフィードバックを自分の中に入れることを厭わない。これは稀なことだ。しかしそれは、他人の一言を自己裁判に変えやすいことも意味する。'
          : '洞察：あなたは自己イメージを守るのが速い。これは安定をもたらすが、本当に役立つフィードバックを入れなくする可能性もある。';
      case 'socialEnergy':
        return v.social_energy_score > 0.65
          ? '洞察：あなたは単に外向的というわけではない。あなたは他者の存在を使って自分自身を再び灯しているのだ。'
          : '洞察：あなたは人が必要ではないわけではない。低品質なつながりへの許容度が非常に低いだけだ。';
      default:
        return '洞察：これは行動証拠であり、人格判決ではない。Atherはそれを検証し続けるべきであり、それであなたを閉じ込めるべきではない。';
    }
  }

  if (locale === 'es') {
    switch (evidence.dimensionId) {
      case 'trustBoundaries':
        return v.trust_threshold > 0.65
          ? 'Perspectiva: puedes llamarlo precaución, pero el patrón es más específico: la cercanía debe ganar acceso antes de que la dejes afectarte.'
          : 'Perspectiva: te acercas a la vulnerabilidad más rápido que la mayoría, lo cual es fuerza de conexión y riesgo de exposición al mismo tiempo.';
      case 'conflictResponse':
        return v.conflict_score > 0.65
          ? 'Perspectiva: no es que simplemente no te guste que te cuestionen; te desagrada perder el control en público.'
          : 'Perspectiva: tu estrategia de conflicto protege la relación primero, pero puede dejar tu propia posición sin suficiente defensa.';
      case 'attachment':
        return v.attachment_score < 0.45
          ? 'Perspectiva: la incertidumbre no se mantiene neutral para ti; rápidamente se convierte en una historia sobre si aún importas.'
          : 'Perspectiva: tu sistema relacional tiene suficiente confianza de base para no convertir cada ausencia en rechazo.';
      case 'emotionRegulation':
        return 'Perspectiva: tu forma de procesar emociones no es "buena o mala", es tu ruta de autoprotección más familiar. La pregunta es si todavía te sirve.';
      case 'stressResponse':
        return v.stress_score > 0.7
          ? 'Perspectiva: bajo presión, tu mente intenta recuperar el control manteniéndose activada, incluso cuando el cuerpo necesita apagarse.'
          : 'Perspectiva: tienes cierta capacidad de interrumpir el estrés antes de que se convierta en pánico a nivel de identidad. Es una fortaleza entrenable.';
      case 'achievementMotivation':
        return v.perfectionism_score > 0.7
          ? 'Perspectiva: puede que no persigas la perfección, sino evitar que otros encuentren pruebas de que "no eres suficiente".'
          : 'Perspectiva: puedes dejar pasar la imperfección, pero ten cuidado de no usar la "relajación" como excusa para huir de la presión.';
      case 'selfCognition':
        return v.growth_mindset_score > 0.65
          ? 'Perspectiva: estás dispuesto a dejar que la retroalimentación te atraviese, algo poco común; pero también significa que puedes convertir una frase ajena en un juicio propio.'
          : 'Perspectiva: proteges tu autoimagen con rapidez, lo cual te estabiliza, pero también puede bloquear la retroalimentación realmente útil.';
      case 'socialEnergy':
        return v.social_energy_score > 0.65
          ? 'Perspectiva: no eres simplemente extrovertido; usas la presencia de otros para volver a encenderte.'
          : 'Perspectiva: no es que no necesites a las personas, es que tu tolerancia a las conexiones de baja calidad es muy baja.';
      default:
        return 'Perspectiva: esto es un patrón de comportamiento, no un juicio de personalidad. EVA debe seguir verificándolo, no usarlo para encerrarte.';
    }
  }

  switch (evidence.dimensionId) {
    case 'trustBoundaries':
      return v.trust_threshold > 0.65
        ? 'Insight: you may call it caution, but the pattern is more specific: closeness must earn access before you let it affect you.'
        : 'Insight: you move toward vulnerability faster than most people, which is connection strength and exposure risk at the same time.';
    case 'conflictResponse':
      return v.conflict_score > 0.65
        ? 'Insight: you do not simply dislike being challenged; you dislike losing agency in public.'
        : 'Insight: your conflict strategy protects the relationship first, but it can leave your own position under-defended.';
    case 'attachment':
      return v.attachment_score < 0.45
        ? 'Insight: uncertainty does not stay neutral for you; it quickly becomes a story about whether you still matter.'
        : 'Insight: your relationship system has enough baseline trust to avoid turning every absence into rejection.';
    case 'emotionRegulation':
      return 'Insight: your way of processing emotions is not "good or bad", it is your most familiar self-protection path. The question is whether it still fits who you are now.';
    case 'stressResponse':
      return v.stress_score > 0.7
        ? 'Insight: under pressure, your mind tries to regain control by staying activated, even when the body needs shutdown.'
        : 'Insight: you have some ability to interrupt stress before it becomes identity-level panic. This is a trainable strength.';
    case 'achievementMotivation':
      return v.perfectionism_score > 0.7
        ? 'Insight: what you may be chasing is not perfection, but avoiding being caught with evidence of "not good enough".'
        : 'Insight: you can let imperfection go, but be careful not to use "relaxation" as an excuse to escape pressure.';
    case 'selfCognition':
      return v.growth_mindset_score > 0.65
        ? 'Insight: you are willing to let feedback pierce through, which is rare; but it also means you can turn someone else\'s words into self-judgment.'
        : 'Insight: you protect your self-image quickly, which stabilizes you, but may also block truly useful feedback from getting in.';
    case 'socialEnergy':
      return v.social_energy_score > 0.65
        ? 'Insight: you are not simply extroverted; you use the presence of others to light yourself up again.'
        : 'Insight: it is not that you do not need people, it is that your tolerance for low-quality connections is very low.';
    default:
      return 'Insight: this is a behavior pattern, not a fixed identity. EVA should treat it as evidence to test, not a label to trap you in.';
  }
}
// ---------------------------------------------------------------
// Step 8: Pick EVA opening message
// ---------------------------------------------------------------

function pickOpeningMessage(v: PersonalityVector, locale: Locale): string {
  const pool: string[] = [];
  const contradictions = detectContradictions(v);

  // Find the dimension with lowest confidence — this is what we want to explore in chat
  const confidenceEntries: Array<{ key: string; val: number }> = [
    { key: 'trust', val: v.confidence.trust },
    { key: 'conflict', val: v.confidence.conflict },
    { key: 'attachment', val: v.confidence.attachment },
    { key: 'stress', val: v.confidence.stress },
    { key: 'emotion', val: v.confidence.emotion },
    { key: 'achievement', val: v.confidence.achievement },
    { key: 'selfview', val: v.confidence.selfview },
    { key: 'socialenergy', val: v.confidence.socialenergy },
  ];
  const lowestConf = confidenceEntries.reduce((a, b) => b.val < a.val ? b : a);

  // Chinese: use low-confidence-aware openers when locale is zh-CN
  if (locale === 'zh-CN' && lowestConf.val < 0.7) {
    const LOW_CONF_OPENERS: Record<string, string[]> = {
      trust: [
        '你在信任这方面，测试结果还不够清晰。最近有没有什么事让你纠结"要不要信这个人"？',
        '关于你怎么信任别人，我还需要多了解一些。说说最近有没有让你犹豫的人或事？',
      ],
      conflict: [
        '你面对冲突时的反应，我还没看够。最近有没有让你不爽但忍了的事？',
        '你遇到不公平时会怎么做，我还需要更多了解。说个最近的例子？',
      ],
      attachment: [
        '你在亲密关系里是什么状态，我还不够了解。最近有没有让你觉得太近或太远的时刻？',
        '关于你在感情里能不能保持清醒，我还想多知道一些。最近有相关的事吗？',
      ],
      stress: [
        '你在压力下的表现，我还没看够。最近有没有什么事让你觉得快扛不住了？',
        '测试里关于压力的部分还不够清晰。说说最近让你焦头烂额的事？',
      ],
      emotion: [
        '你处理情绪的方式，我还需要更多了解。最近有没有什么情绪来了你不知道怎么消化的时候？',
        '关于你怎么面对负面情绪，我想多了解。最近有被什么事触发过吗？',
      ],
      achievement: [
        '是什么在驱动你努力，我还不太清楚。最近有没有让你特别有干劲、或特别没劲的时候？',
        '你做事的动力来自哪里，我还想确认一下。说说最近让你投入或放弃的事？',
      ],
      selfview: [
        '你被否定之后怎么恢复，我还没看够。最近有没有被打击到的经历？',
        '你怎么看自己这件事，我还需要更多了解。最近有让你重新审视自己的时刻吗？',
      ],
      socialenergy: [
        '社交对你来说是充电还是耗电，我还不够确定。最近有没有社交后特别累或特别开心的时候？',
        '你跟人打交道的状态，我还想多了解。说说最近让你觉得很耗或很舒服的社交场景？',
      ],
    };
    const dimPool = LOW_CONF_OPENERS[lowestConf.key];
    if (dimPool) {
      const idx = v.trust_threshold > 0.5 ? 0 : 1;
      return dimPool[idx % dimPool.length];
    }
  }

  // Fallback: original logic based on attachment pattern + contradictions
  if (contradictions.length >= 2) {
    pool.push(...(OPENING_MESSAGES.mixed[locale] ?? OPENING_MESSAGES.mixed['zh-CN']));
  } else {
    const key = v.attachment_pattern === 'validating' ? 'validating' : v.attachment_pattern;
    pool.push(...(OPENING_MESSAGES[key]?.[locale] ?? OPENING_MESSAGES.mixed[locale] ?? OPENING_MESSAGES.mixed['zh-CN']));
  }

  // Pick deterministically based on boundary to avoid randomness in SSR
  const idx = v.trust_threshold > 0.5 ? 0 : 1;
  return pool[idx % pool.length];
}

// ---------------------------------------------------------------
// Step 9: Build share card
// ---------------------------------------------------------------

function buildShareCard(_v: PersonalityVector, locale: Locale) {
  const copy: Record<Locale, ScriptResult['share_card']> = {
    'zh-CN': {
      archetype: '本轮选择记录',
      headline: '从刚刚的选择开始了解自己',
      description: '这些选择是可回看的线索，不是你的固定定义。',
      cta: '查看本轮选择记录',
    },
    en: {
      archetype: 'This round of choices',
      headline: 'Start with the choices you just made',
      description: 'These choices are reviewable clues, not a fixed definition of you.',
      cta: 'Review this round',
    },
    ja: {
      archetype: '今回の選択記録',
      headline: '今の選択から自分を見ていく',
      description: 'この選択は見返せる手がかりであり、固定した定義ではありません。',
      cta: '今回の記録を見る',
    },
    es: {
      archetype: 'Elecciones de esta ronda',
      headline: 'Empieza por las elecciones que acabas de hacer',
      description: 'Estas elecciones son pistas revisables, no una definición fija de ti.',
      cta: 'Revisar esta ronda',
    },
  };
  return copy[locale];
}

// ---------------------------------------------------------------
// Main: Generate full ScriptResult from completed choices
// ---------------------------------------------------------------

export function generateScriptResult(
  choices: ScenarioChoice[],
  locale: Locale = 'zh-CN',
  freeTextAnswers?: Record<string, string>,
): ScriptResult {
  if (choices.length < SCORED_SCENARIO_IDS.length) {
    throw new Error(`Expected ${SCORED_SCENARIO_IDS.length} scored choices, got ${choices.length}`);
  }

  const vector = buildVector(choices);
  const contradictions = detectContradictions(vector);
  const evidence_log = buildEvidenceLog(choices, locale);
  const narrative = buildNarrative(choices, locale);
  const key_insight = buildKeyInsight(vector, contradictions, locale, evidence_log);
  const eva_opening = pickOpeningMessage(vector, locale);
  const share_card = buildShareCard(vector, locale);
  const normalizedFreeTextAnswers = Object.fromEntries(
    Object.entries(freeTextAnswers ?? {})
      .filter(([, value]) => typeof value === 'string' && value.trim().length > 0)
      .map(([key, value]) => [key, value.trim()]),
  );
  const eva_wants_to_confirm = Object.keys(normalizedFreeTextAnswers).map((scenarioId) =>
    locale === 'zh-CN'
      ? `EVA 想继续确认你在「${scenarioId}」这条现实经历中的真实边界和反应。`
      : `EVA wants to verify the boundary and reaction behind your ${scenarioId} reality input.`,
  );

  // Kept as a compatibility field for stored legacy results. It no longer
  // represents a winning personality category or participates in rendering.
  const archetype_id = 'continuous_observation';

  return {
    choices,
    vector,
    evidence_log,
    narrative,
    key_insight,
    eva_opening,
    share_card,
    archetype_id,
    ...(Object.keys(normalizedFreeTextAnswers).length > 0
      ? { free_text_answers: normalizedFreeTextAnswers, eva_wants_to_confirm }
      : {}),
  };
}

export function isScriptComplete(state: ScriptRunState) {
  return state.choices.length >= SCENARIO_SCHEMAS.length;
}

export function createInitialScriptState(): ScriptRunState {
  return {
    current_scenario_index: 0,
    choices: [],
    phase: 'intro',
  };
}

// ================================================================
// Dynamic Script Generation (Returning Users)
// ================================================================

/**
 * Generate 1 dynamic micro-sandbox scenario using LLM, based on the user's
 * existing personality vector and recent diary entries.
 *
 * Called when a returning user logs in for the 2nd+ time.
 * Each call produces different scenarios — infinite variety.
 */
export async function generateDynamicScenarios(
  vector: PersonalityVector,
  recentDiaries: DiaryEntry[],
  llm_caller: LLMCaller,
  locale: Locale = 'zh-CN',
  targetDimension?: string,
): Promise<DynamicScenarioDef[]> {
  const { system } = buildDynamicScriptPrompt(vector, recentDiaries, locale, targetDimension);

  const raw = await llm_caller({
    system,
    messages: [{ role: 'user', content: 'Generate exactly 1 new scenario question. Output JSON only, no explanation.' }],
    max_tokens: 2000,
    temperature: 0.65,
  });

  // 1) 先剥掉 <think>...</think> 推理块（qwen3 / deepseek-r1 等 CoT 模型会输出）
  // 2) 再从 markdown code block 里抠 JSON
  // 兼容两种情况：
  //   a) 闭合的 <think>...</mm:think>→ 直接整段剥掉
  //   b) 未闭合的 <think>...（部分 CoT 模型实际行为：直接转 markdown 块）→ 剥到首个 ``` / [ / {
  let cleaned = raw.replace(/<think>[\s\S]*?<\/think>/g, '');
  const thinkStart = cleaned.indexOf('<think>');
  if (thinkStart !== -1) {
    const after = cleaned.slice(thinkStart);
    const codeBlock = after.indexOf('```');
    const jsonStart = after.search(/[\[{]/);
    let cutAt = after.length;
    if (codeBlock !== -1) cutAt = Math.min(cutAt, codeBlock);
    if (jsonStart !== -1) cutAt = Math.min(cutAt, jsonStart);
    cleaned = cleaned.slice(0, thinkStart) + after.slice(cutAt);
  }
  cleaned = cleaned.trim();
  let jsonStr = cleaned;
  const codeBlockMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlockMatch) {
    jsonStr = codeBlockMatch[1];
  }

  // Find the first [ and last ]
  const startIdx = jsonStr.indexOf('[');
  const endIdx = jsonStr.lastIndexOf(']');
  if (startIdx === -1 || endIdx === -1) {
    throw new Error('LLM returned format error: no JSON array detected');
  }
  jsonStr = jsonStr.slice(startIdx, endIdx + 1);

  const parsed: Array<{
    id: string;
    title: string;
    setup: string;
    prompt: string;
    options: Record<ChoiceOption, { text: string; label: string; feedback: string }>;
    vector_patch: Record<ChoiceOption, ChoiceVectorPatch>;
  }> = JSON.parse(jsonStr);

  if (!Array.isArray(parsed) || parsed.length !== 1) {
    throw new Error(`LLM returned format error: expected 1 scenario, got ${parsed.length}`);
  }
  validateDynamicScenario(parsed[0], 0);

  return parsed.map((item) => ({
    id: item.id,
    title: item.title,
    setup: item.setup,
    prompt: item.prompt,
    options: item.options as Record<ChoiceOption, ScenarioOptionDef>,
    vector_patch: item.vector_patch,
  }));
}


/**
 * Advance script state for dynamic scenarios.
 * Works the same as advanceScript but uses custom scenario array.
 */
export function advanceDynamicScript(
  state: ScriptRunState,
  choice: ChoiceOption,
  scenarios: DynamicScenarioDef[],
): ScriptRunState {
  const scenarioDef = scenarios[state.current_scenario_index];
  if (!scenarioDef) throw new Error('No dynamic scenario at index ' + state.current_scenario_index);

  const newChoice: ScenarioChoice = {
    scenarioId: scenarioDef.id as any,
    choice,
    timestamp: Date.now(),
  };

  const newChoices = [...state.choices, newChoice];
  const next_index = state.current_scenario_index + 1;
  const done = next_index >= scenarios.length;

  return {
    current_scenario_index: done ? next_index : next_index,
    choices: newChoices,
    phase: done ? 'result' : 'feedback',
  };
}

/**
 * Get feedback for a dynamic scenario choice.
 */
export function getDynamicChoiceFeedback(
  scenarioIndex: number,
  choice: ChoiceOption,
  scenarios: DynamicScenarioDef[],
): string {
  const scenarioDef = scenarios[scenarioIndex];
  if (!scenarioDef) return '';
  return scenarioDef.options[choice].feedback;
}

/**
 * Build a partial PersonalityVector from dynamic scenario choices.
 * Merges into the existing vector.
 */
export function mergeDynamicVector(
  existing: PersonalityVector,
  choices: ScenarioChoice[],
  scenarios: DynamicScenarioDef[],
): PersonalityVector {
  const updated = { ...existing, confidence: { ...existing.confidence } };

  for (const c of choices) {
    const scenario = scenarios.find((s) => s.id === c.scenarioId);
    if (!scenario) continue;
    const patch: ChoiceVectorPatch = scenario.vector_patch[c.choice];
    // Blend: 70% existing + 30% new evidence
    for (const [key, value] of Object.entries(patch)) {
      // Skip number values for string-enum fields: doing 'string' * 0.7
      // produces NaN. The LLM sometimes returns a number for what should
      // be a categorical enum (e.g. conflict_style: 0.9 instead of
      // 'confrontational'). Silently drop these — they aren't meaningful
      // evidence and would corrupt the vector otherwise.
      if (typeof value === 'number') {
        if ((CATEGORICAL_VECTOR_KEYS as readonly string[]).includes(key)) continue;
        if (key in updated) {
          const old = (updated as unknown as Record<string, number>)[key];
          (updated as unknown as Record<string, number>)[key] = old * 0.7 + value * 0.3;
        }
      } else if (typeof value === 'string') {
        (updated as unknown as Record<string, unknown>)[key] = value;
      }
    }
  }

  // Recalculate derived scores
  updated.openness_score = Number((1 - (updated.trust_threshold * 0.6 + updated.boundary_strength * 0.4)).toFixed(3));
  updated.stability_score = Number(
    (updated.attachment_score * 0.7 + (updated.conflict_score * 0.3)).toFixed(3),
  );
  updated.neuroticism_score = Number(
    ((1 - updated.stress_score) * 0.5 + (1 - updated.growth_mindset_score) * 0.5).toFixed(3),
  );

  // Boost confidence for dimensions that were tested
  for (const c of choices) {
    const sid = c.scenarioId as keyof typeof updated.confidence;
    if (sid in updated.confidence) {
      updated.confidence[sid] = Math.min(1, (updated.confidence[sid] ?? 0.6) + 0.15);
    }
  }

  return updated;
}
