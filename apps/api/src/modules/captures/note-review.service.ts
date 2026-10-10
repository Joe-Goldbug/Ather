import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { Database } from '../../common/database.js';
import {
  generateNoteReview, NOTE_REVIEW_DIMENSION, parseNoteReview,
  type NoteFeedback, type NoteReviewDocument, type SavedNoteReview,
} from './note-review.js';

interface ReviewRow { id: string; ai_explanation: string; created_at: string }
interface SourceRow { id: string; raw_text: string | null }
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

@Injectable()
export class NoteReviewService {
  constructor(private readonly db: Database) {}

  async generate(userId: string, sourceIds: string[], locale = 'zh-CN', parentId?: string): Promise<SavedNoteReview> {
    if (!Array.isArray(sourceIds) || !sourceIds.length || sourceIds.length > 4 ||
      sourceIds.some((id) => typeof id !== 'string' || !UUID.test(id)) || new Set(sourceIds).size !== sourceIds.length ||
      (parentId !== undefined && !UUID.test(parentId))) {
      throw new BadRequestException({ message: '请选择一到四条不同的本人记录。' });
    }
    const sourceResult = await this.db.pool.query<SourceRow>(
      'SELECT id, raw_text FROM captures WHERE user_id = $1 AND id = ANY($2::uuid[]) ORDER BY id', [userId, sourceIds],
    );
    if (sourceResult.rows.length !== sourceIds.length) throw new NotFoundException({ message: '记录不存在或不属于你。' });
    if (sourceResult.rows.some((row) => !row.raw_text?.trim() || row.raw_text.length > 10_000)) {
      throw new BadRequestException({ message: '每条记录需要包含文字，且不超过 10,000 字。' });
    }
    const sources = sourceResult.rows.map((row) => ({ id: row.id, text: row.raw_text! }));
    const kind = sources.length === 1 ? 'single' : 'comparison';
    const primaryId = sources[0].id;
    const reviews = await this.db.pool.query<ReviewRow>(
      `SELECT id, ai_explanation, created_at FROM capture_interpretations
       WHERE user_id = $1 AND capture_id = ANY($2::uuid[]) AND dimension = $3 ORDER BY created_at DESC, id DESC`,
      [userId, sourceIds, NOTE_REVIEW_DIMENSION],
    );
    const sameSources = (document: NoteReviewDocument) =>
      document.kind === kind && document.source_ids.join(',') === sources.map((source) => source.id).join(',');
    const latest = reviews.rows.find((row) => { const doc = parseNoteReview(row.ai_explanation); return doc && sameSources(doc); });
    const previous = latest ? parseNoteReview(latest.ai_explanation)! : null;
    if (!parentId && latest) return { ...previous!, id: latest.id, created_at: latest.created_at };
    if (parentId && latest?.id !== parentId) throw new ConflictException({ message: '记录已更新，请重新打开最新解读。' });
    if (previous && previous.revision >= 20) throw new BadRequestException({ message: '这条记录已保留 20 个版本，可另记一次新经历。' });
    const additions = (row: ReviewRow, document: NoteReviewDocument) => [
      ...document.supplements, ...document.feedback.filter((feedback) => feedback.note.trim())
        .map((feedback, index) => ({ id: `feedback:${row.id}:${index}`, text: feedback.note })),
    ];
    const latestSingles = (rows: ReviewRow[]) => sources.map((source) => rows.find((row) => {
      const doc = parseNoteReview(row.ai_explanation);
      return doc?.kind === 'single' && doc.source_ids[0] === source.id;
    }));
    const singleRows = kind === 'comparison' ? latestSingles(reviews.rows) : [];
    const supplements = Array.from(new Map([
      ...(latest && previous ? additions(latest, previous) : []),
      ...singleRows.flatMap((row) => row ? additions(row, parseNoteReview(row.ai_explanation)!) : []),
    ].map((item) => [item.id, item])).values());
    const generated = await generateNoteReview(sources, supplements, kind,
      ['zh-CN', 'en', 'ja', 'es'].includes(locale) ? locale : 'zh-CN');
    const document: NoteReviewDocument = {
      schema: 'eva-note-review-v1', kind, source_ids: sources.map((source) => source.id),
      revision: (previous?.revision ?? 0) + 1, parent_id: parentId ?? null,
      content: generated.content, model: generated.model, supplements, feedback: [],
    };
    // No network call is made while holding a database lock. Recheck sources and
    // parent after generation so stale/cross-account output cannot be published.
    const client = await this.db.pool.connect();
    try {
      await client.query('BEGIN');
      const locked = await client.query<SourceRow>(
        'SELECT id, raw_text FROM captures WHERE user_id = $1 AND id = ANY($2::uuid[]) ORDER BY id FOR UPDATE',
        [userId, sourceIds],
      );
      if (JSON.stringify(locked.rows) !== JSON.stringify(sourceResult.rows)) throw new ConflictException({ message: '原文已改变，请重试。' });
      const now = await client.query<ReviewRow>(
        `SELECT id, ai_explanation, created_at FROM capture_interpretations
         WHERE user_id = $1 AND capture_id = ANY($2::uuid[]) AND dimension = $3 ORDER BY created_at DESC, id DESC FOR UPDATE`,
        [userId, sourceIds, NOTE_REVIEW_DIMENSION],
      );
      const current = now.rows.find((row) => { const doc = parseNoteReview(row.ai_explanation); return doc && sameSources(doc); });
      if (!parentId && current) {
        await client.query('COMMIT');
        return { ...parseNoteReview(current.ai_explanation)!, id: current.id, created_at: current.created_at };
      }
      if (parentId && (current?.id !== parentId || current.ai_explanation !== latest?.ai_explanation)) {
        throw new ConflictException({ message: '补充或解读已改变，请重新打开后重试。' });
      }
      if (kind === 'comparison' && JSON.stringify(latestSingles(now.rows)) !== JSON.stringify(singleRows)) {
        throw new ConflictException({ message: '选中记录的补充已更新，请重试。' });
      }
      const inserted = await client.query<ReviewRow>(
        `INSERT INTO capture_interpretations (id, capture_id, user_id, dimension, ai_explanation, proposed_delta, ai_confidence, status)
         VALUES ($1, $2, $3, $4, $5, NULL, 0, 'pending') RETURNING id, ai_explanation, created_at`,
        [randomUUID(), primaryId, userId, NOTE_REVIEW_DIMENSION, JSON.stringify(document)],
      );
      // Deliberately retain save_only and all existing use permissions.
      await client.query('COMMIT');
      return { ...document, id: inserted.rows[0].id, created_at: inserted.rows[0].created_at };
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      throw error;
    } finally { client.release(); }
  }

