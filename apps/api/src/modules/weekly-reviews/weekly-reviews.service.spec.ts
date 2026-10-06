import { WeeklyReviewsService } from './weekly-reviews.service.js';

describe('weekly review enqueue permissions', () => {
  it('does not enqueue without an explicit purpose grant', async () => {
    const query = jest.fn().mockResolvedValue({ rows: [] });
    const enqueueWeeklyReview = jest.fn();
    const service = new WeeklyReviewsService(
      { pool: { query } } as never,
      { enqueueWeeklyReview } as never,
    );
    await expect(service.triggerWeeklyReview('user-1')).rejects.toMatchObject({
      response: { code: 'weekly_review_not_authorized' },
    });
    expect(enqueueWeeklyReview).not.toHaveBeenCalled();
  });

  it('does not enqueue when no record was individually selected', async () => {
    const query = jest.fn()
      .mockResolvedValueOnce({ rows: [{ granted: true }] })
      .mockResolvedValueOnce({ rows: [{ count: '0' }] });
    const enqueueWeeklyReview = jest.fn();
    const service = new WeeklyReviewsService(
      { pool: { query } } as never,
      { enqueueWeeklyReview } as never,
    );
    await expect(service.triggerWeeklyReview('user-1')).rejects.toMatchObject({
      response: { code: 'no_authorized_weekly_entries' },
    });
    expect(query.mock.calls[1][0]).toContain("process_mode <> 'save_only'");
    expect(query.mock.calls[1][0]).toContain('allow_weekly_review = true');
    expect(enqueueWeeklyReview).not.toHaveBeenCalled();
  });
});
