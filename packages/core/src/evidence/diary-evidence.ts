// packages/core/src/evidence/diary-evidence.ts
// Pure functions — no DB, no network
// Generates evidence events from a diary / Daily Mirror entry

import type {
  EvidenceAttribution,
  EvidenceDimension,
  EvidenceFragment,
  WriteEvidenceParams,
} from './evidence-types.js';
import { DIMENSION_KEYS } from '../assessment/constants.js';
import { locateSentences } from './text-locate.js';
import { classifyAttribution } from './attribution.js';

export type DiaryRealitySyncEventType =
  | 'breakthrough'
  | 'compromise'
  | 'anger'
  | 'overwhelm'
  | 'boundary'
  | 'connection'
  | 'pattern'
  | 'other';

/**
 * Input: a Daily Mirror entry's structured fields.
 * These are locale-normalized keys defined in the i18n system.
 */
export interface DiaryEntryFields {
  /** "What was today's high point?" — free text */
  highPoint?: string;
  /** "What was today's low point?" — free text */
  lowPoint?: string;
  /** "Did you notice a pattern today?" — free text */
  patternNoticed?: string;
  /** "How connected did you feel to others today?" — free text */
  connectionOrDistance?: string;
  /** Reality Sync event tag chosen by the user. */
  eventType?: DiaryRealitySyncEventType;
  /** One-sentence event description. */
  detail?: string;
  /** Optional mood label */
  moodLabel?: string;
  /** Optional mood intensity 1-5 */
  moodIntensity?: number;
}

const EVENT_TYPE_DIMENSION_MAP: Record<DiaryRealitySyncEventType, Array<{
  dimension: EvidenceDimension;
  direction: number;
}>> = {
  breakthrough: [
    { dimension: 'achievementMotivation', direction: 1 },
    { dimension: 'selfCognition', direction: 1 },
    { dimension: 'growthOrientation', direction: 1 },
  ],
  compromise: [
    { dimension: 'conflictResponse', direction: -1 },
    { dimension: 'trustBoundaries', direction: -1 },
  ],
  anger: [
    { dimension: 'stressResponse', direction: -1 },
    { dimension: 'conflictResponse', direction: 1 },
  ],
  overwhelm: [
    { dimension: 'stressResponse', direction: -1 },
    { dimension: 'emotionRegulation', direction: -1 },
  ],
  boundary: [
    { dimension: 'trustBoundaries', direction: 1 },
    { dimension: 'attachment', direction: 1 },
  ],
  connection: [
    { dimension: 'socialEnergy', direction: 1 },
    { dimension: 'trustBoundaries', direction: 1 },
  ],
  pattern: [
    { dimension: 'selfCognition', direction: 1 },
    { dimension: 'growthOrientation', direction: 1 },
  ],
  other: [],
};

export const PATTERN_DIMENSION_MAP: Array<{
  pattern: RegExp;
  dimension: EvidenceDimension;
  direction: number; // +1 = high pattern = high value, -1 = high pattern = low value
}> = [
  // Social energy signals
  { pattern: /connect|人际|交流|朋友|social|友達|コミュニケーション|conectar|conexión/i, dimension: 'socialEnergy', direction: 1 },
  { pattern: /alone|独处|一个人|lonely|loneliness|一人|留守|soledad/i, dimension: 'socialEnergy', direction: -1 },
  // Stress / emotion regulation signals
  { pattern: /overwhelm|崩溃|崩溃|受不了|stress|压力|緊張|stretch|expuesto/i, dimension: 'stressResponse', direction: -1 },
  { pattern: /calm|平静|放松|还好|manageable|平静|穏やか|tranquil/i, dimension: 'emotionRegulation', direction: 1 },
  // Achievement signals
  { pattern: /accomplish|完成|做到了|进步|进步|achieved|logro|consiguio/i, dimension: 'achievementMotivation', direction: 1 },
  { pattern: /procrastinate|拖延|没做| postpone|延迟| postponed/i, dimension: 'achievementMotivation', direction: -1 },
  // Self-cognition / insight signals
  { pattern: /realize|意识到|发现|learned|理解|stumbled|gateway|洞察| 发现/i, dimension: 'selfCognition', direction: 1 },
  // Attachment / trust signals
  { pattern: /trust|depend|reached out|联系|倾诉|信頼|連絡/i, dimension: 'trustBoundaries', direction: 1 },
  { pattern: /push away|收回|回避|隔离|isolate|孤立|evitar|evitado/i, dimension: 'attachment', direction: -1 },
  // Growth orientation
  { pattern: /growth|成长|改变|challenge|stretch|伸び|crecio|crecimiento/i, dimension: 'growthOrientation', direction: 1 },
  // Shame signals
  { pattern: /shame|embarrass|embarassed|尴尬|丢脸|shy|恥ずかし|dignid|verg/i, dimension: 'shameSensitivity', direction: 1 },
];

