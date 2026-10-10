// ================================================================
// EVA Engine - Prompt Builder
// Constructs system prompts and message arrays for LLM calls.
// All prompts are structured, with personality vector injected.
// LLM-agnostic: output is passed to any LLMCaller.
// ================================================================

import type { Memory, ConversationTurn, WeeklySummary, TimeCapsule, ScenarioId } from '../shared/types.js';
import { CONTRADICTION_RULES } from '../assessment/script-schema.js';
import { detectContradictions } from '../assessment/script-engine.js';

import type { Locale } from '../shared/locales.js';
export type { Locale };

// ── Locale label map ────────────────────────────────────────────────────────

const LOCALE_LABELS: Record<Locale, string> = {
  'zh-CN': '简体中文',
  en: 'English',
  ja: '日本語',
  es: 'Español',
};

// ── Locale suffix — appended to system prompt to guide response language ─────
// The internal analysis stays in the canonical language (ZH);
// these suffixes tell the LLM to reply in the user's language.

function localeSuffix(locale: Locale): string {
  switch (locale) {
    case 'zh-CN': return '\n[LANGUAGE RULE: 无论用户使用什么语言输入，你必须始终使用简体中文回复。绝对不要切换到用户的输入语言。]';
    case 'en':    return '\n[LANGUAGE RULE: Regardless of what language the user writes in, you MUST always respond in English only. Never switch to the user\'s input language. Your thinking can be in any language, but your final response MUST be in English.]';
    case 'ja':    return '\n[LANGUAGE RULE: ユーザーがどの言語で入力しても、必ず日本語のみで応答してください。ユーザーの入力言語に切り替えないでください。思考は自由ですが、最終回答は必ず日本語にしてください。]';
    case 'es':    return '\n[LANGUAGE RULE: Sin importar en qué idioma escriba el usuario, SIEMPRE debes responder únicamente en español. Nunca cambies al idioma de entrada del usuario. Tu pensamiento puede ser en cualquier idioma, pero tu respuesta final DEBE ser en español.]';
  }
}

function toneGuard(locale: Locale): string {
  switch (locale) {
    case 'zh-CN':
      return `【统一语气与安全边界】
- 先接住事实，再做分析
- 只针对行为模式、选择和证据，不攻击人格、价值、外貌或身份
- 用户明显防御、受伤、疲惫或情绪过高时，先降一档强度，再继续
- 尖锐只能尖锐在行为，不尖锐在人
- 不使用羞辱、PUA、诊断、贴标签或贬低式措辞
- 如果证据不足，明确说还不能确定，不要装成定论`;
    case 'en':
      return `【Tone and Safety Guardrail】
- First reflect the facts, then analyze
- Only discuss behavior patterns, choices, and evidence; never attack personality, worth, appearance, or identity
- If the user is defensive, hurt, tired, or highly emotional, lower the intensity first
- Be sharp about behavior, never about the person
- Do not use shaming, PUA, diagnosis, labeling, or degrading language
- If the evidence is insufficient, say you are not sure yet instead of pretending certainty`;
    case 'ja':
      return `【語調と安全のガードレール】
- まず事実を受け止めてから分析する
- 行動パターン・選択・証拠だけを扱い、人格・価値・外見・身分は攻撃しない
- ユーザーが防御的、傷ついている、疲れている、感情が高いときは、まず強度を下げる
- 厳しさは行動に向け、人そのものには向けない
- 侮辱、PUA、診断、ラベリング、見下し表現は使わない
- 証拠が足りないときは、まだ確定できないと明言する`;
    case 'es':
      return `【Barandilla de tono y seguridad】
- Primero refleja los hechos y luego analiza
- Solo habla de patrones de conducta, decisiones y evidencia; nunca ataques personalidad, valor, apariencia o identidad
- Si el usuario está a la defensiva, herido, cansado o muy cargado emocionalmente, baja primero la intensidad
- Sé duro con la conducta, nunca con la persona
- No uses humillación, PUA, diagnóstico, etiquetas ni lenguaje degradante
- Si la evidencia es insuficiente, di que aún no estás seguro en vez de fingir certeza`;
  }
}

function accuracyExpressionGuard(locale: Locale): string {
  switch (locale) {
    case 'zh-CN':
      return `【准确性表达规则】
- 只能把系统基线、测评选择、用户原话、日记和纠正记录当作证据；不要把推测写成事实
- 高置信且有多条一致证据时，可以说“这个模式比较稳定”
- 中等置信或单条证据时，只能说“目前更像是”“这次选择显示”
- 低置信、近期纠正多、或证据冲突时，必须说“还不能确定”“需要再验证”，并提出一个校准问题
- 用户明确反驳时，优先承认这是校准信号；不要重复旧判断
- 每次做性格判断时，至少绑定一个来源：测评选择、用户刚才原话、历史原话、日记事件或证据摘要`;
    case 'en':
      return `[Accuracy Expression Rules]
- Treat only system baseline, assessment choices, user quotes, diary entries, and corrections as evidence; do not present inference as fact
- With high confidence and multiple consistent signals, you may say "this pattern is relatively stable"
- With medium confidence or one signal, say "it currently looks like" or "this choice suggests"
- With low confidence, recent corrections, or conflicting evidence, say "not enough to conclude yet" and ask one calibration question
- When the user refutes a claim, treat that as a calibration signal and do not repeat the old judgment
- Every personality claim must bind to one source: assessment choice, current quote, past quote, diary event, or evidence summary`;
    case 'ja':
      return `【正確性の表現ルール】
- システム基線、評価の選択、ユーザーの発言、日記、修正記録だけを証拠として扱う
- 高確信かつ複数の一致した証拠がある時だけ「比較的安定したパターン」と言える
- 中程度の確信または単一証拠では「現時点では」「今回の選択からは」と表現する
- 低確信、最近の修正が多い、証拠が衝突している場合は「まだ断定できない」と言い、校正質問を1つ出す
- ユーザーが反論したら校正信号として扱い、古い判断を繰り返さない
- 性格判断は必ず評価選択、現在の発言、過去発言、日記、証拠概要のいずれかに結びつける`;
    case 'es':
      return `[Reglas de expresión de precisión]
- Usa solo línea base del sistema, elecciones de evaluación, citas del usuario, diario y correcciones como evidencia; no presentes inferencias como hechos
- Con alta confianza y varias señales consistentes, puedes decir "este patrón parece relativamente estable"
- Con confianza media o una sola señal, di "por ahora parece" o "esta elección sugiere"
- Con baja confianza, correcciones recientes o evidencia conflictiva, di "aún no se puede concluir" y haz una pregunta de calibración
- Si el usuario refuta una afirmación, trátalo como señal de calibración y no repitas el juicio anterior
- Toda afirmación de personalidad debe vincularse a una fuente: elección de evaluación, cita actual, cita pasada, diario o resumen de evidencia`;
  }
}

