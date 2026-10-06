// packages/core/src/evidence/text-locate.ts
// Pure functions — no DB, no network
// 句子切分器：为证据片段定位（2-A）提供"触发词所在句"的偏移信息。

export interface TextSpan {
  /** 字段文本内的起始字符偏移（含） */
  start: number;
  /** 结束字符偏移（不含）——`text.slice(start, end) === text` 可重算验证 */
  end: number;
  text: string;
}

const TERMINATORS = '。！？；…!?.;\n\r';

function isTerminator(ch: string): boolean {
  return TERMINATORS.includes(ch);
}

/**
 * 将文本切分为句子，保留每句在原文中的字符偏移。
 *
 * 规则：
 * - 中英文句终符（。！？；…!?;\n\r）连续出现折叠为单个边界，句终符归入前句
 * - 末尾无句终符的剩余文本作为最后一句
 * - 纯空白句被丢弃（保留句的偏移不受影响）
 * - 空输入返回 []
 */
export function locateSentences(text: string): TextSpan[] {
  if (!text) return [];

  const spans: TextSpan[] = [];
  const push = (rawStart: number, end: number) => {
    // 前导空白修剪：句偏移同步前移，保证 text 与偏移始终一致
    let start = rawStart;
    while (start < end && /\s/.test(text[start])) start += 1;
    spans.push({ start, end, text: text.slice(start, end) });
  };

  let start = 0;
  let i = 0;
  while (i < text.length) {
    if (isTerminator(text[i])) {
      while (i < text.length && isTerminator(text[i])) i += 1;
      push(start, i);
      start = i;
    } else {
      i += 1;
    }
  }
  if (start < text.length) push(start, text.length);

  return spans.filter((s) => s.text.trim().length > 0);
}