/**
 * 抽取维度信号，同时记录每个维度首个命中的片段定位（2-A）与主语归因（2-B）。
 *
 * 信号强度语义（对 self 命中）与历史版本完全一致（同 field×pattern 至多贡献
 * 一次：首命中 0.6、后续 +0.2、封顶 1.0）；非 self 命中不进 signals，
 * 而是落入 otherMatches 作为独立事件产出（数据保留，计算隔离——D2-1）。
 */
interface OtherMatch {
  field: string;
  span: { start: number; end: number; text: string };
  dimension: EvidenceDimension;
  direction: number;
  attribution: EvidenceAttribution;
}

function extractDimensionSignals(entry: DiaryEntryFields): {
  signals: Partial<Record<EvidenceDimension, number>>;
  fragments: Partial<Record<EvidenceDimension, EvidenceFragment>>;
  otherMatches: OtherMatch[];
  /** 每个维度首个 self 命中规则的方向——delta 用它，而非 find() 的首条规则（方向 bug 修复） */
  directions: Partial<Record<EvidenceDimension, number>>;
} {
  const signals: Partial<Record<EvidenceDimension, number>> = {};
  const fragments: Partial<Record<EvidenceDimension, EvidenceFragment>> = {};
  const otherMatches: OtherMatch[] = [];
  const directions: Partial<Record<EvidenceDimension, number>> = {};
  const textFields: Array<[keyof DiaryEntryFields, string]> = (
    [
      ['detail', entry.detail],
      ['highPoint', entry.highPoint],
      ['lowPoint', entry.lowPoint],
      ['patternNoticed', entry.patternNoticed],
      ['connectionOrDistance', entry.connectionOrDistance],
    ] as Array<[keyof DiaryEntryFields, string | undefined]>
  ).filter((pair): pair is [keyof DiaryEntryFields, string] => Boolean(pair[1]));

  for (const [field, text] of textFields) {
    const spans = locateSentences(text);
    for (const { dimension, direction, pattern } of PATTERN_DIMENSION_MAP) {
      // 遍历该字段内此规则的**全部**命中——此前只看第一个匹配，
      // 同一字段里第二次出现的触发词（如先说自己、再说同事）从未被分类。
      const global = new RegExp(pattern.source, pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`);
      let selfCounted = false;
      let m: RegExpExecArray | null;
      while ((m = global.exec(text)) !== null) {
        if (m[0].length === 0) {
          global.lastIndex += 1; // 零宽匹配保护
          continue;
        }

        const sentence =
          spans.find((s) => m.index >= s.start && m.index < s.end) ??
          {
            start: m.index,
            end: Math.min(text.length, m.index + m[0].length),
            text: text.slice(m.index, m.index + m[0].length),
          };

        // 2-B1：主语归因——非本人命中不参与信号累计，单独产出事件。
        // 去重：patternNoticed 常回退为 detail 文本，同一句话会在两个字段
        // 各命中一次；按（维度+归因+句子文本）去重避免重复落库。
        const attribution = classifyAttribution(text, m.index);
        if (attribution !== 'self') {
          const duplicated = otherMatches.some(
            (o) =>
              o.dimension === dimension &&
              o.attribution === attribution &&
              o.span.text === sentence.text,
          );
          if (!duplicated) {
            otherMatches.push({
              field: String(field),
              span: sentence,
              dimension,
              direction,
              attribution,
            });
          }
          continue;
        }

        if (!selfCounted) {
          selfCounted = true;
          const prev = signals[dimension] ?? 0;
          // First match = 0.6, each additional (field×pattern) = +0.2, capped at 1.0
          signals[dimension] = Math.min(1.0, prev === 0 ? 0.6 : prev + 0.2);
          // 方向以首个 self 命中规则为准（修复：find() 恒取首条规则导致
          // "拖延"命中也沿用"进步"的 +1 方向的预存 bug）
          directions[dimension] ??= direction;

          // 片段定位：该维度首个 self 命中（字段顺序 = 用户的叙述顺序）
          if (!fragments[dimension]) {
            fragments[dimension] = {
              field: String(field),
              start: sentence.start,
              end: sentence.end,
              text: sentence.text,
              locator: `${String(field)}:${sentence.start}-${sentence.end}`,
            };
          }
        }
        // 同字段×规则的后续 self 命中：历史上从不重复计分，保持忽略
      }
    }
  }

  return { signals, fragments, otherMatches, directions };
}

function buildEventTypeEvidenceEvents(
  userId: string,
  diaryEntryId: string,
  entry: DiaryEntryFields,
  locale: string,
): WriteEvidenceParams[] {
  const eventType = entry.eventType ?? 'other';
  const patches = EVENT_TYPE_DIMENSION_MAP[eventType] ?? [];
  const detailText = entry.detail ?? entry.patternNoticed ?? entry.highPoint ?? entry.lowPoint ?? entry.connectionOrDistance ?? '';
  // 标签路径没有触发词可定位：quote 取首句（此前是前 200 字，同样与语义无关）
  const firstSentence = locateSentences(detailText)[0]?.text ?? detailText;
  const quote = firstSentence.slice(0, 200);
  if (patches.length === 0 || !quote) return [];

  return patches.map((patch) => {
    const delta = Math.round(patch.direction * 8);
    const dimensionLabel = patch.dimension;
    return {
      userId,
      sourceType: 'diary',
      sourceId: diaryEntryId,
      dimension: dimensionLabel,
      delta,
      weight: 0.12,
      confidence: 0.7,
      quote,
      explanation: locale === 'zh-CN'
        ? `现实同步标签「${eventType}」对${dimensionLabel}产生方向性信号（delta: ${delta}）`
        : `Reality Sync tag "${eventType}" produced a directional signal for ${dimensionLabel} (delta: ${delta})`,
    };
  });
}

/**
 * Compute evidence events from a Daily Mirror / diary entry.
 *
 * Diary evidence is lower weight than test evidence (0.15) because:
 * - Self-report is less structured than a scenario test
 * - Mood-dependent framing can bias text
 * - But longitudinal accumulation over weeks is genuinely valuable
 *
 * @param userId      User id
 * @param diaryEntryId Diary entry id (sourceId)
 * @param entry       Structured diary entry fields
 * @param locale      Locale of the entry
 */
export function computeDiaryEvidenceEvents(
  userId: string,
  diaryEntryId: string,
  entry: DiaryEntryFields,
  locale: string = 'zh-CN',
): WriteEvidenceParams[] {
  const eventType = entry.eventType ?? 'other';
  const taggedDimensions = new Set(
    (EVENT_TYPE_DIMENSION_MAP[eventType] ?? []).map((patch) => patch.dimension),
  );
  const { signals, fragments, otherMatches, directions } = extractDimensionSignals(entry);
  const events: WriteEvidenceParams[] = buildEventTypeEvidenceEvents(userId, diaryEntryId, entry, locale);

  for (const [dimension, signalStrength] of Object.entries(signals)) {
    if (signalStrength === undefined) continue;
    if (taggedDimensions.has(dimension as EvidenceDimension)) continue;

    // Direction of the signal: 首个 self 命中规则的方向（修复 find() 方向 bug）
    const direction = directions[dimension as EvidenceDimension] ?? 1;

    // Scale delta to [-12, +12] — diary deltas are small and incremental
    const delta = Math.round(direction * signalStrength * 12);
    if (delta === 0) continue;

    const weight = 0.15; // Light weight for diary source
    const confidence = Math.min(0.8, 0.3 + signalStrength * 0.3);
    // 2-A2：quote = 触发词所在句（首个命中），不再是"前 200 字"
    const fragment = fragments[dimension as EvidenceDimension];
    const quote = (fragment?.text ?? entry.detail ?? entry.patternNoticed ?? entry.highPoint ?? '').slice(0, 200);

    const explanation = buildDiaryExplanation(
      dimension as EvidenceDimension,
      delta,
      signalStrength,
      locale,
    );

    events.push({
      userId,
      sourceType: 'diary',
      sourceId: diaryEntryId,
      dimension: dimension as EvidenceDimension,
      delta,
      weight,
      confidence,
      quote,
      explanation,
      fragment,
      attribution: 'self',
    });
  }

  // 2-B2：非本人命中单独成事件。数据保留（关系线索），由写入方置
  // candidate=true 隔离出本人画像计算（D2-1），不会被 1-3 过滤器与
  // formal 晋升采纳。
  for (const m of otherMatches) {
    if (taggedDimensions.has(m.dimension)) continue;

    // 单次命中强度固定 0.6（与 self 首命中规则一致）
    const delta = Math.round(m.direction * 0.6 * 12);
    if (delta === 0) continue;

    events.push({
      userId,
      sourceType: 'diary',
      sourceId: diaryEntryId,
      dimension: m.dimension,
      delta,
      weight: 0.15,
      confidence: Math.min(0.8, 0.3 + 0.6 * 0.3),
      quote: m.span.text.slice(0, 200),
      explanation: buildDiaryExplanation(m.dimension, delta, 0.6, locale),
      fragment: {
        field: m.field,
        start: m.span.start,
        end: m.span.end,
        text: m.span.text,
        locator: `${m.field}:${m.span.start}-${m.span.end}`,
      },
      attribution: m.attribution,
    });
  }

  return events;
}

function buildDiaryExplanation(
  dimension: EvidenceDimension,
  delta: number,
  signal: number,
  locale: string,
): string {
  const labels: Record<string, Record<string, string>> = {
    'zh-CN': {
      socialEnergy: '社交能量', stressResponse: '压力反应', emotionRegulation: '情绪调节',
      achievementMotivation: '成就动机', selfCognition: '自我认知', trustBoundaries: '信任边界',
      attachment: '依恋模式', growthOrientation: '成长导向', shameSensitivity: '羞耻敏感度',
    },
    en: {
      socialEnergy: 'Social Energy', stressResponse: 'Stress Response', emotionRegulation: 'Emotion Regulation',
      achievementMotivation: 'Achievement', selfCognition: 'Self-Cognition', trustBoundaries: 'Trust Boundaries',
      attachment: 'Attachment', growthOrientation: 'Growth', shameSensitivity: 'Shame Sensitivity',
    },
  };

  const localeLabels = labels[locale] ?? labels['en'];
  const dimLabel = localeLabels[dimension] ?? dimension;
  const signalLevel = signal > 0.7 ? 'strong' : signal > 0.4 ? 'moderate' : 'mild';

  if (locale === 'zh-CN') {
    return `现实同步记录显示${dimLabel}呈${signalLevel}信号（delta: ${delta}），来源于用户的事件注入`;
  }

  return `Reality Sync record shows ${dimLabel} ${signalLevel} signal (delta: ${delta}), from user event injection`;
}
