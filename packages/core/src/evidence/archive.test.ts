import { describe, expect, it } from 'vitest';

import { buildArchiveEntry, canonicalJson, verifyArchive } from './archive.js';

describe('canonicalJson（键序无关的确定性序列化）', () => {
  it('对象键序不影响输出', () => {
    expect(canonicalJson({ b: 1, a: 2 })).toBe(canonicalJson({ a: 2, b: 1 }));
  });

  it('嵌套对象与数组递归处理', () => {
    expect(canonicalJson({ x: [{ b: 1, a: 2 }], y: 's' })).toBe(
      canonicalJson({ y: 's', x: [{ a: 2, b: 1 }] }),
    );
  });

  it('undefined 值剔除（JSON.stringify 语义一致）', () => {
    expect(canonicalJson({ a: 1, b: undefined })).toBe(canonicalJson({ a: 1 }));
  });

  it('标量与 null', () => {
    expect(canonicalJson(null)).toBe('null');
    expect(canonicalJson(42)).toBe('42');
    expect(canonicalJson('s')).toBe('"s"');
  });
});

describe('buildArchiveEntry（2-C1 原始输入归档）', () => {
  const raw = { date: '2026-09-11', answers: { detail: '我同事又拖延了' }, eventType: 'other' };

  it('同输入 → 同 SHA256（十六进制 64 位）', () => {
    const a = buildArchiveEntry('diary', 'src-1', raw);
    const b = buildArchiveEntry('diary', 'src-1', raw);
    expect(a.contentSha256).toBe(b.contentSha256);
    expect(a.contentSha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it('键序不同的等价输入 → 同哈希（归档可重算的前提）', () => {
    const a = buildArchiveEntry('diary', 'src-1', { answers: { detail: 'x' }, date: 'd' });
    const b = buildArchiveEntry('diary', 'src-1', { date: 'd', answers: { detail: 'x' } });
    expect(a.contentSha256).toBe(b.contentSha256);
  });

  it('内容不同 → 哈希不同', () => {
    const a = buildArchiveEntry('diary', 'src-1', raw);
    const b = buildArchiveEntry('diary', 'src-1', { ...raw, answers: { detail: '别的' } });
    expect(a.contentSha256).not.toBe(b.contentSha256);
  });

  it('verifyArchive：原文重算哈希一致 → true；被篡改 → false', () => {
    const entry = buildArchiveEntry('diary', 'src-1', raw);
    expect(verifyArchive(entry.contentSha256, raw)).toBe(true);
    expect(verifyArchive(entry.contentSha256, { ...raw, tampered: true })).toBe(false);
  });
});
