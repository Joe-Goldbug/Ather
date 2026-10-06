import { describe, expect, it, vi } from 'vitest';
import { parseOffset } from '../../common/pagination.js';
import { CapturesService } from './captures.service.js';
import { DiaryService } from '../diary/diary.service.js';
import type { Database } from '../../common/database.js';

describe('record pagination', () => {
  it('rejects invalid offsets without making a database query fail', () => {
    expect(parseOffset(undefined)).toBe(0);
    expect(parseOffset('-1')).toBe(0);
    expect(parseOffset('1.5')).toBe(0);
    expect(parseOffset('not-a-number')).toBe(0);
    expect(parseOffset('2147483648')).toBe(0);
    expect(parseOffset('51')).toBe(51);
  });

  it('paginates captures in deterministic order and retains their cues', async () => {
    const query = vi.fn()
      .mockResolvedValueOnce({ rows: [{ id: 'capture-1', captured_at: '2026-09-26T00:00:00Z' }] })
      .mockResolvedValueOnce({ rows: [{ id: 'cue-1', capture_id: 'capture-1' }] });
    const service = new CapturesService({ pool: { query } } as unknown as Database);

    const rows = await service.list('user-1', 51, 50);
    expect(query.mock.calls[0][0]).toContain('ORDER BY captured_at DESC, id DESC');
    expect(query.mock.calls[0][0]).toContain('LIMIT $2 OFFSET $3');
    expect(query.mock.calls[0][1]).toEqual(['user-1', 51, 50]);
    expect(rows[0].interpretations).toEqual([{ id: 'cue-1', capture_id: 'capture-1' }]);
  });

  it('paginates legacy diary entries in deterministic order', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [{ id: 'diary-1', content: '{"detail":"saved"}' }] });
    const service = new DiaryService({ pool: { query } } as unknown as Database);

    const rows = await service.getRecentDiaries('user-1', 8, 7);
    expect(query.mock.calls[0][0]).toContain('ORDER BY entry_date DESC, id DESC');
    expect(query.mock.calls[0][0]).toContain('LIMIT $2 OFFSET $3');
    expect(query.mock.calls[0][1]).toEqual(['user-1', 8, 7]);
    expect(rows[0].content).toEqual({ detail: 'saved' });
  });
});
