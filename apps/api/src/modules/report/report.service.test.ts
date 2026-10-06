import { ServiceUnavailableException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { ReportQueueDisabledError } from '../../queue/queue.service.js';
import { createQueryPool } from '../../common/pool.js';
import { ReportService } from './report.service.js';
import { ReportController } from './report.controller.js';

function fixture(status = 'generating', existing = false) {
  const events: string[] = [];
  const query = vi.fn(async (sql: string) => {
    events.push(sql);
    if (sql.includes('FROM consent_grants')) {
      return { rows: [{ consent_type: 'report_generation' }, { consent_type: 'report_storage' }] };
    }
    if (sql.includes('SELECT id, user_id FROM conversations')) {
      return { rows: [{ id: 'conversation-1', user_id: 'user-1' }] };
    }
    if (sql.includes('INSERT INTO conversation_reports')) {
      return { rows: existing ? [] : [{ id: 'report-1', report_locale: 'en', status }] };
    }
    if (sql.includes('FROM conversation_reports')) return { rows: [{ id: 'report-1', report_locale: 'en', status }] };
    if (sql.includes('UPDATE conversation_reports')) return { rows: [{ conversation_id: 'conversation-1' }] };
    if (sql.includes('UPDATE conversations')) return { rows: [{ id: 'conversation-1' }] };
    return { rows: [] };
  });
  const client = { query, release: vi.fn() };
  const pool = { query, connect: vi.fn(async () => client) };
  const enqueueReport = vi.fn(async () => { events.push('ENQUEUE'); return 'report-1'; });
  const service = new ReportService({ enqueueReport } as never, { pool } as never);
  return { service, enqueueReport, events };
}

describe('legacy report enqueue', () => {
  it('commits the report row before making the job visible to the worker', async () => {
    const { service, events, enqueueReport } = fixture();
    await expect(service.triggerReport('conversation-1', 'user-1')).resolves.toBe('report-1');
    expect(events.indexOf('COMMIT')).toBeLessThan(events.indexOf('ENQUEUE'));
    expect(enqueueReport).toHaveBeenCalledWith(expect.objectContaining({ locale: 'en' }));
  });

  it('leaves an ambiguous Redis error for recovery rather than racing a possibly accepted job', async () => {
    const { service, enqueueReport, events } = fixture();
    enqueueReport.mockRejectedValue(new Error('redis unavailable'));
    await expect(service.triggerReport('conversation-1', 'user-1')).rejects.toThrow(ServiceUnavailableException);
    expect(events).toContain('COMMIT');
    expect(events.some((sql) => sql.includes('UPDATE conversation_reports'))).toBe(false);
  });

  it('marks a report failed when the queue is explicitly disabled', async () => {
    const { service, enqueueReport, events } = fixture();
    enqueueReport.mockRejectedValue(new ReportQueueDisabledError());
    await expect(service.triggerReport('conversation-1', 'user-1')).rejects.toThrow(ServiceUnavailableException);
    expect(events.some((sql) => sql.includes('UPDATE conversation_reports') && sql.includes("status = 'failed'"))).toBe(true);
  });

  it('returns a previously completed report without enqueueing it again', async () => {
    const { service, enqueueReport } = fixture('completed', true);
    await expect(service.triggerReport('conversation-1', 'user-1')).resolves.toBe('report-1');
    expect(enqueueReport).not.toHaveBeenCalled();
  });

  it('does not fail an existing report when this API instance has queues disabled', async () => {
    const { service, enqueueReport, events } = fixture('generating', true);
    enqueueReport.mockRejectedValue(new ReportQueueDisabledError());
    await expect(service.triggerReport('conversation-1', 'user-1')).rejects.toThrow(ServiceUnavailableException);
    expect(events.some((sql) => sql.includes("SET status = 'failed'"))).toBe(false);
  });

  it.skipIf(!process.env.EVA_TEST_DATABASE_URL)('preserves the original report id and locale in PostgreSQL', async () => {
    const pool = createQueryPool(process.env.EVA_TEST_DATABASE_URL!);
    const userId = crypto.randomUUID();
    const conversationId = crypto.randomUUID();
    const enqueueReport = vi.fn(async (job: { reportId: string }) => job.reportId);
    const service = new ReportService({ enqueueReport } as never, { pool } as never);
    try {
      await pool.query('INSERT INTO users (id, email) VALUES ($1, $2)', [userId, `${userId}@example.test`]);
      await pool.query('INSERT INTO conversations (id, user_id) VALUES ($1, $2)', [conversationId, userId]);
      await pool.query(
        `INSERT INTO consent_grants (user_id, consent_type, granted)
         VALUES ($1, 'report_generation', true), ($1, 'report_storage', true)`, [userId],
      );
      const id = await service.triggerReport(conversationId, userId, 'ja');
      expect(await service.triggerReport(conversationId, userId, 'en')).toBe(id);
      expect(enqueueReport).toHaveBeenLastCalledWith({
        reportId: id, conversationId, userId, locale: 'ja',
      });
      const saved = await pool.query<{ report_locale: string }>(
        'SELECT report_locale FROM conversation_reports WHERE id = $1', [id],
      );
      expect(saved.rows[0].report_locale).toBe('ja');
      await pool.query("UPDATE conversation_reports SET status = 'completed' WHERE id = $1", [id]);
      enqueueReport.mockClear();
      expect(await service.triggerReport(conversationId, userId, 'en')).toBe(id);
      expect(enqueueReport).not.toHaveBeenCalled();
    } finally {
      await pool.query('DELETE FROM conversation_reports WHERE conversation_id = $1', [conversationId]);
      await pool.query('DELETE FROM consent_grants WHERE user_id = $1', [userId]);
      await pool.query('DELETE FROM conversations WHERE id = $1', [conversationId]);
      await pool.query('DELETE FROM users WHERE id = $1', [userId]);
      await pool.end?.();
    }
  });
});

describe('historical report read contract', () => {
  it('exposes completed report source status through the status controller without report data', async () => {
    const controller = new ReportController({ getReportStatus: async () => ({
      id: 'report-1', status: 'completed', error_message: null,
      record_kind: 'historical', current_evidence_status: 'sources_changed',
    }) } as never);

    await expect(controller.getStatus('report-1', { user: { id: 'user-1' } } as never)).resolves.toEqual({
      report_id: 'report-1', status: 'completed', error_message: null,
      model_status: 'legacy', deprecated: true,
      record_kind: 'historical', current_evidence_status: 'sources_changed',
    });
  });

  it('marks a linked historical report when its stored source claim is no longer current', async () => {
    const report = {
      id: 'report-1', status: 'completed', summary: 'Original summary',
      report_data: { reportVersion: 'evidence-v1', evidenceHighlights: [{
        claimId: '11111111-1111-4111-8111-111111111111',
        revisionId: '22222222-2222-4222-8222-222222222222',
        evidenceIds: ['33333333-3333-4333-8333-333333333333'], counterevidenceIds: [],
      }] },
    };
    const query = vi.fn(async (sql: string, _params?: unknown[]) => ({ rows: sql.includes('FROM published_observations') ? [] : [report] }));
    const service = new ReportService({} as never, { pool: { query } } as never);

    await expect(service.getReport('report-1', 'user-1')).resolves.toMatchObject({
      id: 'report-1', summary: 'Original summary', record_kind: 'historical',
      current_evidence_status: 'sources_changed',
    });
    await expect(service.getReportStatus('report-1', 'user-1')).resolves.toMatchObject({
      current_evidence_status: 'sources_changed',
    });
    await expect(service.getReports('user-1')).resolves.toMatchObject([{
      current_evidence_status: 'sources_changed',
    }]);
    expect((await service.getReportStatus('report-1', 'user-1'))).not.toHaveProperty('report_data');
    expect((await service.getReports('user-1'))[0]).not.toHaveProperty('report_data');
    expect(query.mock.calls.filter(([sql]) => sql.includes('FROM published_observations'))
      .every(([, params]) => params?.[0] === 'user-1')).toBe(true);
  });

  it('does not call matching sources a validated report', async () => {
    const claimId = '11111111-1111-4111-8111-111111111111';
    const revisionId = '22222222-2222-4222-8222-222222222222';
    const evidenceId = '33333333-3333-4333-8333-333333333333';
    const row = { id: 'report-1', status: 'completed', report_data: {
      reportVersion: 'evidence-v1', evidenceHighlights: [{
        claimId, revisionId, evidenceIds: [evidenceId], counterevidenceIds: [],
      }],
    } };
    const query = vi.fn(async (sql: string) => ({ rows: sql.includes('FROM published_observations')
      ? [{ claim_id: claimId, revision_id: revisionId, evidence_ids: [evidenceId], counterevidence_ids: [] }]
      : [row] }));
    const service = new ReportService({} as never, { pool: { query } } as never);

    await expect(service.getReport('report-1', 'user-1')).resolves.toMatchObject({
      current_evidence_status: 'not_revalidated',
    });
  });

  const historical = {
    record_kind: 'historical',
    current_evidence_status: 'not_revalidated',
    model_status: 'legacy',
    deprecated: true,
  };

  function readFixture(row: Record<string, unknown>) {
    const query = vi.fn(async (_sql: string, params: unknown[]) => ({
      rows: params.includes('user-1') ? [row] : [],
    }));
    const service = new ReportService({} as never, { pool: { query } } as never);
    return { service, query };
  }

  it('returns an owned report unchanged with historical, unvalidated status', async () => {
    const row = { id: 'report-1', user_id: 'user-1', status: 'completed', summary: 'Original summary', report_data: { evidenceHighlights: [] } };
    const { service, query } = readFixture(row);

    await expect(service.getReport('report-1', 'user-1')).resolves.toMatchObject({ ...row, ...historical });
    await expect(service.getReport('report-1', 'user-2')).resolves.toBeNull();
    expect(query.mock.calls[0][0]).toContain('WHERE id = $1 AND user_id = $2');
    expect(query.mock.calls[0][1]).toEqual(['report-1', 'user-1']);
  });

  it('marks report status without changing its original fields or ownership check', async () => {
    const row = { id: 'report-1', status: 'completed', error_message: null };
    const { service, query } = readFixture(row);

    await expect(service.getReportStatus('report-1', 'user-1')).resolves.toMatchObject({ ...row, ...historical });
    await expect(service.getReportStatus('report-1', 'user-2')).resolves.toBeNull();
    expect(query.mock.calls[0][0]).toContain('WHERE id = $1 AND user_id = $2');
  });

  it('preserves historical snapshot data and its user filter', async () => {
    const row = { id: 'snapshot-1', ubv_snapshot: { trustBoundaries: 2 }, source_type: 'chat' };
    const { service, query } = readFixture(row);

    await expect(service.getSnapshots('user-1', 3)).resolves.toEqual([{ ...row, ...historical }]);
    await expect(service.getSnapshots('user-2', 3)).resolves.toEqual([]);
    expect(query.mock.calls[0][0]).toContain('WHERE user_id = $1');
    expect(query.mock.calls[0][1]).toEqual(['user-1', 3]);
  });

  it('preserves historical report list data and its user filter', async () => {
    const row = { id: 'report-1', status: 'completed', archetype_name: 'Original name', summary: 'Original summary' };
    const { service, query } = readFixture(row);

    await expect(service.getReports('user-1', 4)).resolves.toEqual([{ ...row, ...historical }]);
    await expect(service.getReports('user-2', 4)).resolves.toEqual([]);
    expect(query.mock.calls[0][0]).toContain('WHERE user_id = $1');
    expect(query.mock.calls[0][1]).toEqual(['user-1', 4]);
  });

  it('does not describe a generating report as an archived conclusion', async () => {
    const row = { id: 'report-pending', status: 'generating', summary: null };
    const { service } = readFixture(row);

    const report = await service.getReport('report-pending', 'user-1');
    const status = await service.getReportStatus('report-pending', 'user-1');
    const history = await service.getReports('user-1');
    expect(report).not.toHaveProperty('record_kind');
    expect(status).not.toHaveProperty('current_evidence_status');
    expect(history[0]).not.toHaveProperty('record_kind');
  });
});
