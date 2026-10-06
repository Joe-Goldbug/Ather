/**
 * outbox 消费者契约（1-4）
 *
 * 契约：
 * 1. SELECT 必须带 FOR UPDATE SKIP LOCKED（多 worker 安全）且只取未投递、有处理器的事件
 * 2. 处理与标记在同一事务：UPDATE delivered_at 必须发生在 COMMIT 前
 * 3. 空批次安全（无待投递 → processed 0，不发 UPDATE）
 * 4. 批大小上限（防止一次拖太久）
 */
import { pollOutboxOnce, type OutboxHandler } from './outbox-poller.js';

type QueryFn = (sql: string, params?: unknown[]) => Promise<{ rows: unknown[] }>;

function makeDb(selectRows: unknown[]) {
  const order: string[] = [];
  const calls: Array<{ sql: string; params?: unknown[] }> = [];
  const query = jest.fn<Promise<{ rows: unknown[] }>, [string, unknown[]?]>(async (sql, params) => {
    const text = String(sql);
    calls.push({ sql: text, params });
    if (/^BEGIN/i.test(text.trim())) { order.push('begin'); return { rows: [] }; }
    if (/^COMMIT/i.test(text.trim())) { order.push('commit'); return { rows: [] }; }
    if (/^ROLLBACK/i.test(text.trim())) { order.push('rollback'); return { rows: [] }; }
    if (text.includes('FROM portrait_outbox')) {
      order.push('select');
      return { rows: selectRows };
    }
    if (text.includes('UPDATE portrait_outbox')) {
      order.push('update');
      return { rows: [] };
    }
    return { rows: [] };
  });

  const queryFn = query as unknown as QueryFn;
  // 模拟真实 pg Pool：connect() 返回独立 client（事务在其上执行）
  const db = {
    query: queryFn,
    connect: jest.fn(async () => ({ query: queryFn, release: jest.fn() })),
  };
  return { pool: db, query, order, calls };
}
const OUTBOX_ROW = {
  id: 'ob-1',
  event_type: 'correction.validation_requested',
  aggregate_id: 'corr-1',
  payload_minimized: { correction_id: 'corr-1' },
};

function pollHandled(pool: unknown, handler: OutboxHandler = async () => {}) {
  return pollOutboxOnce(pool as never, new Map([[OUTBOX_ROW.event_type, handler]]));
}

describe('pollOutboxOnce（1-4 outbox 消费者）', () => {
  it('SELECT 带 FOR UPDATE SKIP LOCKED 且只取未投递事件', async () => {
    const { pool, calls, order } = makeDb([OUTBOX_ROW]);
    const result = await pollHandled(pool);

    const select = calls.find((c) => c.sql.includes('FROM portrait_outbox'));
    expect(select).toBeDefined();
    expect(String(select!.sql)).toContain('FOR UPDATE SKIP LOCKED');
    expect(String(select!.sql)).toContain('delivered_at IS NULL');
    expect(String(select!.sql)).toContain('event_type = ANY($1::text[])');
    expect(select!.params).toEqual([[OUTBOX_ROW.event_type]]);
    expect(result.processed).toBe(1);
  });

  it('UPDATE delivered_at 在 COMMIT 前（同事务）', async () => {
    const { pool, calls, order } = makeDb([OUTBOX_ROW]);
    await pollHandled(pool, () => { order.push('handle'); });

    expect(order).toEqual(['begin', 'select', 'handle', 'update', 'commit']);
    const update = calls.find((c) => c.sql.includes('UPDATE portrait_outbox'));
    expect(String(update!.sql)).toContain('delivered_at = NOW()');
  });

  it('空批次：processed 0，不发 UPDATE', async () => {
    const { pool, calls, order } = makeDb([]);
    const result = await pollHandled(pool);

    expect(result.processed).toBe(0);
    expect(calls.some((c) => c.sql.includes('UPDATE portrait_outbox'))).toBe(false);
  });

  it('批大小默认 20（LIMIT 存在）', async () => {
    const { pool, calls, order } = makeDb([]);
    await pollHandled(pool);
    const select = calls.find((c) => c.sql.includes('FROM portrait_outbox'));
    expect(String(select!.sql)).toContain('LIMIT 20');
  });

  it('没有处理器时不领取或标记事件', async () => {
    const { pool, calls } = makeDb([OUTBOX_ROW]);
    expect(await pollOutboxOnce(pool as never, new Map())).toEqual({ processed: 0, events: [] });
    expect(calls).toHaveLength(0);
  });

  it('处理器失败时回滚，事件仍可重试', async () => {
    const { pool, calls, order } = makeDb([OUTBOX_ROW]);
    await expect(pollHandled(pool, () => { throw new Error('handler failed'); })).rejects.toThrow('handler failed');
    expect(order).toEqual(['begin', 'select', 'rollback']);
    expect(calls.some((call) => call.sql.includes('UPDATE portrait_outbox'))).toBe(false);
  });
});
