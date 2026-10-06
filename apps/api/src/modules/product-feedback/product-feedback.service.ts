import { BadRequestException, Injectable } from '@nestjs/common';
import crypto from 'crypto';
import { Database } from '../../common/database.js';

export interface SubmitProductFeedback {
  category?: string;
  content: string;
  sourcePage?: string;
  severity?: 'high' | 'medium' | 'low';
}

@Injectable()
export class ProductFeedbackService {
  constructor(private readonly db: Database) {}

  async submit(userId: string, input: SubmitProductFeedback) {
    const content = input.content?.trim();
    if (!content || content.length < 2 || content.length > 5_000) {
      throw new BadRequestException('invalid_feedback_content');
    }
    const category = input.category?.trim() || '体验反馈';
    const sourcePage = input.sourcePage?.trim() || 'web';
    const severity = input.severity ?? 'medium';
    if (!['high', 'medium', 'low'].includes(severity)) {
      throw new BadRequestException('invalid_feedback_severity');
    }
    if (category.length > 128 || sourcePage.length > 256) {
      throw new BadRequestException('invalid_feedback_metadata');
    }

    const client = await this.db.pool.connect();
    try {
      await client.query('BEGIN');
      const feedback = await client.query<{ id: string; status: string; severity: string; created_at: Date }>(
        `INSERT INTO product_feedback (user_id, category, content, source_page, severity, status)
         VALUES ($1, $2, $3, $4, $5, 'new')
         RETURNING id, status, severity, created_at`,
        [userId, category, content, sourcePage, severity],
      );
      const row = feedback.rows[0];
      await client.query(
        `INSERT INTO product_events (event_id, user_id, round_id, event_name, content_version, metadata, occurred_at)
         VALUES ($1, $2, 'feedback_round', 'feedback_submitted', 'feedback-v1', $3::jsonb, NOW())`,
        [`evt_fb_${row.id}_${crypto.randomUUID()}`, userId, JSON.stringify({ category, feedbackId: row.id })],
      );
      await client.query('COMMIT');
      return row;
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }
}