  async feedback(userId: string, captureId: string, reviewId: string, response: NoteFeedback['response'], note: string): Promise<SavedNoteReview> {
    if (![captureId, reviewId].every((id) => UUID.test(id)) ||
      !['fits', 'partly', 'wrong', 'supplement'].includes(response) || typeof note !== 'string' || note.length > 2000 ||
      (response === 'supplement' && !note.trim())) throw new BadRequestException({ message: '请填写有效的补充，最多 2,000 字。' });
    const client = await this.db.pool.connect();
    try {
      await client.query('BEGIN');
      const rows = await client.query<ReviewRow>(
        `SELECT id, ai_explanation, created_at FROM capture_interpretations
         WHERE id = $1 AND capture_id = $2 AND user_id = $3 AND dimension = $4 FOR UPDATE`,
        [reviewId, captureId, userId, NOTE_REVIEW_DIMENSION],
      );
      const row = rows.rows[0];
      const document = row && parseNoteReview(row.ai_explanation);
      if (!document) throw new NotFoundException({ message: '找不到这份解读。' });
      if (document.feedback.length >= 30) throw new BadRequestException({ message: '这份解读的补充已达上限，请更新解读。' });
      document.feedback.push({ response, note: note.trim(), created_at: new Date().toISOString() });
      await client.query(
        `UPDATE capture_interpretations SET ai_explanation = $1, status = $2 WHERE id = $3 AND user_id = $4`,
        [JSON.stringify(document), response === 'wrong' ? 'refuted' : 'pending', reviewId, userId],
      );
      await client.query('COMMIT');
      return { ...document, id: row.id, created_at: row.created_at };
    } catch (error) { await client.query('ROLLBACK').catch(() => {}); throw error; }
    finally { client.release(); }
  }
}