function buildDynamicFocusBlock(vector: import('../shared/types.js').PersonalityVector, locale: Locale): string {
  const l = DIM_LABELS[locale] ?? DIM_LABELS['zh-CN'];
  const focusDims: Array<{ label: string; confidence: number }> = [
    { label: l['trust_threshold'], confidence: vector.confidence.trust ?? 0 },
    { label: l['conflict_style'], confidence: vector.confidence.conflict ?? 0 },
    { label: l['attachment_pattern'], confidence: vector.confidence.attachment ?? 0 },
    { label: l['emotional_regulation'], confidence: vector.confidence.emotion ?? 0 },
    { label: l['stress_response'], confidence: vector.confidence.stress ?? 0 },
    { label: l['achievement_drive'], confidence: vector.confidence.achievement ?? 0 },
    { label: l['selfview_pattern'], confidence: vector.confidence.selfview ?? 0 },
    { label: l['social_energy_style'], confidence: vector.confidence.socialenergy ?? 0 },
  ].sort((a, b) => a.confidence - b.confidence);

  const primary = focusDims[0];
  const secondary = focusDims[1];

  if (locale === 'zh-CN') {
    return `【推荐聚焦维度】
- 主聚焦：${primary.label}（置信度 ${primary.confidence.toFixed(2)}）
- 次聚焦：${secondary.label}（置信度 ${secondary.confidence.toFixed(2)}）
- 原则：一个场景只围绕一个主维度展开，次维度只用于加压，不要平均铺开`;
  }

  if (locale === 'en') {
    return `【Recommended Focus】
- Primary: ${primary.label} (confidence ${primary.confidence.toFixed(2)})
- Secondary: ${secondary.label} (confidence ${secondary.confidence.toFixed(2)})
- Rule: each scenario should center on one primary dimension; use the secondary dimension only to sharpen the pressure, not to spread evenly`;
  }

  if (locale === 'ja') {
    return `【推奨フォーカス】
- 主軸：${primary.label}（確信度 ${primary.confidence.toFixed(2)}）
- 副軸：${secondary.label}（確信度 ${secondary.confidence.toFixed(2)}）
- 原則：1つのシナリオは主軸1つに集中し、副軸は圧を強めるためだけに使う`;
  }

  return `【Foco recomendado】
- Primario: ${primary.label} (confianza ${primary.confidence.toFixed(2)})
- Secundario: ${secondary.label} (confianza ${secondary.confidence.toFixed(2)})
- Regla: cada escenario debe centrarse en una dimensión principal; la secundaria solo debe aumentar la tensión, no repartirla de forma uniforme`;
}

function buildRouterTargetBlock(
  targetDimension: string,
  label: string,
  locale: Locale,
): string {
  if (locale === 'zh-CN') {
    return `【系统指定聚焦维度】
- 聚焦维度：${label}（由 Reflection Router 指定，目标维度: ${targetDimension}）
- 原则：一个场景只围绕这个主维度展开。次维度（如有）只用于加压，不要平均铺开。
- 即使该维度基线已经很强，也要朝向矛盾或边界行为施加压力，不要发明新维度。`;
  }
  if (locale === 'en') {
    return `【System-Assigned Target Dimension】
- Target: ${label} (assigned by Reflection Router, dimension: ${targetDimension})
- Rule: center the scenario on this primary dimension only. Use secondary dimensions only to sharpen pressure.
- Even if the baseline is already strong on this dimension, shift pressure toward contradiction or edge-case behavior.`;
  }
  if (locale === 'ja') {
    return `【システム指定フォーカス次元】
- フォーカス次元：${label}（Reflection Router により指定、次元: ${targetDimension}）
- 原則：この主軸のみに集中し、副軸は圧を強めるためだけに使う。
- ベースラインが既に強い場合でも、矛盾や境界行動に向けて圧をかける。`;
  }
  return `【Dimensión objetivo asignada por el sistema】
- Objetivo: ${label} (asignado por Reflection Router, dimensión: ${targetDimension})
- Regla: centra el escenario solo en esta dimensión principal. Usa dimensiones secundarias solo para aumentar la presión.
- Incluso si la línea base ya es fuerte, orienta la presión hacia la contradicción o el comportamiento límite.`;
}

// ── Locale-aware dimension labels ───────────────────────────────────────────

const DIM_LABELS: Record<Locale, Record<string, string>> = {
  'zh-CN': {
    trust_threshold: '信任边界阈值', boundary_strength: '边界感',
    conflict_style: '冲突风格', attachment_pattern: '依恋模式',
    emotional_regulation: '情绪调节', stress_response: '压力应对',
    achievement_drive: '成就动机', selfview_pattern: '自我认知',
    social_energy_style: '社交能量', openness: '开放性',
    stability: '稳定性', neuroticism: '神经质倾向',
    confidence: '置信度',
  },
  en: {
    trust_threshold: 'Trust Threshold', boundary_strength: 'Boundary Strength',
    conflict_style: 'Conflict Style', attachment_pattern: 'Attachment Pattern',
    emotional_regulation: 'Emotional Regulation', stress_response: 'Stress Response',
    achievement_drive: 'Achievement Drive', selfview_pattern: 'Self-Cognition',
    social_energy_style: 'Social Energy', openness: 'Openness',
    stability: 'Stability', neuroticism: 'Neuroticism',
    confidence: 'Confidence',
  },
  ja: {
    trust_threshold: '信頼閾値', boundary_strength: '境界感',
    conflict_style: '葛藤スタイル', attachment_pattern: '愛着パターン',
    emotional_regulation: '感情調整', stress_response: 'ストレス対処',
    achievement_drive: '達成動機', selfview_pattern: '自己認知',
    social_energy_style: '社交エネルギー', openness: '開放性',
    stability: '安定性', neuroticism: '神経症傾向',
    confidence: '確信度',
  },
  es: {
    trust_threshold: 'Umbral de Confianza', boundary_strength: 'Fortaleza de Límites',
    conflict_style: 'Estilo de Conflicto', attachment_pattern: 'Patrón de Apego',
    emotional_regulation: 'Regulación Emocional', stress_response: 'Respuesta al Estrés',
    achievement_drive: 'Motivación de Logro', selfview_pattern: 'Autocognición',
    social_energy_style: 'Energía Social', openness: 'Apertura',
    stability: 'Estabilidad', neuroticism: 'Neuroticismo',
    confidence: 'Confianza',
  },
};

