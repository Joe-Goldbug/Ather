import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NoteReviewService } from './note-review.service.js';
import type { NoteReviewDocument } from './note-review.js';

const { generate } = vi.hoisted(() => ({ generate: vi.fn() }));
vi.mock('./note-review.js', async () => ({ ...(await vi.importActual('./note-review.js')), generateNoteReview: generate }));
const id = '11111111-1111-4111-8111-111111111111';
const reviewId = '22222222-2222-4222-8222-222222222222';
const source = { id, raw_text: '我说可以，其实今晚有约。' };
const paragraph = { text: '你说了可以，还写下了今晚原本有约定。', evidence: [{ source_id: id, quote: '我说可以' }] };
const doc: NoteReviewDocument = {
  schema: 'eva-note-review-v1', kind: 'single', source_ids: [id], revision: 1, parent_id: null,
  content: { reaction: paragraph, impact: paragraph, uncertainty: paragraph, question: '你当时最在意什么？' },
  supplements: [], feedback: [], model: 'test-model',
};
beforeEach(() => { generate.mockReset(); generate.mockResolvedValue({ content: doc.content, model: 'test-model' }); });

describe('note review persistence and permissions', () => {
  it('checks ownership before sending any text to the model', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] });
    const service = new NoteReviewService({ pool: { query } } as never);
    await expect(service.generate('user-1', [id])).rejects.toThrow();
    expect(generate).not.toHaveBeenCalled();
    expect(query.mock.calls[0][1]).toEqual(['user-1', [id]]);
  });
  it('stores a structured review while preserving the original text and all use permissions', async () => {
    const query = vi.fn().mockResolvedValueOnce({ rows: [source] }).mockResolvedValueOnce({ rows: [] });
    const transaction = vi.fn().mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [source] })
      .mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [{ id: reviewId, created_at: '2026-10-10' }] })
      .mockResolvedValue({ rows: [] });
    const service = new NoteReviewService({ pool: { query, connect: vi.fn().mockResolvedValue({ query: transaction, release: vi.fn() }) } } as never);
    const review = await service.generate('user-1', [id]);
    expect(review.revision).toBe(1);
    expect(transaction.mock.calls.some(([sql]) => /UPDATE captures|INSERT INTO evidence_events/.test(String(sql)))).toBe(false);
    expect(String(transaction.mock.calls[1][0])).toContain('FOR UPDATE');
  });
  it('returns the stored review on repeated first requests without a model call', async () => {
    const query = vi.fn().mockResolvedValueOnce({ rows: [source] })
      .mockResolvedValueOnce({ rows: [{ id: reviewId, ai_explanation: JSON.stringify(doc), created_at: '2026-10-10' }] });
    const service = new NoteReviewService({ pool: { query } } as never);
    expect((await service.generate('user-1', [id])).id).toBe(reviewId);
    expect(generate).not.toHaveBeenCalled();
  });
  it('persists correction independently of the model and keeps original interpretation text', async () => {
    const query = vi.fn().mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: reviewId, ai_explanation: JSON.stringify(doc), created_at: '2026-10-10' }] })
      .mockResolvedValue({ rows: [] });
    const service = new NoteReviewService({ pool: { connect: vi.fn().mockResolvedValue({ query, release: vi.fn() }) } } as never);
    const review = await service.feedback('user-1', id, reviewId, 'wrong', '我只是忘了约定');
    expect(review.content).toEqual(doc.content);
    expect(review.feedback[0]).toMatchObject({ response: 'wrong', note: '我只是忘了约定' });
    expect(query.mock.calls[1][1]).toEqual([reviewId, id, 'user-1', 'noteReview']);
    expect(generate).not.toHaveBeenCalled();
  });
  it('rejects a stale revision parent before generating', async () => {
    const query = vi.fn().mockResolvedValueOnce({ rows: [source] })
      .mockResolvedValueOnce({ rows: [{ id: reviewId, ai_explanation: JSON.stringify(doc), created_at: '2026-10-10' }] });
    const service = new NoteReviewService({ pool: { query } } as never);
    await expect(service.generate('user-1', [id], 'zh-CN', id)).rejects.toThrow();
    expect(generate).not.toHaveBeenCalled();
  });
  it('creates a new revision using saved corrections without overwriting the previous one', async () => {
    const previous = { ...doc, feedback: [{ response: 'wrong', note: '我只是忘了约定', created_at: '2026-10-10' }] };
    const row = { id: reviewId, ai_explanation: JSON.stringify(previous), created_at: '2026-10-10' };
    const query = vi.fn().mockResolvedValueOnce({ rows: [source] }).mockResolvedValueOnce({ rows: [row] });
    const transaction = vi.fn().mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [source] })
      .mockResolvedValueOnce({ rows: [row] }).mockResolvedValueOnce({ rows: [{ id, created_at: '2026-10-11' }] }).mockResolvedValue({ rows: [] });
    const service = new NoteReviewService({ pool: { query, connect: vi.fn().mockResolvedValue({ query: transaction, release: vi.fn() }) } } as never);
    const updated = await service.generate('user-1', [id], 'zh-CN', reviewId);
    expect(updated).toMatchObject({ revision: 2, parent_id: reviewId });
    expect(generate.mock.calls[0][1]).toEqual([{ id: `feedback:${reviewId}:0`, text: '我只是忘了约定' }]);
    expect(transaction.mock.calls.some(([sql]) => String(sql).startsWith('UPDATE'))).toBe(false);
  });
});
