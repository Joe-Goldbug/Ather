import { ProductFeedbackService } from './product-feedback.service.js';

describe('ProductFeedbackService', () => {
  it('writes feedback and its audit event in one transaction for the authenticated user', async () => {
    const query = jest.fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: 'feedback-1', status: 'new', severity: 'medium', created_at: new Date() }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });
    const release = jest.fn();
    const service = new ProductFeedbackService({
      pool: { connect: jest.fn().mockResolvedValue({ query, release }) },
    } as never);

    await service.submit('session-user', {
      category: '体验反馈',
      content: '希望能看到上一题的上下文。',
      sourcePage: '/theme-assessment',
    });

    expect(query).toHaveBeenCalledWith('BEGIN');
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO product_feedback'),
      expect.arrayContaining(['session-user', '体验反馈']),
    );
    expect(query).toHaveBeenCalledWith('COMMIT');
    expect(release).toHaveBeenCalledTimes(1);
  });
});
