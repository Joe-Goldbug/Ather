/**
 * DiaryService.upsertDiary —— 片段定位落库契约（2-A1）
 *
 * 契约：
 * 1. evidence_events 批量 INSERT 必须带 RETURNING id（否则无法回填片段归属）
 * 2. 带 fragment 的事件必须在同一事务内写入 evidence_source_fragments
 * 3. fragments INSERT 先于 COMMIT
 * 4. 无命中（无 fragment）时不产生 fragments INSERT
 *
 * core 抽取函数（computeDiaryEvidenceEvents）不 mock —— 用真实行为验证契约。
 */
import { DiaryService } from './diary.service.js';

type QueryFn = (sql: string, params?: unknown[]) => Promise<{ rows: unknown[] }>;

const DETAIL_WITH_TRIGGER =
  '今天开会还行。她说我最近状态不错，我也觉得有进步。晚上拖延了，没做该做的事。明天再赶。';

function makeDb() {
  const order: string[] = [];
  const fragmentCalls: Array<{ sql: string; params: unknown[] }> = [];
  const evidenceCalls: Array<{ sql: string; params: unknown[] }> = [];
  const archiveCalls: Array<{ sql: string; params: unknown[] }> = [];

  const query = jest.fn<Promise<{ rows: unknown[] }>, [string, unknown[]?]>(async (sql, params = []) => {
    const text = String(sql);
    if (/^BEGIN|^COMMIT|^ROLLBACK/.test(text.trim())) {
      order.push(text.trim().toLowerCase());
      return { rows: [] };
    }
    if (text.includes('INSERT INTO diary_entries')) {
      order.push('diary');
      return {
        rows: [
          { id: '6f1e2a3b-1111-4222-8333-444455556666', entry_date: '2026-09-11', mood_label: null, mood_intensity: null, created_at: '2026-09-11' },
        ],
      };
    }
    if (text.includes('INSERT INTO evidence_events')) {
      order.push('evidence');
      evidenceCalls.push({ sql: text, params: params ?? [] });
      // 2-A 起为 9 列 + RETURNING id；2-B 起为 11 列（candidate + quality_metadata）
      const per = params.length / (params.length % 11 === 0 ? 11 : 9);
      return { rows: Array.from({ length: per }, (_, i) => ({ id: `ev-${i + 1}` })) };
    }
    if (text.includes('INSERT INTO evidence_source_fragments')) {
      order.push('fragments');
      fragmentCalls.push({ sql: text, params: params ?? [] });
      return { rows: [] };
    }
    if (text.includes('INSERT INTO evidence_input_archives')) {
      order.push('archive');
      archiveCalls.push({ sql: text, params: params ?? [] });
      return { rows: [] };
    }
    return { rows: [] };
  });

  const client = { query: query as unknown as QueryFn, release: jest.fn() };
  const db = { pool: { connect: jest.fn(async () => client) } };
  return { db, query, order, fragmentCalls, evidenceCalls, archiveCalls };
}

function makeService(db: unknown) {
  return new DiaryService(db as never);
}

describe('DiaryService.upsertDiary 片段定位落库（2-A1）', () => {
  it('evidence INSERT 带 RETURNING id，fragments 在同一事务 COMMIT 前写入', async () => {
    const { db, query, order, fragmentCalls } = makeDb();
    const service = makeService(db);

    await service.upsertDiary('user-1', {
      date: '2026-09-11',
      answers: { detail: DETAIL_WITH_TRIGGER },
      locale: 'zh-CN',
    });

    const evidenceCall = query.mock.calls.find(([sql]) => String(sql).includes('INSERT INTO evidence_events'));
    expect(evidenceCall).toBeDefined();
    expect(String(evidenceCall![0])).toContain('RETURNING id');

    expect(fragmentCalls).toHaveLength(1);
    expect(fragmentCalls[0].params[0]).toBe('ev-1'); // 回填的 evidence id
    expect(fragmentCalls[0].params[1]).toBe('diary');
    expect(String(fragmentCalls[0].params[3])).toMatch(/^detail:\d+-\d+$/);

    expect(order).toContain('fragments');
    expect(order.indexOf('fragments')).toBeLessThan(order.indexOf('commit'));
  });

  it('无触发命中时不产生 fragments INSERT', async () => {
    const { db, fragmentCalls, query } = makeDb();
    const service = makeService(db);

    await service.upsertDiary('user-1', {
      date: '2026-09-11',
      answers: { detail: '平平无奇的一天，没什么可说的。' },
      locale: 'zh-CN',
    });

    expect(fragmentCalls).toHaveLength(0);
    const evidenceCall = query.mock.calls.find(([sql]) => String(sql).includes('INSERT INTO evidence_events'));
    expect(evidenceCall).toBeUndefined();
  });

  it('fragments 使用 ON CONFLICT 防重复（日记同日重写时幂等）', async () => {
    const { db, fragmentCalls } = makeDb();
    const service = makeService(db);

    await service.upsertDiary('user-1', {
      date: '2026-09-11',
      answers: { detail: DETAIL_WITH_TRIGGER },
      locale: 'zh-CN',
    });

    expect(fragmentCalls).toHaveLength(1);
    expect(fragmentCalls[0].sql).toContain('ON CONFLICT');
  });
});