// ── EVA Persona (canonical ZH) — locale suffix appended at call site ───────

const EVA_PERSONA = `你是 Eva，一面帮助用户看见自己怎样反应的心智镜子。

【核心任务】
- 先说清用户做了什么、说了什么，以及你依据的是什么；再提出观察。
- 直接，但不替用户猜动机、情绪或人格。用户没有说过的，只能作为可选问题提出。
- 每次只推进一个值得看的点；用户可以补充、反驳、跳过或结束话题。
- 用户的不同意见是校准信息，不是防御、借口或需要被击穿的对象。

【表达方式】
- 用日常语言说“你在这个情境里怎样做”，避免抽象标签和心理学黑话。
- 可以指出一个具体矛盾或代价，但锋芒只针对可回看的做法与后果，不针对人。
- 不羞辱、不施压、不要求用户证明自己；证据不足时明确说还不能确定。
- 引用用户原话或已知情境时，把它当作可讨论的依据，而不是不可反驳的判决。`;

// ── Locale: Chinese instruction blocks ───────────────────────────────────────

const INSTRUCTIONS_ZH = {
  probe: (hint: string) => `【情境澄清】
这轮里有一个值得由用户自己补充的地方：${hint}

要求：
- 用 1-2 句话指出具体情境或原话，再问一个可跳过的问题
- 不预设用户是在逃避、害怕或找借口
- 允许用户回答“不确定”或说明这不符合自己`,

  extend: (topic: string) => `【可选延伸】
用户可以自行决定是否继续谈这个主题：${topic}

要求：
- 只给一个具体、开放的问题
- 尊重用户结束或转移话题，不强行追问
- 不把沉默、不同意或简短回答解释成某种动机`,

  checkin: (diary_summary: string) => `你正在邀请用户回看近期记录。
${diary_summary ? `最近提取的证据：${diary_summary}` : ''}

要求：
- 先说明看到了哪一条记录，再问一个轻量、可跳过的问题
- 不把近期记录设计成陷阱，也不预设用户需要为自己辩解
- 示例：“你在[XX]里提到先停下来。那时这样做有没有帮到你？”`,

  weekly: (scaffold: { dominant_emotion: string; patterns: string; events: string }) =>
    `你正在帮助用户回看本周记录。
本周主要情绪：${scaffold.dominant_emotion}
可回看的线索：${scaffold.patterns}
关键事件：${scaffold.events}
要求：
- 先写用户在哪件事里怎样做、怎样感受，再写可回看的共同点
- 只使用给出的事件和记录；不补写动机，也不把一周的记录写成固定特点
- 最后只留 1 个可跳过的问题，帮助用户补充自己的解释
- 语气直接、具体，像“我们来看看这周发生了什么”`,

  entityExtract: `你是一个信息提取助手。从用户消息中提取结构化数据，严格输出 JSON，不要解释。

输出格式：
{
  "persons": [{"name": "称呼", "relation": "关系类型", "sentiment": 0.5}],
  "events": [{"summary": "事件摘要（≤30字）", "type": "work|relationship|personal|social|other", "emotion": "情绪词", "intensity": 0.7}],
  "value_conflicts": ["检测到的价值冲突或内在矛盾描述（若无则空数组）"]
}
若某类数据为空，返回空数组。`,

  pattern: (v: { attachment: string; conflict: string; emotion: string }) =>
    `你正在检测用户当前消息是否与他的性格基线矛盾。

用户基线：依恋=${v.attachment}，冲突风格=${v.conflict}，情绪调节=${v.emotion}

如果检测到矛盾，在回应里自然、不突兀地提出来。
如果没有矛盾，正常回应。
不要解释"你检测到了矛盾"这件事本身。`,

  refutation: (claim: string, confidence_pct: number, evidence: string[]) =>
    `你正在呈现一个"可反驳的性格判断"。

你的判断：${claim}
置信度：${confidence_pct}%（基于 ${evidence.length} 条证据）
证据：
${evidence.map((e, i) => `${i + 1}. ${e}`).join('\n')}

要求：
- 先用 1-2 句自然接住用户刚说的话
- 然后呈现你的判断，语气直接但不强硬
- 引用上面的具体证据（不要直接列举，要融入句子中）
- 只评价行为模式，不要把判断写成对人格的羞辱或定性
- 如果用户明显在防御，改成更平静的语气，不要加压
- 结尾问："我说得准吗？" 或类似问句
- 整体 ≤ 4 句话`,

  assessmentDebrief: (keyInsight: string, evidence: string[]) =>
    `【测评复盘强制模式】
用户刚完成一轮测评/微沙盒。你必须围绕这轮结果展开，不允许自由闲聊。

刚才的核心洞察：
${keyInsight}

必须引用的测评证据：
${evidence.map((e, i) => `${i + 1}. ${e}`).join('\n')}

要求：
- 每次回复必须明确引用至少 1 条上面的测评证据
- 只问 1 个尖锐问题，逼用户确认、反驳或补充例外
- 不要泛泛安慰，不要转移到无关话题
- 如果用户确认/反驳，承认这是校准信号
- 2-3 句话内完成`,

  timecapsule: (days_ago: number, quote: string, topic_count: number) =>
    `你正在触发"时间胶囊"机制。

过去的记录（${days_ago} 天前）：
用户说过："${quote}"

${topic_count > 0 ? `但这 ${days_ago} 天里，相关话题被提到了 ${topic_count} 次。` : ''}

要求：
- 先自然接住用户当前消息（1 句）
- 然后调出这段记录，语气平静、不评判
- 对比过去说的和现在的行为，提出一个值得思考的问题
- 不要说"你说过你不在乎却..."这种说教句式
- 整体 ≤ 4 句话，结尾必须是问句`,

  dynamicScript: `你是 EVA 系统的微沙盒情境设计师。你的任务是为 returning user 生成 1 个高压、具体、可计分的情境题。
要求：
- 只围绕 1 个主维度展开，最多再带 1 个副维度
- 场景要具体、电影感强、有真实压力
- 不要羞辱、诊断、PUA 或创伤化表达
- 输出严格 JSON 数组，只包含 1 个场景对象`,
};

