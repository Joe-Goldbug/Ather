import type { Queue } from 'bullmq';
import type { QueryPool } from '../common/pool.js';
import type { ReportJob } from './queue.js';
import { failReport } from './report-persistence.js';
import { UserQueueAdmissionClosedError, withUserQueueAdmission } from './queue-admission.js';

type ReportQueue = Pick<Queue<ReportJob>, 'getJob' | 'add'>;

interface StaleReport {
  id: string;
  conversation_id: string;
  user_id: string;
  report_locale: string;
}

async function claimStaleReports(pool: QueryPool): Promise<StaleReport[]> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const pending = await client.query<StaleReport>(
      `SELECT id, conversation_id, user_id, report_locale
       FROM conversation_reports
       WHERE status = 'generating' AND updated_at < NOW() - INTERVAL '2 minutes'
       ORDER BY updated_at, id
       LIMIT 20 FOR UPDATE SKIP LOCKED`,
    );
    if (pending.rows.length) {
      // A durable lease: another worker can retry after two minutes if this process dies.
      await client.query(
        `UPDATE conversation_reports SET updated_at = NOW()
         WHERE id = ANY($1::uuid[])`,
        [pending.rows.map((row) => row.id)],
      );
    }
    await client.query('COMMIT');
    return pending.rows;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

export async function recoverStaleReportsOnce(pool: QueryPool, queue: ReportQueue): Promise<number> {
  const pending = await claimStaleReports(pool);
  let recovered = 0;
  for (const report of pending) {
    const job = await queue.getJob(report.id);
    const state = job ? await job.getState() : null;
    if (state === 'completed' || state === 'failed') {
      if (await failReport(pool, report.id, report.user_id, `report_job_${state}_without_result`)) {
        recovered++;
      }
    } else if (!job || state === 'unknown') {
      try {
        await withUserQueueAdmission(pool, report.user_id, () => queue.add('generate', {
          reportId: report.id,
          conversationId: report.conversation_id,
          userId: report.user_id,
          locale: report.report_locale,
        }, { jobId: report.id }));
        recovered++;
      } catch (error) {
        if (!(error instanceof UserQueueAdmissionClosedError)) throw error;
      }
    }
  }
  return recovered;
}
