import { describe, expect, it, vi } from 'vitest';
import { ReportSchema } from '@eva/core';
import { completeReport, failReport, upsertReport } from './report-persistence.js';

function fixture(granted = true, reportExists = true, currentClaims: unknown[] = []) {
  const calls: string[] = [];
  const query = vi.fn(async (sql: string, _params?: unknown[]) => {
    calls.push(sql);
    if (sql.includes('FROM consent_grants')) {
      return { rows: granted ? [{ consent_type: 'report_generation' }, { consent_type: 'report_storage' }] : [] };
    }
    if (sql.includes('GROUP BY c.id')) return { rows: currentClaims };
    if (sql.includes('FOR UPDATE OF observation')) return { rows: [{ id: 'claim-1' }] };
    if (sql.includes('UPDATE conversation_reports')) {
      return { rows: reportExists ? [{ conversation_id: 'conversation-1' }] : [] };
    }
    if (sql.includes('UPDATE conversations')) return { rows: [{ id: 'conversation-1' }] };
    return { rows: [] };
  });
  const client = { query, release: vi.fn() };
  const pool = { connect: vi.fn(async () => client) };
  return { pool, calls, client };
}

describe('report state persistence', () => {
  it('upserts only a report owned by the job user and preserves completed status', async () => {
    const query = vi.fn(async (_sql: string, _params?: unknown[]) => ({ rows: [{ id: 'report-1', status: 'completed' }] }));
    const result = await upsertReport({ query } as never, 'report-1', 'conversation-1', 'user-1');
    expect(result).toEqual({ id: 'report-1', status: 'completed' });
    expect(query.mock.calls[0][0]).toContain('conversation.user_id = $3');
    expect(query.mock.calls[0][0]).toContain("conversation_reports.status = 'completed'");
    expect(query.mock.calls[0][0]).toContain('conversation_reports.id = EXCLUDED.id');
  });

  it('commits report and conversation success in one transaction', async () => {
    const { pool, calls, client } = fixture();
    const saved = await completeReport(pool as never, 'report-1', 'user-1', ReportSchema.parse({
      evidenceHighlights: [], limitations: [], summary: 'bounded',
    }), []);

    expect(saved).toBe('completed');
    expect(calls).toContain('BEGIN');
    expect(calls).toContain('COMMIT');
    expect(calls.find((sql) => sql.includes('UPDATE conversation_reports'))).toContain('error_message = NULL');
    const reportCall = client.query.mock.calls.find(([sql]) => String(sql).includes('UPDATE conversation_reports'));
    expect(reportCall?.[1]?.[7]).toEqual([]);
    expect(reportCall?.[1]?.[9]).toEqual([]);
    expect(reportCall?.[1]?.[10]).toEqual([]);
    expect(calls.find((sql) => sql.includes('UPDATE conversations'))).toContain('jsonb_build_object');
    expect(client.release).toHaveBeenCalledOnce();
  });

  it('rolls back without publishing when report consent was revoked', async () => {
    const { pool, calls } = fixture(false);
    expect(await completeReport(pool as never, 'report-1', 'user-1', {} as never, [])).toBe('permission_revoked');
    expect(calls).toContain('ROLLBACK');
    expect(calls.some((sql) => sql.includes('UPDATE conversation_reports'))).toBe(false);
  });

  it('refuses a report whose selected claim changed before final persistence', async () => {
    const { pool, calls } = fixture(true, true, []);
    const selected = [{ claim_id: 'claim-1', revision_id: 'revision-1', claim_text: 'claim', evidence_ids: ['evidence-1'], counterevidence_ids: [], limitations: [] }];
    const result = await completeReport(pool as never, 'report-1', 'user-1', {} as never, selected);
    expect(result).toBe('sources_changed');
    expect(calls.some((sql) => sql.includes('FOR UPDATE OF observation'))).toBe(true);
    expect(calls.some((sql) => sql.includes('FROM evidence_events') && sql.includes('FOR SHARE'))).toBe(true);
    expect(calls).toContain('ROLLBACK');
    expect(calls.some((sql) => sql.includes('UPDATE conversation_reports'))).toBe(false);
  });

  it('marks only this user\'s generating report failed and updates its conversation', async () => {
    const { pool, calls } = fixture();
    expect(await failReport(pool as never, 'report-1', 'user-1', 'revoked')).toBe(true);
    const update = calls.find((sql) => sql.includes('UPDATE conversation_reports')) ?? '';
    expect(update).toContain("status = 'generating'");
    expect(update).toContain('user_id = $2');
    expect(calls.find((sql) => sql.includes('UPDATE conversations'))).toContain('jsonb_build_object');
    expect(calls).toContain('COMMIT');
  });

  it('does not turn an already completed or unrelated report into failed', async () => {
    const { pool, calls } = fixture(true, false);
    expect(await failReport(pool as never, 'report-1', 'user-1', 'late failure')).toBe(false);
    expect(calls.some((sql) => sql.includes('UPDATE conversations'))).toBe(false);
  });
});