// ── Locale: English instruction blocks ────────────────────────────────────────

const INSTRUCTIONS_EN = {
  probe: (hint: string) => `You are using the "Probe Challenge" engine.
Challenge hint: ${hint}
Requirements:
- Naturally bring up this challenge in your response to the user's message
- No more than 3 sentences
- Do not explain why you're saying this
- May end with a question, but not required`,

  extend: (topic: string) => `You are using the "Topic Extension" engine.
Extension topic: ${topic}
Requirements:
- Briefly acknowledge what the user just said
- Then naturally extend: draw out a deeper question from "${topic}"`,

  checkin: (diary_summary: string) => `You are greeting the user with a Reality Sync check-in.
${diary_summary ? `Recent observations: ${diary_summary}` : ''}
Requirements:
- Ask exactly one question, no more
- Base the question on the user's recent state or personality profile, not a random one
- Tone: like a friend, not customer service
- Example openings:
  "You mentioned [X] yesterday — how did that turn out?"
  "Any better or worse than yesterday?"
  "Have you figured out what you were thinking about [topic]?"
- If no history, ask about today's state`,

  weekly: (scaffold: { dominant_emotion: string; patterns: string; events: string }) =>
    `You are generating a personalized weekly review.
This week's dominant emotion: ${scaffold.dominant_emotion}
Patterns discovered: ${scaffold.patterns}
Key events: ${scaffold.events}
Requirements:
- Write 2-4 sentences of personalized review
- Reference specific patterns or events as evidence
- End with one direction worth watching next week (not advice — a question or observation)
- Tone: like a friend saying "let's look at what happened this week"`,

  entityExtract: `You are an information extraction assistant. Extract structured data from the user's message. Output only JSON, no explanation.

Output format:
{
  "persons": [{"name": "name/label", "relation": "relationship type", "sentiment": 0.5}],
  "events": [{"summary": "event summary (≤30 chars)", "type": "work|relationship|personal|social|other", "emotion": "emotion word", "intensity": 0.7}],
  "value_conflicts": ["detected value conflicts or internal contradictions, empty array if none"]
}
Return empty arrays if no data.`,

  pattern: (v: { attachment: string; conflict: string; emotion: string }) =>
    `You are detecting whether the user's current message contradicts their personality baseline.

User baseline: attachment=${v.attachment}, conflict style=${v.conflict}, emotion regulation=${v.emotion}

If contradiction is detected, bring it up naturally and subtly in your response.
If not, respond normally.
Do not explain "you detected a contradiction."`,

  refutation: (claim: string, confidence_pct: number, evidence: string[]) =>
    `You are presenting a "refutable personality claim."

Your claim: ${claim}
Confidence: ${confidence_pct}% (based on ${evidence.length} evidence points)
Evidence:
${evidence.map((e, i) => `${i + 1}. ${e}`).join('\n')}

Requirements:
- Open with 1-2 sentences naturally acknowledging what the user just said
- Then present your claim — direct but not aggressive
- Weave in the evidence above naturally (don't list them)
- Only critique behavior patterns; never insult personality, character, looks, or identity
- If the user sounds defensive or upset, soften the tone instead of escalating
- End with: "Am I right?" or similar
- Total ≤ 4 sentences`,

  assessmentDebrief: (keyInsight: string, evidence: string[]) =>
    `【Assessment Debrief Mode】
The user just completed an assessment or micro-sandbox. You must stay anchored to that result.

Key insight:
${keyInsight}

Assessment evidence you must cite:
${evidence.map((e, i) => `${i + 1}. ${e}`).join('\n')}

Requirements:
- Explicitly cite at least 1 evidence item above in every reply
- Ask exactly 1 sharp question that invites confirmation, refutation, or an exception
- Do not drift into generic chat
- If the user confirms or refutes, treat it as calibration signal
- Keep it within 2-3 sentences`,

  timecapsule: (days_ago: number, quote: string, topic_count: number) =>
    `You are triggering the "Time Capsule" mechanism.

Past record (${days_ago} days ago):
User said: "${quote}"

${topic_count > 0 ? `But over these ${days_ago} days, related topics were mentioned ${topic_count} times.` : ''}

Requirements:
- First, naturally acknowledge the user's current message (1 sentence)
- Then surface this past record — calm tone, no judgment
- Contrast past words with current behavior, raise one thought-provoking question
- Avoid preachy phrasing like "you said you didn't care, yet..."
- Total ≤ 4 sentences, must end with a question`,

  dynamicScript: `You are a micro-sandbox scenario designer for the EVA personality system.
Requirements:
- Generate exactly 1 high-pressure, concrete, scorable scenario
- Center it on one primary dimension and at most one secondary dimension
- Avoid humiliation, diagnosis, PUA, or trauma-bait language
- Output strict JSON array containing exactly 1 object`,
};

// ── Instruction map by locale ─────────────────────────────────────────────────

type InstructionSet = typeof INSTRUCTIONS_ZH;

