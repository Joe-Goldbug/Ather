// apps/api/src/queue/outbox-poller.ts
// Only events with a registered handler can be claimed or marked delivered.
// A persisted event is not evidence that its business action has run.

type Pool = {
  query: (sql: string, params?: unknown[]) => Promise<{ rows: any[] }>;
};

export interface OutboxEvent {
  id: string;
  event_type: string;
  aggregate_id: string | null;
  payload_minimized: unknown;
}

export interface OutboxPollResult {
  processed: number;
  events: Array<Pick<OutboxEvent, 'id' | 'event_type'>>;
}

const BATCH_SIZE = 20;

/** Handlers must complete before the event is marked delivered. */
export type OutboxHandler = (event: OutboxEvent) => Promise<void> | void;

const registeredHandlers = new Map<string, OutboxHandler>();

export function registerOutboxHandler(eventType: string, handler: OutboxHandler): void {
  registeredHandlers.set(eventType, handler);
}

export async function pollOutboxOnce(
  pool: Pool,
  handlers: ReadonlyMap<string, OutboxHandler> = registeredHandlers,
): Promise<OutboxPollResult> {
  if (handlers.size === 0) return { processed: 0, events: [] };
  const client = await (pool as any).connect?.();
  const query = client ? client.query.bind(client) : pool.query.bind(pool);
  const hadClient = Boolean(client);

  try {
    if (hadClient) await query('BEGIN');
    const select = await query(
      `SELECT id, event_type, aggregate_id, payload_minimized
       FROM portrait_outbox
       WHERE delivered_at IS NULL AND event_type = ANY($1::text[])
       ORDER BY created_at ASC
       LIMIT ${BATCH_SIZE}
       FOR UPDATE SKIP LOCKED`,
      [[...handlers.keys()]],
    );
    const rows = select.rows as OutboxEvent[];

    if (rows.length > 0) {
      for (const event of rows) {
        const handler = handlers.get(event.event_type);
        if (!handler) throw new Error(`No outbox handler for ${event.event_type}`);
        await handler(event);
      }
      const ids = rows.map((r) => r.id);
      await query(
        `UPDATE portrait_outbox SET delivered_at = NOW() WHERE id = ANY($1::uuid[])`,
        [ids],
      );
    }

    if (hadClient) await query('COMMIT');
    return { processed: rows.length, events: rows.map(({ id, event_type }) => ({ id, event_type })) };
  } catch (err) {
    if (hadClient) await query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    if (client) client.release();
  }
}

/** worker 启动时的周期轮询；永不中断主进程 */
export function startOutboxPolling(pool: Pool, intervalMs: number): NodeJS.Timeout {
  const timer = setInterval(() => {
    pollOutboxOnce(pool).catch((err: unknown) => {
      console.error('[outbox] poll failed:', err instanceof Error ? err.message : err);
    });
  }, intervalMs);
  return timer;
}
