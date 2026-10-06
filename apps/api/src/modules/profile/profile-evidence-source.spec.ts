/**
 * ProfileService.getEvidenceSource —— 证据原文回溯端点（2-A3 后端）
 *
 * 契约：
 * 1. 归属校验：非本人证据 → NotFoundException（不泄露存在性）
 * 2. 带 fragment 的 diary 证据 → 返回按 buildDiaryEntryFields 还原的字段文本 + 偏移
 * 3. 偏移越界（原文已变）→ fragment 置 null（防御，不让前端高亮错位）
 * 4. 无 fragment / 非 diary 源 → fragment 与 content_text 均为 null
 */
import { NotFoundException } from '@nestjs/common';
import { ProfileService } from './profile.service.js';

function makeService() {
  const query = jest.fn(async () => ({ rows: [] as unknown[] }));
  const service = new ProfileService({ pool: { query } } as never, {} as never);
  return { service, query };
}

const FRAGMENT_ROW = {
  id: 'ev-1',
  source_type: 'diary',
  source_id: '6f1e2a3b-1111-4222-8333-444455556666',
  fragment_locator: 'detail:0-4',
};

describe('ProfileService.getEvidenceSource（2-A3 后端）', () => {
  it('归属校验失败 → NotFoundException', async () => {
    const { service, query } = makeService();
    query.mockResolvedValueOnce({ rows: [] });

    await expect(service.getEvidenceSource('user-1', 'ev-of-other')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('diary 证据返回还原字段文本与偏移', async () => {
    const { service, query } = makeService();
    query
      .mockResolvedValueOnce({ rows: [FRAGMENT_ROW] })
      .mockResolvedValueOnce({
        rows: [{ content: JSON.stringify({ detail: '拖延了。其他没事。' }) }],
      });

    const result = await service.getEvidenceSource('user-1', 'ev-1');

    expect(result.source_type).toBe('diary');
    expect(result.content_text).toBe('拖延了。其他没事。');
    expect(result.fragment).toEqual({
      field: 'detail',
      start: 0,
      end: 4,
      locator: 'detail:0-4',
    });
    // 高亮可重算：slice(fragment.start, fragment.end) === 触发句
    expect(result.content_text!.slice(0, 4)).toBe('拖延了。');
  });

  it('偏移越界（原文已变）→ fragment 置 null', async () => {
    const { service, query } = makeService();
    query
      .mockResolvedValueOnce({ rows: [FRAGMENT_ROW] })
      .mockResolvedValueOnce({ rows: [{ content: JSON.stringify({ detail: '短了' }) }] });

    const result = await service.getEvidenceSource('user-1', 'ev-1');
    expect(result.fragment).toBeNull();
    expect(result.content_text).toBeNull();
  });

  it('无 fragment → 双 null，且不查询 diary_entries', async () => {
    const { service, query } = makeService();
    query.mockResolvedValueOnce({
      rows: [{ id: 'ev-2', source_type: 'diary', source_id: 'x', fragment_locator: null }],
    });

    const result = await service.getEvidenceSource('user-1', 'ev-2');
    expect(result.fragment).toBeNull();
    expect(result.content_text).toBeNull();
    expect(query).toHaveBeenCalledTimes(1);
  });

  it('非 diary 源不查询原文', async () => {
    const { service, query } = makeService();
    query.mockResolvedValueOnce({
      rows: [{ id: 'ev-3', source_type: 'test', source_id: 'run-1', fragment_locator: 'detail:0-4' }],
    });

    const result = await service.getEvidenceSource('user-1', 'ev-3');
    expect(result.fragment!.field).toBe('detail');
    expect(result.content_text).toBeNull();
    expect(query).toHaveBeenCalledTimes(1);
  });
});
