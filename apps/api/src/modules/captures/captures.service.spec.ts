import { CapturesService } from './captures.service.js';

describe('capture weekly review permission', () => {
  it('rejects weekly use for a save-only record before writing', async () => {
    const query = jest.fn();
    const service = new CapturesService({ pool: { query } } as never);
    await expect(service.create('user-1', {
      entryType: 'quick_fragment',
      processMode: 'save_only',
      modality: 'text',
      rawText: 'Private note',
      allowWeeklyReview: true,
    })).rejects.toMatchObject({ response: { code: 'save_only_cannot_allow_weekly_review' } });
    expect(query).not.toHaveBeenCalled();
  });

  it('writes the explicit per-record choice instead of inferring it from analyze mode', async () => {
    const query = jest.fn().mockResolvedValue({ rows: [{ id: 'capture-1' }] });
    const service = new CapturesService({ pool: { query } } as never);
    await service.create('user-1', {
      entryType: 'quick_fragment',
      processMode: 'analyze',
      modality: 'text',
      rawText: 'A note without keywords',
    });
    expect(query.mock.calls[0][0]).toContain('allow_weekly_review');
    expect(query.mock.calls[0][1][11]).toBe(false);
  });

  it('revokes a selected record only within the owning account', async () => {
    const query = jest.fn().mockResolvedValue({ rows: [{ id: 'capture-1', allow_weekly_review: false }] });
    const service = new CapturesService({ pool: { query } } as never);
    await service.setWeeklyReviewPermission('user-1', 'capture-1', false);
    expect(query.mock.calls[0][0]).toContain('user_id = $2');
    expect(query.mock.calls[0][1]).toEqual(['capture-1', 'user-1', false]);
  });

  it('locks and upgrades an owned saved record only after an explicit analysis request', async () => {
    const saved = {
      id: 'capture-1', user_id: 'user-1', entry_type: 'quick_fragment', process_mode: 'save_only',
      modality: 'text', raw_text: '我感到压力', media_url: null, mood_label: null,
      mood_intensity: null, local_date: '2026-10-10', timezone: 'Asia/Shanghai',
    };
    const analyzed = { ...saved, process_mode: 'analyze' };
    const query = jest.fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [saved] })
      .mockResolvedValueOnce({ rows: [analyzed] })
      .mockResolvedValueOnce({ rows: [{ id: 'cue-1', capture_id: 'capture-1' }] })
      .mockResolvedValueOnce({ rows: [] });
    const release = jest.fn();
    const service = new CapturesService({ pool: { connect: jest.fn().mockResolvedValue({ query, release }) } } as never);

    const result = await service.analyze('user-1', 'capture-1');

    expect(query.mock.calls[1][0]).toContain('FOR UPDATE');
    expect(query.mock.calls[1][1]).toEqual(['capture-1', 'user-1']);
    expect(query.mock.calls[2][0]).toContain("SET process_mode = 'analyze'");
    expect(result.capture.process_mode).toBe('analyze');
    expect(result.interpretations).toHaveLength(1);
    expect(release).toHaveBeenCalled();
  });

  it('returns existing cues for a repeated analysis request without inserting duplicates', async () => {
    const analyzed = {
      id: 'capture-1', user_id: 'user-1', entry_type: 'quick_fragment', process_mode: 'analyze',
      modality: 'text', raw_text: '我感到压力', media_url: null, mood_label: null,
      mood_intensity: null, local_date: '2026-10-10', timezone: 'Asia/Shanghai',
    };
    const query = jest.fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [analyzed] })
      .mockResolvedValueOnce({ rows: [{ id: 'cue-1', capture_id: 'capture-1' }] })
      .mockResolvedValueOnce({ rows: [] });
    const service = new CapturesService({ pool: { connect: jest.fn().mockResolvedValue({ query, release: jest.fn() }) } } as never);

    const result = await service.analyze('user-1', 'capture-1');

    expect(result.interpretations).toEqual([{ id: 'cue-1', capture_id: 'capture-1' }]);
    expect(query.mock.calls.some(([sql]) => String(sql).includes('INSERT INTO capture_interpretations'))).toBe(false);
  });

  it('rejects an analysis request when the record is not owned by the requester', async () => {
    const query = jest.fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValue({ rows: [] });
    const service = new CapturesService({ pool: { connect: jest.fn().mockResolvedValue({ query, release: jest.fn() }) } } as never);

    await expect(service.analyze('user-1', 'someone-else-capture'))
      .rejects.toMatchObject({ response: { code: 'capture_not_found' } });
    expect(query.mock.calls[1][1]).toEqual(['someone-else-capture', 'user-1']);
  });

  it('rejects a saved record without text instead of creating a cue from nothing', async () => {
    const query = jest.fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: 'capture-1', user_id: 'user-1', raw_text: '   ' }] })
      .mockResolvedValue({ rows: [] });
    const service = new CapturesService({ pool: { connect: jest.fn().mockResolvedValue({ query, release: jest.fn() }) } } as never);

    await expect(service.analyze('user-1', 'capture-1'))
      .rejects.toMatchObject({ response: { code: 'capture_has_no_text_to_analyze' } });
    expect(query.mock.calls.some(([sql]) => String(sql).includes("SET process_mode = 'analyze'"))).toBe(false);
  });
});
