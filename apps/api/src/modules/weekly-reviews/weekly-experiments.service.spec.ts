import { BadRequestException, NotFoundException } from '@nestjs/common';
import { WeeklyExperimentsService } from './weekly-experiments.service.js';

describe('WeeklyExperimentsService', () => {
  const userId = 'user-1';
  const reviewId = 'review-1';
  const experiment = {
    id: 'experiment-1',
    user_id: userId,
    weekly_review_id: reviewId,
    action_text: '在一次紧张对话前先停十秒。',
    trigger_context: '当你发现自己想立刻回应时。',
    review_on: '2026-09-25',
    state: 'active',
    created_at: '2026-09-18T00:00:00.000Z',
    updated_at: '2026-09-18T00:00:00.000Z',
  };

  it('does not create an experiment when the persisted review has no suggestion', async () => {
    const query = jest.fn().mockResolvedValue({ rows: [{ id: reviewId, content: {} }] });
    const service = new WeeklyExperimentsService({ pool: { query } } as never);

    await expect(service.create(userId, reviewId)).rejects.toBeInstanceOf(BadRequestException);
    expect(query).toHaveBeenCalledTimes(1);
  });

  it('requires the weekly review to belong to the requesting user', async () => {
    const query = jest.fn().mockResolvedValue({ rows: [] });
    const service = new WeeklyExperimentsService({ pool: { query } } as never);

    await expect(service.create(userId, reviewId)).rejects.toBeInstanceOf(NotFoundException);
    expect(query).toHaveBeenCalledWith(expect.stringContaining('WHERE id = $1 AND user_id = $2'), [reviewId, userId]);
  });

  it('creates only after an explicit user command and copies the persisted suggestion', async () => {
    const query = jest.fn()
      .mockResolvedValueOnce({
        rows: [{
          id: reviewId,
          content: {
            suggested_experiment: {
              action_text: experiment.action_text,
              trigger_context: experiment.trigger_context,
            },
          },
        }],
      })
      .mockResolvedValueOnce({ rows: [experiment] });
    const service = new WeeklyExperimentsService({ pool: { query } } as never);

    await expect(service.create(userId, reviewId)).resolves.toMatchObject({
      experiment,
      created: true,
    });
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO weekly_experiments'),
      [userId, reviewId, experiment.action_text, experiment.trigger_context],
    );
    expect(query.mock.calls.flat().join(' ')).not.toContain('evidence_events');
  });

  it.each(['done', 'partly_done', 'no_opportunity', 'paused'] as const)(
    'accepts the %s check-in without writing evidence',
    async (outcome) => {
      const clientQuery = jest.fn(async (sql: string) => {
        if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') return { rows: [] };
        if (sql.includes('FROM weekly_experiments')) return { rows: [experiment] };
        if (sql.includes('INSERT INTO weekly_experiment_checkins')) {
          return { rows: [{ id: 'checkin-1', outcome, note: null, created_at: '2026-09-18T00:00:00.000Z' }] };
        }
        if (sql.includes('UPDATE weekly_experiments')) {
          return { rows: [{ ...experiment, state: outcome === 'done' ? 'completed' : outcome === 'paused' ? 'paused' : 'active' }] };
        }
        throw new Error(`unexpected SQL: ${sql}`);
      });
      const client = { query: clientQuery, release: jest.fn() };
      const service = new WeeklyExperimentsService({
        pool: { connect: jest.fn().mockResolvedValue(client) },
      } as never);

      await expect(service.checkIn(userId, experiment.id, { outcome, note: null })).resolves.toMatchObject({
        checkin: { outcome },
      });
      expect(clientQuery.mock.calls.flat().join(' ')).not.toContain('evidence_events');
      expect(client.release).toHaveBeenCalledTimes(1);
    },
  );

  it('rejects unknown check-in outcomes before accessing the database', async () => {
    const connect = jest.fn();
    const service = new WeeklyExperimentsService({ pool: { connect } } as never);

    await expect(
      service.checkIn(userId, experiment.id, { outcome: 'failed' as never, note: null }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(connect).not.toHaveBeenCalled();
  });
});