describe('DiaryService.upsertDiary 归因落库（2-B · D2-1）', () => {
  it('about_other 事件：candidate=true + quality_metadata.attribution（计算隔离、数据保留）', async () => {
    const { db, evidenceCalls } = makeDb();
    const service = makeService(db);

    await service.upsertDiary('user-1', {
      date: '2026-09-11',
      answers: { detail: '我同事又拖延了' },
      locale: 'zh-CN',
    });

    expect(evidenceCalls).toHaveLength(1);
    const p = evidenceCalls[0].params;
    expect(p.length).toBe(14);
    expect(p[9]).toBe(true);
    expect(p[10]).toEqual({ attribution: 'about_other' });
    expect(p.slice(11)).toEqual(['user_self_report', 'recalled_event', `diary:${p[2]}`]);
  });

  it('hypothetical 事件同样 candidate=true', async () => {
    const { db, evidenceCalls } = makeDb();
    const service = makeService(db);

    await service.upsertDiary('user-1', {
      date: '2026-09-11',
      answers: { detail: '如果我当时拖延了就完了' },
      locale: 'zh-CN',
    });

    const p = evidenceCalls[0].params;
    expect(p[9]).toBe(true);
    expect(p[10]).toEqual({ attribution: 'hypothetical' });
  });

  it('self 事件：candidate=false + 显式本人归因', async () => {
    const { db, evidenceCalls } = makeDb();
    const service = makeService(db);

    await service.upsertDiary('user-1', {
      date: '2026-09-11',
      answers: { detail: '我总是拖延。' },
      locale: 'zh-CN',
    });

    const p = evidenceCalls[0].params;
    expect(p[9]).toBe(false);
    expect(p[10]).toEqual({ attribution: 'self' });
  });

  it('INSERT 语句包含 candidate 与 quality_metadata 列', async () => {
    const { db, evidenceCalls } = makeDb();
    const service = makeService(db);

    await service.upsertDiary('user-1', {
      date: '2026-09-11',
      answers: { detail: '我总是拖延。' },
      locale: 'zh-CN',
    });

    expect(evidenceCalls[0].sql).toContain('candidate');
    expect(evidenceCalls[0].sql).toContain('quality_metadata');
  });
});

describe('DiaryService.upsertDiary 原始输入归档（2-C1）', () => {
  it('同事务归档：INSERT archive 在 COMMIT 前，含 sha256 与 ON CONFLICT 幂等', async () => {
    const { db, order, archiveCalls } = makeDb();
    const service = makeService(db);

    await service.upsertDiary('user-1', {
      date: '2026-09-11',
      answers: { detail: '我总是拖延。' },
      locale: 'zh-CN',
    });

    expect(archiveCalls).toHaveLength(1);
    const archiveCall = archiveCalls[0] ?? { sql: '', params: [] as unknown[] };
    const archiveSql = archiveCall.sql;
    const archiveParams = archiveCall.params as unknown[];
    expect(archiveSql).toContain('content_sha256');
    expect(archiveSql).toContain('ON CONFLICT (source_type, source_id) DO NOTHING');
    // sha256 为 64 位十六进制
    expect(String(archiveParams[2])).toMatch(/^[0-9a-f]{64}$/);
    // 归档内容覆盖用户提交的原始输入
    expect(archiveParams[3]).toMatchObject({ date: '2026-09-11', answers: { detail: '我总是拖延。' } });
    // 同事务：archive 在 COMMIT 前
    expect(order.indexOf('archive')).toBeGreaterThan(-1);
    expect(order.indexOf('archive')).toBeLessThan(order.indexOf('commit'));
  });

  it('无证据产生时不归档（归档服务于证据可回溯性）', async () => {
    const { db, archiveCalls } = makeDb();
    const service = makeService(db);

    await service.upsertDiary('user-1', {
      date: '2026-09-11',
      answers: { detail: '平平无奇的一天，没什么可说的。' },
      locale: 'zh-CN',
    });

    expect(archiveCalls).toHaveLength(0);
  });
});