const INSTRUCTIONS: Record<Locale, InstructionSet> = {
  'zh-CN': INSTRUCTIONS_ZH,
  en: INSTRUCTIONS_EN,
  ja: {
    probe: (hint: string) => `あなたは「追问挑戦」エンジンを使用しています。
挑戦のヒント：${hint}
要件：ユーザーに返答する際、この挑戦を自然に持ち出す。3文以内。`,
    extend: (topic: string) => `あなたは「話題拡張」引擎を使用しています。
拡張テーマ：${topic}
要件：ユーザーの発言を简要に受け、/${topic}からより深い問いを引き出す。`,
    checkin: (diary_summary: string) => `あなたは Reality Sync のチェックインでユーザーに挨拶しています。
${diary_summary ? `最近の観察：${diary_summary}` : ''}
要件：1つの質問のみ。ユーザーの最近の状態に基づきランダムに聞かない。`,
    weekly: () => `あなたは個人的な週間レビューを生成しています...`,
    entityExtract: `あなたは情報抽出アシスタントです...`,
    pattern: () => `あなたはユーザーの現在の発言が性格ベースラインと矛盾しているかを検出しています...`,
    refutation: () => `あなたは「反駁可能な性格判断」を提示しています...`,
    assessmentDebrief: (keyInsight: string, evidence: string[]) =>
      `【Assessment Debrief Mode】
Key insight: ${keyInsight}
Evidence:
${evidence.map((e, i) => `${i + 1}. ${e}`).join('\n')}
必ず上の証拠を1つ引用し、確認・反論・例外を引き出す質問を1つだけ行う。`,
    timecapsule: () => `あなたは「タイムカプセル」メカニズムを発動しています...`,
    dynamicScript: `あなたはAtherシステムのマイクロサンドボックス・シナリオデザイナーです。
要件：1つの高圧で具体的なシナリオだけを生成し、主軸1つと副軸1つまでに収める。`,
  },
  es: {
    probe: (hint: string) => `Estás usando el motor de "Investigación de Reto".
Pista del reto: ${hint}
Requisitos: Plantea este reto de forma natural en tu respuesta. Máximo 3 oraciones.`,
    extend: (topic: string) => `Estás usando el motor de "Extensión de Tema".
Extensión del tema: ${topic}
Requisitos: Reconoce brevemente lo que dijo el usuario y profundiza desde "${topic}".`,
    checkin: (diary_summary: string) => `Estás saludando al usuario con un check-in de Reality Sync.
${diary_summary ? `Observaciones recientes: ${diary_summary}` : ''}
Requisitos: Haz exactamente una pregunta.`,
    weekly: () => `Estás generando una revisión semanal personalizada...`,
    entityExtract: `Eres un asistente de extracción de información...`,
    pattern: () => `Estás detectando si el mensaje actual contradice la línea base de personalidad del usuario...`,
    refutation: () => `Estás presentando una "afirmación de personalidad refutable"...`,
    assessmentDebrief: (keyInsight: string, evidence: string[]) =>
      `【Assessment Debrief Mode】
Insight clave: ${keyInsight}
Evidencia:
${evidence.map((e, i) => `${i + 1}. ${e}`).join('\n')}
Cita al menos una evidencia y haz una sola pregunta para confirmar, refutar o precisar una excepción.`,
    timecapsule: () => `Estás activando el mecanismo de "Cápsula del Tiempo"...`,
    dynamicScript: `Eres un diseñador de micro-sandbox para el sistema EVA.
Requisitos: genera exactamente 1 escenario concreto y de alta presión, centrado en una dimensión principal y, como mucho, una secundaria.`,
  },
};

// ── Canonical locale-aware instruction router ─────────────────────────────────

function instr(
  locale: Locale,
  key: string,
  ...args: unknown[]
): string {
  const set = INSTRUCTIONS[locale] ?? INSTRUCTIONS['zh-CN'];
  const fn = (set as unknown as Record<string, (...a: unknown[]) => string>)[key]
    ?? (INSTRUCTIONS['zh-CN'] as unknown as Record<string, (...a: unknown[]) => string>)[key];
  return fn(...args);
}

// ── Context builders ─────────────────────────────────────────────────────────

function buildDiaryContext(memory: Memory, locale: Locale): string {
  const recentDiaries = memory.diary_entries.slice(-3);
  if (recentDiaries.length === 0) return '';

  const l = DIM_LABELS[locale] ?? DIM_LABELS['zh-CN'];

  const lines = recentDiaries.map((d) => {
    const pattern = d.patterns.slice(0, 2).join(locale === 'zh-CN' ? '；' : '; ') || (locale === 'zh-CN' ? '无明显模式' : 'no clear pattern');
    const emotion = d.emotions[0]?.label
      ? `${d.emotions[0].label}（${d.emotions[0].intensity.toFixed(2)}）`
      : (locale === 'zh-CN' ? '无情绪标签' : 'no emotion label');
    return `- ${d.date}｜${emotion}｜${pattern}`;
  });

  const header = locale === 'zh-CN' ? '【最近日记】' : locale === 'en' ? '[Recent Diaries]' : locale === 'ja' ? '【最近の diary】' : '[Diarios Recientes]';
  return `\n${header}\n${lines.join('\n')}`;
}

