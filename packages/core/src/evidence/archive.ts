// packages/core/src/evidence/archive.ts
// Pure functions — no DB, no network
//
// 2-C1 原始输入归档：证据可回溯到原始输入的字节，且哈希可重算验证。
//
// 关键设计：哈希基于 **canonicalJson**（键排序后的确定性序列化）而非
// JSON.stringify——生产库 JSONB 列不保留键序，读回后重算哈希必须与
// 写入时一致，唯有 canonical 形式能保证这一点。

import { createHash } from 'node:crypto';

/** 键排序、剔除 undefined 的确定性 JSON 序列化 */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(',')}}`;
}

export interface ArchiveEntry {
  /** SHA256(canonicalJson(raw))，十六进制 64 位 */
  contentSha256: string;
  /** 原始输入（JSONB 落库；读取方重算哈希时同样走 canonicalJson） */
  content: unknown;
}

export function buildArchiveEntry(
  _sourceType: string,
  _sourceId: string | null,
  raw: unknown,
): ArchiveEntry {
  const contentSha256 = createHash('sha256').update(canonicalJson(raw), 'utf8').digest('hex');
  return { contentSha256, content: raw };
}

/** 重算哈希并比对——归档验证即"任意 evidence 可回溯到原始输入字节" */
export function verifyArchive(expectedSha256: string, raw: unknown): boolean {
  return createHash('sha256').update(canonicalJson(raw), 'utf8').digest('hex') === expectedSha256;
}
