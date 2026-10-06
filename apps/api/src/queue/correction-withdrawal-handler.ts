import type { OutboxEvent, OutboxHandler } from './outbox-poller.js';

type Queryable = {
  query: (sql: string, params?: unknown[]) => Promise<{ rows: unknown[] }>;
};

function payloadString(payload: unknown, key: string): string | null {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null;
  const value = (payload as Record<string, unknown>)[key];
  return typeof value === 'string' ? value : null;
}

/** Fail closed: retire any stored portrait revision that used withdrawn evidence. */
export function createCorrectionWithdrawalHandler(db: Queryable): OutboxHandler {
  return async (event: OutboxEvent) => {
    const evidenceId = payloadString(event.payload_minimized, 'evidence_id');
    if (!evidenceId) throw new Error('correction withdrawal is missing evidence_id');

    await db.query(
      `WITH affected AS MATERIALIZED (
         SELECT DISTINCT revision.id, revision.portrait_id
         FROM portrait_revisions revision
         JOIN portrait_revision_evidence linked ON linked.portrait_revision_id = revision.id
         WHERE linked.evidence_event_id = $1
       ), invalidated AS (
         UPDATE portrait_revisions revision
         SET state = 'invalidated'
         FROM affected
         WHERE revision.id = affected.id AND revision.state <> 'invalidated'
         RETURNING revision.id
       )
       UPDATE continuous_portraits portrait
       SET current_revision_id = NULL, updated_at = NOW()
       WHERE portrait.current_revision_id IN (SELECT id FROM affected)`,
      [evidenceId],
    );
  };
}