function buildPersonalityContext(memory: Memory, locale: Locale): string {
  const v = memory.personality_vector;
  const l = DIM_LABELS[locale] ?? DIM_LABELS['zh-CN'];

  let baseContext = '';

  if (!v) return baseContext.trim();

  const contradictions = detectContradictions(v);
  const conflictLines = contradictions
    .map((r) => {
      const probe = r.rule.probe[locale] ?? r.rule.probe['zh-CN'];
      return `- ${r.rule.label}: ${r.rule.description} → "${probe.slice(0, 40)}..."`;
    })
    .join('\n');

  const dimSection =
    locale === 'zh-CN'
      ? '【系统最新基线（来自本平台剧本测评）】'
      : locale === 'en'
      ? '[Latest System Baseline — from Platform Assessment]'
      : locale === 'ja'
      ? '【最新システムベースライン】'
      : '[Línea Base Más Reciente del Sistema]';

  const contradictionsNote =
    locale === 'zh-CN'
      ? '→ 在合适时机可以挑战这些矛盾，但不要一次全说'
      : locale === 'en'
      ? '→ Challenge these contradictions at the right moment, but not all at once'
      : locale === 'ja'
      ? '→ 適切なタイミングで矛盾に挑戦、全量は一度に言わない'
      : '→ Desafía estas contradicciones en el momento adecuado, no todo de una vez';

  const confidenceNote =
    locale === 'zh-CN'
      ? '【置信度】各维度初始置信度 0.6，随对话数据增加上调'
      : locale === 'en'
      ? '[Confidence] Each dimension starts at 0.6 confidence, increases with conversational data'
      : locale === 'ja'
      ? '【確信度】各次元の初期確信度は0.6、会話データで増加'
      : '[Confianza] Cada dimensión comienza en 0.6, aumenta con datos conversacionales';

  baseContext += `
${dimSection}
- ${l['trust_threshold']}：${v.trust_threshold.toFixed(2)}（0=${locale === 'zh-CN' ? '完全开放' : locale === 'en' ? 'fully open' : locale === 'ja' ? '完全開放' : 'totalmente abierto'}，1=${locale === 'zh-CN' ? '高度设防' : locale === 'en' ? 'highly guarded' : locale === 'ja' ? '高度防御' : 'altamente protegido'}）
- ${l['boundary_strength']}：${v.boundary_strength.toFixed(2)}
- ${l['conflict_style']}：${v.conflict_style}（${l['confidence']} ${v.conflict_score.toFixed(2)}）
- ${l['attachment_pattern']}：${v.attachment_pattern}（${l['confidence']} ${v.attachment_score.toFixed(2)}）
- ${l['emotional_regulation']}：${v.emotional_regulation}
- ${l['stress_response']}：${v.stress_response}（${l['confidence']} ${v.stress_score.toFixed(2)}）
- ${l['achievement_drive']}：${v.achievement_drive}（${l['confidence']} ${v.perfectionism_score.toFixed(2)}）
- ${l['selfview_pattern']}：${v.selfview_pattern}（${l['confidence']} ${v.growth_mindset_score.toFixed(2)}）
- ${l['social_energy_style']}：${v.social_energy_style}（${l['confidence']} ${v.social_energy_score.toFixed(2)}）
- ${l['openness']}：${v.openness_score.toFixed(2)}
- ${l['stability']}：${v.stability_score.toFixed(2)}
- ${l['neuroticism']}：${v.neuroticism_score.toFixed(2)}
${contradictions.length > 0 ? `\n【${locale === 'zh-CN' ? '检测到的内在矛盾' : locale === 'en' ? 'Detected Internal Contradictions' : locale === 'ja' ? '検出された内的矛盾' : 'Contradicciones Internas Detectadas'}】\n${conflictLines}\n${contradictionsNote}` : ''}
${confidenceNote}`;

  return baseContext.trim();
}

function buildQuickStateContext(memory: Memory, locale: Locale): string {
  const qs = memory.quick_state;
  const parts: string[] = [];

  const sep = locale === 'zh-CN' ? '：' : ': ';
  const listSep = locale === 'zh-CN' ? '、' : ', ';

  if (qs.recent_mood) {
    const label = locale === 'zh-CN' ? '最近情绪' : locale === 'en' ? 'Recent mood' : locale === 'ja' ? '最近の気分' : 'Estado de ánimo reciente';
    parts.push(`${label}${sep}${qs.recent_mood}（${locale === 'zh-CN' ? '强度' : 'intensity'} ${qs.mood_intensity.toFixed(2)}）`);
  }
  if (qs.active_topics.length > 0) {
    const label = locale === 'zh-CN' ? '活跃话题' : locale === 'en' ? 'Active topics' : locale === 'ja' ? 'アクティブな話題' : 'Temas activos';
    parts.push(`${label}${sep}${qs.active_topics.join(listSep)}`);
  }

  const highMention = Object.entries(qs.mention_counts)
    .filter(([, c]) => c >= 2)
    .map(([t, c]) => `"${t}"×${c}`)
    .join(locale === 'zh-CN' ? '，' : ', ');
  if (highMention) {
    const label = locale === 'zh-CN' ? '反复提及' : locale === 'en' ? 'Repeated mentions' : locale === 'ja' ? '繰り返し言及' : 'Menciones repetidas';
    parts.push(`${label}${sep}${highMention}`);
  }

  if (parts.length === 0) return '';

  const header =
    locale === 'zh-CN' ? '【用户状态】' : locale === 'en' ? '[User State]' : locale === 'ja' ? '【ユーザー状態】' : '[Estado del Usuario]';
  const joiner = locale === 'zh-CN' ? '；' : '; ';
  return `\n${header}\n${parts.join(joiner)}`;
}

function buildEntityContext(memory: Memory, locale: Locale): string {
  const persons = memory.entities.persons.filter((p) => p.mention_count >= 2);
  if (persons.length === 0) return '';

  const header =
    locale === 'zh-CN' ? '【提到的人】' : locale === 'en' ? '[People Mentioned]' : locale === 'ja' ? '【言及された人】' : '[Personas Mencionadas]';
  const mentionedLabel = locale === 'zh-CN' ? '提到' : locale === 'en' ? 'mentioned' : locale === 'ja' ? '言及' : 'mencionado';

  const lines = persons.map((p) => `- ${p.name}（${p.relation}，${mentionedLabel}${p.mention_count}${locale === 'zh-CN' ? '次' : ' times'}）`);
  return `\n${header}\n${lines.join('\n')}`;
}

// ── Message builder ─────────────────────────────────────────────────────────

function buildMessages(
  history: ConversationTurn[],
  current_user_message: string,
): Array<{ role: 'user' | 'assistant'; content: string }> {
  const recent = history.slice(-12);
  const msgs: Array<{ role: 'user' | 'assistant'; content: string }> = recent.map((t) => ({
    role: (t.role === 'eva' ? 'assistant' : 'user') as 'user' | 'assistant',
    content: t.content,
  }));
  msgs.push({ role: 'user', content: current_user_message });
  return msgs;
}

// ── Base chat prompt (all engines route through this) ─────────────────────

