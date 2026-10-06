/**
 * ProfileService.withdrawEvidence（用户第一纠偏权）
 *
 * 框架约定：apps/api 下 `.spec.ts` 归 jest，`.test.ts` 归 vitest。
 * 本文件原为 `profile-withdraw.test.ts`（vitest 风格），但它既不在
 * package.json 的 vitest 显式清单里，又落在 jest 的 testPath 内 —— 会被
 * jest 执行并以 "Vitest cannot be imported in a CommonJS module" 失败。
 * 现改为 jest 风格并重命名为 `.spec.ts`，与项目既有约定一致。
 */
import { NotFoundException } from '@nestjs/common';
import { ProfileService } from './profile.service.js';

type QueryFn = (sql: string, params?: unknown[]) => Promise<{ rows: unknown[] }>;

function makeService() {
  const query = jest.fn<ReturnType<QueryFn>, Parameters<QueryFn>>(async () => ({ rows: [] }));
  const recomputeDimension = jest.fn(async (dimension: string) => ({
    dimension,
    confidence: 0.5,
    value: 50,
  }));
  const db = { pool: { query } };
  const evidence = { recomputeDimension };
  const service = new ProfileService(db as never, evidence as never);
  return { service, query, recomputeDimension };
}

describe('ProfileService.withdrawEvidence（用户第一纠偏权）', () => {
  it('标记 withdrawn 并重算该维度置信度', async () => {
    const { service, query, recomputeDimension } = makeService();
    query
      .mockResolvedValueOnce({ rows: [{ dimension: 'trustBoundaries', portrait_status: 'formal' }] })
      .mockResolvedValueOnce({ rows: [] });
    recomputeDimension.mockResolvedValueOnce({
      dimension: 'trustBoundaries',
      confidence: 0.66,
      value: 50,
    });

    const result = await service.withdrawEvidence('user-1', 'ev-1');

    expect(result).toMatchObject({
      evidence_id: 'ev-1',
      dimension: 'trustBoundaries',
      portrait_status: 'withdrawn',
      already_withdrawn: false,
    });
    expect(recomputeDimension).toHaveBeenCalledWith('user-1', 'trustBoundaries');
  });

  it('关键契约：UPDATE 必须先于 recompute（recompute 用独立连接，不能读到未提交状态）', async () => {
    const { service, query, recomputeDimension } = makeService();
    const order: string[] = [];

    query.mockImplementation(async (sql: string) => {
      if (String(sql).includes('SET portrait_status')) {
        order.push('update');
        return { rows: [] };
      }
      order.push('select');
      return { rows: [{ dimension: 'attachment', portrait_status: 'formal' }] };
    });
    recomputeDimension.mockImplementation(async (dimension: string) => {
      order.push('recompute');
      return { dimension, confidence: 0.5, value: 50 };
    });

    await service.withdrawEvidence('user-1', 'ev-2');

    const updateAt = order.indexOf('update');
    const recomputeAt = order.indexOf('recompute');
    expect(updateAt).toBeGreaterThan(-1);
    expect(recomputeAt).toBeGreaterThan(-1);
    expect(updateAt).toBeLessThan(recomputeAt);
  });

  it('同时置 candidate=true，使重算时该条被排除', async () => {
    const { service, query, recomputeDimension } = makeService();
    query
      .mockResolvedValueOnce({ rows: [{ dimension: 'selfCognition', portrait_status: 'formal' }] })
      .mockResolvedValueOnce({ rows: [] });
    recomputeDimension.mockResolvedValueOnce({
      dimension: 'selfCognition',
      confidence: 0.5,
      value: 50,
    });

    await service.withdrawEvidence('user-1', 'ev-3');

    const updateCall = query.mock.calls.find(([sql]) => String(sql).includes('SET portrait_status'));
    expect(String(updateCall?.[0] ?? '')).toContain('candidate = true');
    expect(String(updateCall?.[0] ?? '')).toContain('UPDATE capture_interpretations');
    expect(String(updateCall?.[0] ?? '')).toContain("status = 'refuted'");
  });

  it('归属校验失败时抛 NotFoundException 且不触发重算', async () => {
    const { service, query, recomputeDimension } = makeService();
    query.mockResolvedValueOnce({ rows: [] });

    await expect(service.withdrawEvidence('user-1', 'ev-of-someone-else')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(recomputeDimension).not.toHaveBeenCalled();
  });

  it('重复驳回是幂等的，不重复重算', async () => {
    const { service, query, recomputeDimension } = makeService();
    query.mockResolvedValueOnce({
      rows: [{ dimension: 'attachment', portrait_status: 'withdrawn' }],
    });

    const result = await service.withdrawEvidence('user-1', 'ev-4');

    expect(result.already_withdrawn).toBe(true);
    expect(result.recomputed).toBeNull();
    expect(recomputeDimension).not.toHaveBeenCalled();
    expect(query.mock.calls[1]?.[0]).toContain('UPDATE capture_interpretations');
  });
});
