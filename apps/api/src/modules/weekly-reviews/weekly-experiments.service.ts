import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Database } from '../../common/database.js';

const CHECK_IN_OUTCOMES = ['done', 'partly_done', 'no_opportunity', 'paused'] as const;

export type WeeklyExperimentOutcome = typeof CHECK_IN_OUTCOMES[number];

export interface WeeklyExperimentCheckInCommand {
  outcome: WeeklyExperimentOutcome;
  note?: string | null;
}

interface SuggestedExperiment {
  action_text: string;
  trigger_context: string;
}

function getSuggestedExperiment(content: unknown): SuggestedExperiment | null {
  if (!content || typeof content !== 'object' || Array.isArray(content)) return null;
  const suggestion = (content as { suggested_experiment?: unknown }).suggested_experiment;
  if (!suggestion || typeof suggestion !== 'object' || Array.isArray(suggestion)) return null;

  const { action_text: actionText, trigger_context: triggerContext } = suggestion as Record<string, unknown>;
  if (typeof actionText !== 'string' || typeof triggerContext !== 'string') return null;
  const action_text = actionText.trim();
  const trigger_context = triggerContext.trim();
  if (!action_text || !trigger_context) return null;
  return { action_text, trigger_context };
}

function normalizeNote(note: unknown): string | null {
  if (note === undefined || note === null) return null;
  if (typeof note !== 'string') {
    throw new BadRequestException({ code: 'invalid_weekly_experiment_note' });
  }
  const normalized = note.trim();
  if (normalized.length > 2000) {
    throw new BadRequestException({ code: 'weekly_experiment_note_too_long' });
  }
  return normalized || null;
}

@Injectable()
export class WeeklyExperimentsService {
  constructor(private readonly db: Database) {}

  async create(userId: string, weeklyReviewId: string) {
    const reviewResult = await this.db.pool.query<{ id: string; content: unknown }>(
      `SELECT id, content
       FROM weekly_reviews
       WHERE id = $1 AND user_id = $2`,
      [weeklyReviewId, userId],
    );
    const review = reviewResult.rows[0];
    if (!review) {
      throw new NotFoundException({ code: 'weekly_review_not_found' });
    }

    const suggestion = getSuggestedExperiment(review.content);
    if (!suggestion) {
      throw new BadRequestException({ code: 'weekly_review_has_no_suggested_experiment' });
    }

    const inserted = await this.db.pool.query(
      `INSERT INTO weekly_experiments (
         user_id, weekly_review_id, action_text, trigger_context, review_on, state
       )
       VALUES ($1, $2, $3, $4, CURRENT_DATE + 7, 'active')
       ON CONFLICT (user_id, weekly_review_id) DO NOTHING
       RETURNING id, user_id, weekly_review_id, action_text, trigger_context,
                 review_on, state, created_at, updated_at`,
      [userId, weeklyReviewId, suggestion.action_text, suggestion.trigger_context],
    );
    if (inserted.rows[0]) {
      return { experiment: inserted.rows[0], created: true };
    }

    const existing = await this.db.pool.query(
      `SELECT id, user_id, weekly_review_id, action_text, trigger_context,
              review_on, state, created_at, updated_at
       FROM weekly_experiments
       WHERE user_id = $1 AND weekly_review_id = $2`,
      [userId, weeklyReviewId],
    );
    return { experiment: existing.rows[0], created: false };
  }

  async checkIn(userId: string, experimentId: string, command: WeeklyExperimentCheckInCommand) {
    if (!CHECK_IN_OUTCOMES.includes(command?.outcome)) {
      throw new BadRequestException({ code: 'invalid_weekly_experiment_outcome' });
    }
    const note = normalizeNote(command.note);
    const client = await this.db.pool.connect();
    let committed = false;
    try {
      await client.query('BEGIN');
      const experimentResult = await client.query<{ id: string; state: string }>(
        `SELECT id, state
         FROM weekly_experiments
         WHERE id = $1 AND user_id = $2
         FOR UPDATE`,
        [experimentId, userId],
      );
      const experiment = experimentResult.rows[0];
      if (!experiment) {
        throw new NotFoundException({ code: 'weekly_experiment_not_found' });
      }
      if (experiment.state === 'completed') {
        throw new BadRequestException({ code: 'weekly_experiment_already_completed' });
      }

      const checkinResult = await client.query(
        `INSERT INTO weekly_experiment_checkins (experiment_id, user_id, outcome, note)
         VALUES ($1, $2, $3, $4)
         RETURNING id, outcome, note, created_at`,
        [experimentId, userId, command.outcome, note],
      );
      const nextState = command.outcome === 'done'
        ? 'completed'
        : command.outcome === 'paused'
          ? 'paused'
          : 'active';
      const updatedResult = await client.query(
        `UPDATE weekly_experiments
         SET state = $3, updated_at = NOW()
         WHERE id = $1 AND user_id = $2
         RETURNING id, user_id, weekly_review_id, action_text, trigger_context,
                   review_on, state, created_at, updated_at`,
        [experimentId, userId, nextState],
      );
      await client.query('COMMIT');
      committed = true;
      return { experiment: updatedResult.rows[0], checkin: checkinResult.rows[0] };
    } catch (error) {
      if (!committed) await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }
}