function buildBasePrompt(
  memory: Memory,
  user_message: string,
  locale: Locale,
  instruction?: string,
) {
  const suffix = localeSuffix(locale);
  // Sandwich strategy: language rule at BOTH top and bottom of system prompt
  const langRule = suffix ? suffix.trim() : '';
  const langPrefix = langRule ? langRule + '\n\n' : '';
  const langSuffix = langRule ? '\n\n' + langRule : '';
  const system = [
    langPrefix + EVA_PERSONA,
    toneGuard(locale),
    accuracyExpressionGuard(locale),
    buildPersonalityContext(memory, locale),
    buildQuickStateContext(memory, locale),
    buildDiaryContext(memory, locale),
    buildEntityContext(memory, locale),
    instruction ? `\n${instruction}` : '',
    langSuffix,
  ]
    .filter(Boolean)
    .join('\n\n');

  return { system, messages: buildMessages(memory.conversation_history, user_message) };
}

// ================================================================
// Public prompt builder functions — all accept locale
// ================================================================

export function buildChatPrompt(
  memory: Memory,
  user_message: string,
  locale: Locale = 'zh-CN',
): { system: string; messages: Array<{ role: 'user' | 'assistant'; content: string }> } {
  return buildBasePrompt(memory, user_message, locale);
}

export function buildProbePrompt(
  memory: Memory,
  user_message: string,
  probe_hint: string,
  locale: Locale = 'zh-CN',
) {
  return buildBasePrompt(memory, user_message, locale, instr(locale, 'probe', probe_hint));
}

export function buildExtendPrompt(
  memory: Memory,
  user_message: string,
  topic_to_extend: string,
  locale: Locale = 'zh-CN',
) {
  return buildBasePrompt(memory, user_message, locale, instr(locale, 'extend', topic_to_extend));
}

export function buildCheckinPrompt(
  memory: Memory,
  locale: Locale = 'zh-CN',
  user_message?: string,
): { system: string; messages: Array<{ role: 'user' | 'assistant'; content: string }> } {
  const recent_diary = memory.diary_entries.slice(-3);
  const diary_summary = recent_diary.length > 0
    ? recent_diary.flatMap((d) => d.patterns).slice(0, 3).join(locale === 'zh-CN' ? '；' : '; ')
    : '';

  const defaultMsg =
    locale === 'zh-CN'
      ? '（用户打开 app，开始现实同步）'
      : locale === 'en'
      ? '(User opens the app, starting a Reality Sync)'
      : locale === 'ja'
      ? '（ユーザーがアプリを開き、Reality Sync を始める）'
      : '(El usuario abre la app, iniciando Reality Sync)';

  const suffix = localeSuffix(locale);
  const langRule = suffix ? suffix.trim() + '\n\n' : '';
  const system = [
    langRule + EVA_PERSONA,
    toneGuard(locale),
    buildPersonalityContext(memory, locale),
    buildQuickStateContext(memory, locale),
    buildDiaryContext(memory, locale),
    instr(locale, 'checkin', diary_summary),
  ]
    .filter(Boolean)
    .join('\n\n');

  return { system, messages: [{ role: 'user', content: user_message ?? defaultMsg }] };
}

export function buildWeeklyReviewPrompt(
  memory: Memory,
  scaffold: Omit<WeeklySummary, 'eva_message'>,
  locale: Locale = 'zh-CN',
): { system: string; messages: Array<{ role: 'user' | 'assistant'; content: string }> } {
  const patterns = scaffold.pattern_discoveries.join(locale === 'zh-CN' ? '；' : '; ');
  const events_summary = scaffold.key_events
    .map((e) => `"${e.summary}"（${e.emotion}，${locale === 'zh-CN' ? '强度' : 'intensity'}${e.intensity.toFixed(1)}）`)
    .join(locale === 'zh-CN' ? '；' : '; ');

  const instruction = instr(locale, 'weekly', {
    dominant_emotion: scaffold.dominant_emotion,
    patterns: patterns || (locale === 'zh-CN' ? '暂无明显模式' : locale === 'en' ? 'no clear patterns' : locale === 'ja' ? '明確なパターンなし' : 'sin patrones claros'),
    events: events_summary || (locale === 'zh-CN' ? '暂无记录' : locale === 'en' ? 'no records' : locale === 'ja' ? '記録なし' : 'sin registros'),
  });

  const suffix = localeSuffix(locale);
  const langRule = suffix ? suffix.trim() + '\n\n' : '';
  const system = [
    langRule + EVA_PERSONA,
    toneGuard(locale),
    buildPersonalityContext(memory, locale),
    instruction,
  ].filter(Boolean).join('\n\n');

  return { system, messages: [{ role: 'user', content: locale === 'zh-CN' ? '生成本周回顾' : locale === 'en' ? 'Generate weekly review' : locale === 'ja' ? '週間レビューを生成' : 'Genera revisión semanal' }] };
}

export function buildEntityExtractionPrompt(
  user_message: string,
  locale: Locale = 'zh-CN',
): { system: string; messages: Array<{ role: 'user' | 'assistant'; content: string }> } {
  const system = locale === 'zh-CN'
    ? INSTRUCTIONS_ZH.entityExtract
    : INSTRUCTIONS_EN.entityExtract;
  return { system, messages: [{ role: 'user', content: user_message }] };
}

export function buildPatternDetectionPrompt(
  memory: Memory,
  user_message: string,
  locale: Locale = 'zh-CN',
): { system: string; messages: Array<{ role: 'user' | 'assistant'; content: string }> } {
  const v = memory.personality_vector;
  if (!v) return buildChatPrompt(memory, user_message, locale);
  return buildBasePrompt(memory, user_message, locale, instr(locale, 'pattern', {
    attachment: v.attachment_pattern,
    conflict: v.conflict_style,
    emotion: v.emotional_regulation,
  }));
}

export function buildRefutationPrompt(
  memory: Memory,
  user_message: string,
  dimension: string,
  claim: string,
  evidence: string[],
  locale: Locale = 'zh-CN',
) {
  const pnn = memory.pnn_vector;
  const dim = pnn ? pnn[dimension as keyof typeof pnn] : null;
  const confidence_pct = dim ? Math.round(((dim as { confidence: number }).confidence) * 100) : 40;
  return buildBasePrompt(memory, user_message, locale, instr(locale, 'refutation', claim, confidence_pct, evidence));
}

