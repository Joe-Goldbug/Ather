// packages/core/src/report/report-prompts.ts
// Pure prompt building functions for report generation

import type { ReportContext } from './report-types.js';

import type { Locale } from '../shared/locales.js';

const REPORT_HEADERS: Record<Locale, { conversation: string; script: string; diary: string; evidence: string; corrections: string; user: string; correctionsNote: string; }> = {
  'zh-CN': {
    conversation: '【对话历史】',
    script: '【剧本测评结果】',
    diary: '【最近日记】',
    evidence: '【证据摘要】',
    corrections: '【用户纠正记录】',
    user: '请基于以上信息，生成用户的人格报告 JSON。',
    correctionsNote: '生成时禁止重复已被纠正的说法',
  },
  en: {
    conversation: '[Conversation History]',
    script: '[Script Assessment Results]',
    diary: '[Recent Diary Entries]',
    evidence: '[Evidence Summary]',
    corrections: '[User Corrections]',
    user: 'Based on the above, generate the user\'s personality report as JSON.',
    correctionsNote: 'Do not repeat claims that have been corrected by the user',
  },
  ja: {
    conversation: '【会話履歴】',
    script: '【スクリプト評価結果】',
    diary: '【最近の日记】',
    evidence: '【エビデンス概要】',
    corrections: '【ユーザー修正記録】',
    user: '上記の情なあに基づき、ユーザーの人格レポートをJSONで生成してください。',
    correctionsNote: 'すでにユーザーが修正した主張を繰り返さない',
  },
  es: {
    conversation: '[Historial de Conversación]',
    script: '[Resultados de Evaluación de Guion]',
    diary: '[Entradas Recientes del Diario]',
    evidence: '[Resumen de Evidencia]',
    corrections: '[Correcciones del Usuario]',
    user: 'Con base en lo anterior, genera el informe de personalidad del usuario en JSON.',
    correctionsNote: 'No repitas afirmaciones que el usuario haya corregido',
  },
};

export function getReportSystemPrompt(locale: Locale = 'zh-CN'): string {
  return buildEvidenceFirstReportSystemPrompt(locale);
}

/**
 * Runtime report policy. The legacy long-form prompts remain below solely as
 * migration reference; new reports must be evidence ledgers, never labels.
 */
function buildEvidenceFirstReportSystemPrompt(locale: Locale): string {
  const copy: Record<Locale, string> = {
    'zh-CN': `你是 EVA 的证据报告生成器。只输出 JSON。
这不是人格测评，也不能给用户固定类型、人格标签、排名、百分比或长期结论。
每个可见判断必须说明它引用的证据 ID；没有足够证据时，明确写“目前无法判断长期模式”。
输出格式：{ reportVersion: "evidence-v1", evidenceHighlights: [{ claimId, text, evidenceIds, counterevidenceIds, limitations }], limitations, summary }。
evidenceHighlights 必须使用对象；claimId 是报告内稳定的短 ID，evidenceIds 只能使用输入中的正式证据 ID。
text 用大白话描述“发生了什么”，不要写“你就是怎样的人”。
用户纠正过的内容只能作为反例或限制，不能被当作正式证据重新下结论。
不要输出 archetypeName、分数、UBV 或任何兼容字段。`,
    en: `You are EVA's evidence-report generator. Output JSON only.
This is not a personality test: never assign a fixed type, label, ranking, percentage, or long-term conclusion.
Every visible claim must name its evidence IDs. When evidence is insufficient, state that no long-term pattern can be determined.
Use evidenceHighlights objects with text, evidenceIds, counterevidenceIds, and limitations.`,
    ja: `あなたはAtherの証拠レポート生成器です。JSONのみを出力してください。
人格タイプ、固定ラベル、順位、百分率、長期的な結論をユーザーに与えてはいけません。
各記述は証拠IDを示し、証拠が不十分な場合は長期的な傾向を判断できないと明記してください。`,
    es: `Eres el generador de informes de evidencia de EVA. Devuelve solo JSON.
No asignes tipos fijos, etiquetas, clasificaciones, porcentajes ni conclusiones a largo plazo.
Cada afirmación visible debe incluir sus IDs de evidencia; si no basta, indica que no se puede determinar un patrón duradero.`,
  };
  return copy[locale];
}

