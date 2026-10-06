// apps/api/src/modules/report/report.service.ts
// Legacy report transport service.
// Keeps conversation_reports and personality_snapshots available as the storage
// layer behind current portrait history / snapshot views.

import { Injectable, ForbiddenException, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { QueueService, ReportQueueDisabledError } from '../../queue/queue.service.js';
import type { ReportJob } from '../../queue/queue.js';
import { Database } from '../../common/database.js';
import { failReport } from '../../queue/report-persistence.js';
import { REPORT_SOURCE_CLAIMS_QUERY, type ReportClaimRow } from '../../queue/report-claims.js';

const HISTORICAL_RECORD_MARKER = {
  record_kind: 'historical',
  current_evidence_status: 'not_revalidated',
} as const;

type StoredSource = { claimId: string; revisionId: string; evidenceIds: string[]; counterevidenceIds: string[] };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function storedSources(reportData: unknown): StoredSource[] | null {
  if (!reportData || typeof reportData !== 'object') return null;
  const data = reportData as Record<string, unknown>;
  if (data.reportVersion !== 'evidence-v1' || !Array.isArray(data.evidenceHighlights) || !data.evidenceHighlights.length) return null;
  const sources: StoredSource[] = [];
  for (const value of data.evidenceHighlights) {
    if (!value || typeof value !== 'object') return null;
    const source = value as Record<string, unknown>;
    if (typeof source.claimId !== 'string' || !UUID.test(source.claimId)
      || typeof source.revisionId !== 'string' || !UUID.test(source.revisionId)
      || !Array.isArray(source.evidenceIds) || source.evidenceIds.length === 0
      || !source.evidenceIds.every((id) => typeof id === 'string' && UUID.test(id))
      || !Array.isArray(source.counterevidenceIds)
      || !source.counterevidenceIds.every((id) => typeof id === 'string' && UUID.test(id))) return null;
    sources.push(source as StoredSource);
  }
  return sources;
}

function sameIds(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const sortedB = [...b].sort();
  return [...a].sort().every((id, index) => id === sortedB[index]);
}

function historicalMarker(reportData: unknown, currentClaims: Map<string, ReportClaimRow> | null) {
  const sources = storedSources(reportData);
  const changed = sources && currentClaims && sources.some((source) => {
    const current = currentClaims.get(source.claimId);
    return !current || current.revision_id !== source.revisionId
      || !sameIds(current.evidence_ids ?? [], source.evidenceIds)
      || !sameIds(current.counterevidence_ids ?? [], source.counterevidenceIds);
  });
  return { ...HISTORICAL_RECORD_MARKER,
    current_evidence_status: changed ? 'sources_changed' : 'not_revalidated' };
}

@Injectable()
export class ReportService {
  constructor(
    private readonly queue: QueueService,
    private readonly db: Database,
  ) {}

  private async currentClaimsFor(rows: Array<{ status: string; report_data?: unknown }>, userId: string) {
    const claimIds = [...new Set(rows.filter((row) => row.status === 'completed')
      .flatMap((row) => storedSources(row.report_data)?.map((source) => source.claimId) ?? []))];
    if (!claimIds.length) return null;
    const current = await this.db.pool.query<ReportClaimRow>(REPORT_SOURCE_CLAIMS_QUERY, [userId, claimIds]);
    return new Map(current.rows.map((row) => [row.claim_id, row]));
  }

  /** Trigger async report generation for a completed conversation.
   *  Called from ChatService when dialogue state is 'closed'.
   *  Idempotent: concurrent calls use the same reportId and BullMQ job ID.
   */
  async triggerReport(conversationId: string, userId: string, locale?: string): Promise<string> {
    const client = await this.db.pool.connect();
    let effectiveReportId: string;
    let createdReport = false;
    try {
      await client.query('BEGIN');

      const permission = await client.query<{ consent_type: string }>(
        `SELECT consent_type FROM consent_grants
         WHERE user_id = $1 AND granted = true
           AND consent_type IN ('report_generation', 'report_storage')`,
        [userId],
      );
      if (new Set(permission.rows.map((row) => row.consent_type)).size !== 2) {
        throw new ForbiddenException({ code: 'report_permission_required' });
      }

      // Lock conversation row to serialize concurrent triggers
      const ownerCheck = await client.query<{ user_id: string; id: string }>(
        'SELECT id, user_id FROM conversations WHERE id = $1 FOR UPDATE',
        [conversationId],
      );
      if (!ownerCheck.rows[0]) {
        throw new NotFoundException('Conversation not found');
      }
      if (ownerCheck.rows[0].user_id !== userId) {
        throw new ForbiddenException('Access denied');
      }

      const reportId = crypto.randomUUID();
      const inserted = await client.query<{ id: string; report_locale: string; status: string }>(
        `INSERT INTO conversation_reports (id, conversation_id, user_id, report_locale, status, error_message, updated_at)
         VALUES ($1, $2, $3, $4, 'generating', NULL, NOW())
         ON CONFLICT (conversation_id) DO NOTHING
         RETURNING id, report_locale, status`,
        [reportId, conversationId, userId, locale ?? 'zh-CN'],
      );
      createdReport = inserted.rows.length === 1;
      const persisted = inserted.rows[0] ?? (await client.query<{ id: string; report_locale: string; status: string }>(
        `SELECT id, report_locale, status FROM conversation_reports
         WHERE conversation_id = $1 AND user_id = $2 FOR UPDATE`,
        [conversationId, userId],
      )).rows[0];
      if (!persisted) throw new Error('Report row disappeared during trigger');
      effectiveReportId = persisted.id;
      locale = persisted.report_locale;
      await client.query('COMMIT');
      if (persisted.status === 'completed') return effectiveReportId;
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      throw err;
    } finally {
      client.release();
    }

    try {
      const job: ReportJob = { reportId: effectiveReportId, conversationId, userId, locale };
      const jobId = await this.queue.enqueueReport(job);
      console.log(`[ReportService] Enqueued report ${effectiveReportId} for conversation ${conversationId}`);
      return jobId;
    } catch (err) {
      if (createdReport && err instanceof ReportQueueDisabledError) {
        await failReport(this.db.pool, effectiveReportId, userId, 'report_queue_disabled').catch((failure) => {
          console.error('[ReportService] failed to mark disabled report queue:', failure);
        });
      }
      throw new ServiceUnavailableException('Report queue is unavailable');
    }
  }

  /** Get report by ID — scoped to owner */
  async getReport(reportId: string, userId: string) {
    const rows = await this.db.pool.query(
      `SELECT id, conversation_id, user_id, status,
              rt_score, ic_score, pa_score, ar_score,
              archetype_name, archetype_description, core_traits,
              internal_tension, behavior_patterns, suggestions,
              summary, report_data, error_message, created_at, updated_at
       FROM conversation_reports WHERE id = $1 AND user_id = $2`,
      [reportId, userId],
    );
    const row = rows.rows[0];
    if (!row) return null;
    const currentClaims = await this.currentClaimsFor([row], userId);
    return { ...row, model_status: 'legacy', deprecated: true,
      ...(row.status === 'completed' ? historicalMarker(row.report_data, currentClaims) : {}) };
  }

  /** Get report status by ID — scoped to owner */
  async getReportStatus(reportId: string, userId: string) {
    const rows = await this.db.pool.query(
      'SELECT id, status, error_message, report_data FROM conversation_reports WHERE id = $1 AND user_id = $2',
      [reportId, userId],
    );
    const row = rows.rows[0];
    if (!row) return null;
    const currentClaims = await this.currentClaimsFor([row], userId);
    const statusRow = { ...row };
    delete statusRow.report_data;
    return { ...statusRow, model_status: 'legacy', deprecated: true,
      ...(row.status === 'completed' ? historicalMarker(row.report_data, currentClaims) : {}) };
  }

  /** Get user's recent personality snapshots */
  async getSnapshots(userId: string, limit = 10) {
    const rows = await this.db.pool.query(
      `SELECT id, source_type, source_id, conversation_id, ubv_snapshot, label, created_at
       FROM personality_snapshots
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT $2`,
      [userId, limit],
    );
    return rows.rows.map((row) => ({ ...row, model_status: 'legacy', deprecated: true, ...HISTORICAL_RECORD_MARKER }));
  }

  /** Get user's recent portrait-history rows from conversation_reports */
  async getReports(userId: string, limit = 5) {
    const rows = await this.db.pool.query(
      `SELECT id, conversation_id, status, rt_score, ic_score, pa_score, ar_score,
              archetype_name, summary, report_data, created_at
       FROM conversation_reports
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT $2`,
      [userId, limit],
    );
    const currentClaims = await this.currentClaimsFor(rows.rows, userId);
    return rows.rows.map((row) => {
      const reportRow = { ...row };
      delete reportRow.report_data;
      return { ...reportRow, model_status: 'legacy', deprecated: true,
        ...(row.status === 'completed' ? historicalMarker(row.report_data, currentClaims) : {}) };
    });
  }

  /** Get existing report for a conversation (for idempotency check) */
  async getReportByConversation(conversationId: string, userId: string) {
    const rows = await this.db.pool.query(
      `SELECT id, status FROM conversation_reports
       WHERE conversation_id = $1 AND user_id = $2
       LIMIT 1`,
      [conversationId, userId],
    );
    return rows.rows[0] ?? null;
  }
}
