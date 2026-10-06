// packages/core/src/evidence/attribution.ts
// Pure functions — no DB, no network
//
// 2-B1 主语归因分类器：判断一次模式命中描述的是"本人"还是"他人/假设"。
// 这是纯函数——命中位置由 diary-evidence 的正则给出，本模块只看上下文。

export type EvidenceAttribution = 'self' | 'about_other' | 'hypothetical';

/** 向命中位置之前回看的字符窗口宽度 */
const LOOKBACK_WINDOW = 12;

/**
 * 第三方主语词典。
 * 策略：宁窄勿宽——错杀可被用户纠偏（withdraw → recompute 已通），漏杀是脏数据。
 * v1 仅覆盖中文 + 少量高频英文属格；英文整句主语识别留待后续。
 */
const THIRD_PERSON_SUBJECTS = [
  // 关系称谓
  '同事', '老板', '领导', '上司', '客户', '老师', '导师', '前辈', '下属', '甲方',
  // 亲属
  '我妈', '妈妈', '我爸', '爸爸', '家人', '亲戚', '爷爷', '奶奶', '外婆', '外公',
  // 社交
  '朋友', '舍友', '室友', '同学', '伙伴', '搭档', '对方', '那个人', '大家',
  // 代词（"其他"的"他"由否定回视排除）
  '他', '她', '他们', '她们', '别人', '人家',
  // 英文高频属格
  'my colleague', 'my mom', 'my dad', 'my boss', 'my manager', 'my friend', 'my parents',
] as const;

/** 假设/反事实标记：描述的是没发生或假想的事，不是本人行为证据 */
const HYPOTHETICAL_MARKERS = [
  '如果', '要是', '假如', '假设', '万一', '若是', '倘若',
  'if i had', 'if i were',
] as const;

/**
 * 判断一次模式命中的归因。
 *
 * @param fieldText  命中所发生的完整字段文本
 * @param matchStart 正则匹配在 fieldText 中的起始偏移
 */
export function classifyAttribution(fieldText: string, matchStart: number): EvidenceAttribution {
  const windowStart = Math.max(0, matchStart - LOOKBACK_WINDOW);
  const window = fieldText.slice(windowStart, matchStart);

  // 先剥掉"其他"，避免其中的"他"触发代词误判（否定回视）
  const cleaned = window.replaceAll('其他', '');

  for (const subject of THIRD_PERSON_SUBJECTS) {
    if (cleaned.includes(subject)) return 'about_other';
  }
  for (const marker of HYPOTHETICAL_MARKERS) {
    if (window.includes(marker)) return 'hypothetical';
  }
  return 'self';
}
