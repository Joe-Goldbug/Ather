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
});