const REPORT_SYSTEM_ZH = `你是 EVA 的人格报告生成引擎。
用户刚刚完成了一轮对话（6-8轮），现在要生成一份个性化人格报告。

要求：
- 只输出 JSON，不要任何解释文字
- JSON 字段必须严格匹配 ReportSchema（见下方 schema）
- 所有数值字段必须是 0-100 的整数
- coreTraits / behaviorPatterns / suggestions / evidenceHighlights / limitations 必须是非空字符串数组
- archetypeName 必须是单个英文/中文词（如"矛盾探索者"、"理性防御者"）
- 报告语气：EVA 的洞察分析风格，语言必须通俗易懂大白话，严禁出现 UBV、维度信号、反驳口、测评变量等生硬术语
- 所有关键判断必须绑定【证据摘要】里的具体编号、来源或原始证据，不允许凭空总结
- evidenceHighlights 必须写成“依据 -> 表现”的通俗形式，例如“在具体场景中...，因此呈现...”
- counterevidence 必须指出一个可能削弱主结论的观察或日常例外；没有就写“整体表现一致，但在特定场景下可能有弹性”
- limitations 必须用大白话说明观察积累的广度或样本局限

ReportSchema:
{
  trustBoundaries: number,       // 0-100 整数
  conflictResponse: number,      // 0-100 整数
  attachment: number,            // 0-100 整数
  emotionRegulation: number,     // 0-100 整数
  stressResponse: number,        // 0-100 整数
  achievementMotivation: number,  // 0-100 整数
  selfCognition: number,         // 0-100 整数
  socialEnergy: number,          // 0-100 整数
  rtScore: number,               // 0-100 整数（四维派生）
  icScore: number,               // 0-100 整数
  paScore: number,               // 0-100 整数
  arScore: number,               // 0-100 整数
  archetypeName: string,          // e.g. "矛盾探索者"
  archetypeDescription: string,   // 1-2 sentences
  coreTraits: string[],           // 3-5 个词
  internalTension: string,        // 描述内心张力
  behaviorPatterns: string[],     // 2-4 个模式
  suggestions: string[],          // 2-4 个建议
  evidenceHighlights: string[],   // 2-3 个关键证据
  counterevidence: string,         // 用户可能忽视的自我矛盾
  limitations: string[],          // 2-3 个报告局限性
  summary: string                // 2-3 句话总结
}`;

const REPORT_SYSTEM_EN = `You are EVA's personality report generation engine.
The user just completed a conversation (6-8 turns) and now a personalized personality report needs to be generated.

Requirements:
- Output JSON only, no explanatory text
- JSON fields must strictly match ReportSchema (see below)
- All numeric fields must be integers 0-100
- coreTraits / behaviorPatterns / suggestions / evidenceHighlights / limitations must be non-empty string arrays
- archetypeName must be a single word/phrase (e.g. "Contradiction Explorer", "Rational Defender")
- Tone: EVA's clinical analytical style, no warm preaching
- Every key claim must cite a concrete item, source, or quote from [Evidence Summary]; do not invent evidence
- evidenceHighlights must use an "evidence -> conclusion" structure
- counterevidence must name one possible weakening signal, correction, or evidence gap; if none exists, state that strong counterevidence was not found but the sample is limited
- limitations must mention sample size, recency, confidence, or user correction limits

ReportSchema:
{
  trustBoundaries: number,       // 0-100 integer
  conflictResponse: number,      // 0-100 integer
  attachment: number,           // 0-100 integer
  emotionRegulation: number,    // 0-100 integer
  stressResponse: number,       // 0-100 integer
  achievementMotivation: number, // 0-100 integer
  selfCognition: number,        // 0-100 integer
  socialEnergy: number,          // 0-100 integer
  rtScore: number,               // 0-100 integer (derived)
  icScore: number,               // 0-100 integer
  paScore: number,              // 0-100 integer
  arScore: number,              // 0-100 integer
  archetypeName: string,
  archetypeDescription: string,
  coreTraits: string[],
  internalTension: string,
  behaviorPatterns: string[],
  suggestions: string[],
  evidenceHighlights: string[],
  counterevidence: string,
  limitations: string[],
  summary: string
}`;

const REPORT_SYSTEM_JA = `あなたはAtherの人格レポート生成エンジンです。
ユーザーは会話を完了したところなので、個別化された人格レポートを生成する必要があります。

要件：
- JSONのみ出力、説明文なし
- JSONフィールドはReportSchemaに厳密に従うこと
- すべての数値フィールドは0-100の整数
- coreTraits / behaviorPatterns / suggestions / evidenceHighlights / limitationsは空でない文字列配列
- archetypeNameは1つの単語（例：「矛盾探求者」）
- トーン：Atherの臨床分析的スタイル、優しい説教なし
- 主要な判断は必ず【エビデンス概要】の具体項目・ソース・引用に紐づける
- evidenceHighlights は「エビデンス -> 結論」の形式にする
- counterevidence は主張を弱める可能性のある証拠・修正・不足を1つ示す
- limitations はサンプル量、新しさ、信頼度、修正記録の限界を述べる

ReportSchema:
{
  trustBoundaries: number,
  conflictResponse: number,
  attachment: number,
  emotionRegulation: number,
  stressResponse: number,
  achievementMotivation: number,
  selfCognition: number,
  socialEnergy: number,
  rtScore: number,
  icScore: number,
  paScore: number,
  arScore: number,
  archetypeName: string,
  archetypeDescription: string,
  coreTraits: string[],
  internalTension: string,
  behaviorPatterns: string[],
  suggestions: string[],
  evidenceHighlights: string[],
  counterevidence: string,
  limitations: string[],
  summary: string
}`;

