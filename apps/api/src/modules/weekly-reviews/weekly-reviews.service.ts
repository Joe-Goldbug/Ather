// apps/api/src/modules/weekly-reviews/weekly-reviews.service.ts
// Weekly review service — queries/creates weekly_reviews entries
// Phase 7 — wires /weekly-review to NestJS backend

import { ConflictException, ForbiddenException, Injectable } from '@nestjs/common';
import { Database } from '../../common/database.js';
import { QueueService } from '../../queue/queue.service.js';
import type { WeeklyReviewJob } from '../../queue/queue.js';

function getWeekBounds(date: Date): { weekStart: string; weekEnd: string } {
  const d = new Date(date);
  const day = d.getDay();
  const monday = new Date(d);
  monday.setDate(d.getDate() - ((day + 6) % 7));
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  // Use local date parts to avoid UTC midnight shifting the date across timezone boundaries
  const fmt = (dt: Date) => {
    const y = dt.getFullYear();
    const m = String(dt.getMonth() + 1).padStart(2, '0');
    const day = String(dt.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  };
  return { weekStart: fmt(monday), weekEnd: fmt(sunday) };
}

@Injectable()
export class WeeklyReviewsService {
  constructor(
    private readonly db: Database,
    private readonly queue: QueueService,
  ) {}

  async getCurrentWeekReview(userId: string) {
    const { weekStart, weekEnd } = getWeekBounds(new Date());
    const rows = await this.db.pool.query(
      `SELECT id, week_start, content, summary, created_at
       FROM weekly_reviews
       WHERE user_id = $1 AND week_start = $2
       LIMIT 1`,
      [userId, weekStart],
    );
    return rows.rows[0] ?? null;
  }

  async triggerWeeklyReview(userId: string) {
    const { weekStart, weekEnd } = getWeekBounds(new Date());
    const permission = await this.db.pool.query<{ granted: boolean }>(
      `SELECT granted FROM consent_grants WHERE user_id = $1 AND consent_type = 'weekly_review_analysis'`,
      [userId],
    );
    if (permission.rows[0]?.granted !== true) {
      throw new ForbiddenException({ code: 'weekly_review_not_authorized' });
    }
    const eligible = await this.db.pool.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM captures
       WHERE user_id = $1 AND process_mode <> 'save_only' AND allow_weekly_review = true
         AND COALESCE(local_date, captured_at::date) BETWEEN $2::date AND $3::date`,
      [userId, weekStart, weekEnd],
    );
    if (Number(eligible.rows[0]?.count ?? 0) === 0) {
      throw new ConflictException({ code: 'no_authorized_weekly_entries' });
    }
    const job: WeeklyReviewJob = { userId, weekStart, weekEnd };
    const jobId = await this.queue.enqueueWeeklyReview(job);
    return { job_id: jobId, week_start: weekStart, week_end: weekEnd };
  }

  async getWeeklyReviewHistory(userId: string, limit = 8) {
    const rows = await this.db.pool.query(
      `SELECT id, week_start, summary, created_at
       FROM weekly_reviews
       WHERE user_id = $1
       ORDER BY week_start DESC
       LIMIT $2`,
      [userId, limit],
    );
    return rows.rows;
  }

  async getWeeklyReviewById(id: string) {
    const rows = await this.db.pool.query(
      `SELECT id, week_start, content, summary, created_at
       FROM weekly_reviews WHERE id = $1`,
      [id],
    );
    return rows.rows[0] ?? null;
  }
}