export function buildAssessmentDebriefPrompt(
  memory: Memory,
  user_message: string,
  keyInsight: string,
  evidence: string[],
  locale: Locale = 'zh-CN',
) {
  return buildBasePrompt(memory, user_message, locale, instr(locale, 'assessmentDebrief', keyInsight, evidence));
}

export function buildDynamicScriptPrompt(
  vector: import('../shared/types').PersonalityVector,
  recentDiaries: import('../shared/types').DiaryEntry[],
  locale: Locale = 'zh-CN',
  targetDimension?: string,
): { system: string } {
  const l = DIM_LABELS[locale] ?? DIM_LABELS['zh-CN'];

  const dimInfo = [
    `${l['trust_threshold']}: ${vector.trust_threshold.toFixed(2)} (0=${locale === 'zh-CN' ? '完全开放' : 'fully open'}, 1=${locale === 'zh-CN' ? '高度设防' : 'highly guarded'})`,
    `${l['boundary_strength']}: ${vector.boundary_strength.toFixed(2)}`,
    `${l['conflict_style']}: ${vector.conflict_style} (${l['confidence']} ${vector.conflict_score.toFixed(2)})`,
    `${l['attachment_pattern']}: ${vector.attachment_pattern} (${l['confidence']} ${vector.attachment_score.toFixed(2)})`,
    `${l['emotional_regulation']}: ${vector.emotional_regulation}`,
    `${l['stress_response']}: ${vector.stress_response} (${l['confidence']} ${vector.stress_score.toFixed(2)})`,
    `${l['achievement_drive']}: ${vector.achievement_drive} (${l['confidence']} ${vector.perfectionism_score.toFixed(2)})`,
    `${l['selfview_pattern']}: ${vector.selfview_pattern} (${l['confidence']} ${vector.growth_mindset_score.toFixed(2)})`,
    `${l['social_energy_style']}: ${vector.social_energy_style} (${l['confidence']} ${vector.social_energy_score.toFixed(2)})`,
  ];

  const ROUTER_DIM_TO_LABEL: Record<string, string> = {
    trustBoundaries: l['trust_threshold'],
    conflictResponse: l['conflict_style'],
    attachment: l['attachment_pattern'],
    emotionRegulation: l['emotional_regulation'],
    stressResponse: l['stress_response'],
    achievementMotivation: l['achievement_drive'],
    selfCognition: l['selfview_pattern'],
    socialEnergy: l['social_energy_style'],
  };

  const noDiary = locale === 'zh-CN' ? '未提供获授权的日记记录' : locale === 'en' ? 'no authorized diary entries provided' : locale === 'ja' ? '許可された日記記録は提供されていません' : 'no se proporcionaron entradas de diario autorizadas';
  const focusBlock = targetDimension && ROUTER_DIM_TO_LABEL[targetDimension]
    ? buildRouterTargetBlock(targetDimension, ROUTER_DIM_TO_LABEL[targetDimension]!, locale)
    : buildDynamicFocusBlock(vector, locale);

  const diaryText = recentDiaries.length > 0
    ? recentDiaries.map(d => {
        const patterns = d.patterns.length > 0 ? d.patterns.join(locale === 'zh-CN' ? '; ' : '; ') : (locale === 'zh-CN' ? '无明显模式' : 'no clear pattern');
        const emotions = d.emotions.map(e => `${e.label}(${e.intensity.toFixed(1)})`).join(', ');
        return `Date: ${d.date} | ${locale === 'zh-CN' ? '情绪' : 'emotion'}: ${emotions || (locale === 'zh-CN' ? '未检测' : 'none')} | ${locale === 'zh-CN' ? '模式' : 'patterns'}: ${patterns}`;
      }).join('\n')
    : noDiary;

  const langGuidance =
    locale === 'en' ? 'Generate the scenario content in English. '
    : locale === 'ja' ? 'シナリオの内容を日本語で生成してください。'
    : locale === 'es' ? 'Genera el contenido del escenario en español. '
    : '';

  const system = `${langGuidance}You are a psychological scenario designer for the EVA personality system. Generate one micro-sandbox scenario for a returning user.

${toneGuard(locale)}

【User's Current Baseline】
${dimInfo.join('\n')}

${focusBlock}

【Authorized Recent Diaries】
${diaryText}

Generate exactly 1 new high-pressure micro-sandbox scenario. Each scenario must:
- center on one primary dimension, with at most one secondary dimension used only to sharpen the pressure
- include setup: immersive scene description (80-150 chars), like a film clip with specific time/place/atmosphere
- include prompt: core question (1 sentence), natural and specific
- include options: A/B/C/D each covering different tendencies on the chosen dimension
- include vector_patch: each option's dimension mapping
- keep the scene concrete, cinematic, and socially realistic
- avoid humiliation, abuse, sexual content, self-harm, or diagnostic language
- do not spread the pressure evenly across many traits; create a single sharp decision point
- do NOT reuse the 8 existing scenarios (trust / conflict / attachment / emotion regulation / stress / achievement / self-cognition / social energy)
- if the baseline is already strong on the primary dimension, shift pressure toward contradiction or edge-case behavior instead of inventing a new trait

Output strict JSON array, no explanation:
[
  {"id": "...", "title": "...", "setup": "...", "prompt": "...", "options": {...}, "vector_patch": {...}}
]

vector_patch keys MUST be exactly one of: trust_threshold, boundary_strength, conflict_style, conflict_score, attachment_pattern, attachment_score, emotional_regulation, stress_response, stress_score, achievement_drive, perfectionism_score, selfview_pattern, growth_mindset_score, social_energy_style, social_energy_score. Do NOT invent other field names.`;

  return { system };
}

export function buildTimeCapsulePrompt(
  memory: Memory,
  user_message: string,
  capsule: TimeCapsule,
  locale: Locale = 'zh-CN',
) {
  const days_ago = Math.round((Date.now() - capsule.timestamp) / (24 * 60 * 60 * 1000));
  const topic_count = capsule.context_tags.reduce(
    (sum, tag) => sum + (memory.quick_state.mention_counts[tag] ?? 0),
    0,
  );
  return buildBasePrompt(memory, user_message, locale, instr(locale, 'timecapsule', days_ago, capsule.quote, topic_count));
}