const REPORT_SYSTEM_ES = `Eres el motor de generación de informes de personalidad de EVA.
El usuario acaba de completar una conversación (6-8 turnos) y ahora se debe generar un informe de personalidad personalizado.

Requisitos:
- Solo salida JSON, sin texto explicativo
- Los campos JSON deben coincidir estrictamente con ReportSchema (ver abajo)
- Todos los campos numéricos deben ser enteros 0-100
- coreTraits / behaviorPatterns / suggestions / evidenceHighlights / limitations deben ser arrays de strings no vacíos
- archetypeName debe ser una sola palabra/frase
- Tono: Estilo analítico clínico de EVA, sin sermones amables
- Cada juicio clave debe citar un elemento, fuente o cita concreta de [Resumen de Evidencia]
- evidenceHighlights debe seguir la forma "evidencia -> conclusión"
- counterevidence debe nombrar una señal, corrección o brecha que debilite la conclusión
- limitations debe mencionar límites de tamaño de muestra, recencia, confianza o correcciones

ReportSchema:
{
  trustBoundaries: number,
  conflictResponse: number,
  attachment: number,
  emotionRegulation: number,
  stressResponse: number,
  achievementMotivation: number,
  selfCognition: number,
  socialEnergy: number,
  rtScore: number,
  icScore: number,
  paScore: number,
  arScore: number,
  archetypeName: string,
  archetypeDescription: string,
  coreTraits: string[],
  internalTension: string,
  behaviorPatterns: string[],
  suggestions: string[],
  evidenceHighlights: string[],
  counterevidence: string,
  limitations: string[],
  summary: string
}`;

/** @deprecated Use getReportSystemPrompt(locale) instead */
export const REPORT_SYSTEM_PROMPT = REPORT_SYSTEM_ZH;

/**
 * Build the user prompt for report generation.
 * Includes conversation history + context (script results, diaries, evidence).
 */
export function buildReportUserPrompt(
  messages: Array<{ role: string; content: string }>,
  context: ReportContext,
  locale: Locale = 'zh-CN',
): string {
  const h = REPORT_HEADERS[locale];
  const roleLabel = locale === 'zh-CN'
    ? { user: '用户', eva: 'EVA' }
    : { user: 'User', eva: 'EVA' };

  const conversation = messages
    .filter(m => m.role === 'user' || m.role === 'assistant')
    .map(m => `${m.role === 'user' ? roleLabel.user : roleLabel.eva}: ${String(m.content).slice(0, 300)}`)
    .join('\n');

  const noData = locale === 'zh-CN' ? '暂无' : locale === 'en' ? 'No data' : locale === 'ja' ? 'データなし' : 'Sin datos';
  const correctionsNote = locale === 'zh-CN' ? '生成时禁止重复已被纠正的说法' : h.correctionsNote;
  const evidenceRule = locale === 'zh-CN'
    ? '硬性要求：报告每个关键结论必须能回指上面的证据编号/来源/原始证据；如果证据不足，必须写进 limitations，不要用漂亮话掩盖。'
    : locale === 'en'
    ? 'Hard rule: each key report claim must point back to an evidence number/source/quote above; if evidence is weak, put that in limitations instead of hiding it.'
    : locale === 'ja'
    ? '必須ルール：主要な主張は上のエビデンス番号・ソース・引用に戻れること。弱い証拠はlimitationsに書くこと。'
    : 'Regla obligatoria: cada afirmación clave debe volver a un número/fuente/cita de evidencia; si es débil, indícalo en limitations.';

  return `${h.conversation}
${conversation || noData}

${h.script}
${context.scriptResultText || noData}

${h.diary}
${context.recentDiariesText || noData}

${h.evidence}
${context.evidenceSummaryText || noData}

${evidenceRule}

${context.correctionsContext && context.correctionsContext !== '（无纠正记录）' ? `${h.corrections} — ${correctionsNote}
${context.correctionsContext}` : ''}

${h.user}`;
}
