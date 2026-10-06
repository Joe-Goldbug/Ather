import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { expect, test } from 'vitest';
import { ThemeAssessmentService } from './theme-assessment.service.js';
import { selectThemeRoundCore } from '@eva/core';

const url = process.env.EVA_TEST_DATABASE_URL;
const isolated = process.env.EVA_TEST_DATABASE_ISOLATED === '1';

test('history projects the latest whole-result response without treating a single-observation refute as a whole-result refute', async ({ skip }) => {
  if (!url || !isolated) skip();
  const pool = new Pool({ connectionString: url! });
  const userId = randomUUID();
  const roundId = randomUUID();
  const resultId = randomUUID();
  const service = new ThemeAssessmentService({ pool } as never, {} as never);
  try {
    await pool.query('INSERT INTO users (id, email) VALUES ($1, $2)', [userId, `theme-history-${userId}@example.invalid`]);
    await pool.query(
      `INSERT INTO theme_assessment_rounds (id, user_id, theme_lens, status, question_bank_version)
       VALUES ($1, $2, 'emotion', 'completed', 'test')`,
      [roundId, userId],
    );
    await pool.query(
      `INSERT INTO theme_assessment_result_revisions (id, round_id, revision_number, result)
       VALUES ($1, $2, 1, $3::jsonb)`,
      [resultId, roundId, JSON.stringify({ headline: 'Original observation', boundary: 'One round only' })],
    );
    const respond = (action: 'confirm' | 'refute', target: string | null) => pool.query(
      `INSERT INTO theme_assessment_result_responses
         (result_revision_id, user_id, operation_id, action, evidence_question_id)
       VALUES ($1, $2, $3, $4, $5)`,
      [resultId, userId, randomUUID(), action, target],
    );

    await respond('refute', 'question-one');
    expect((await service.list(userId))[0]).toMatchObject({
      feedback_state: 'needs_follow_up', whole_result_refuted: false,
    });

    await respond('refute', null);
    expect((await service.list(userId))[0]).toMatchObject({
      feedback_state: 'needs_follow_up', whole_result_refuted: true,
    });

    await respond('confirm', null);
    expect((await service.list(userId))[0]).toMatchObject({
      feedback_state: 'needs_follow_up', whole_result_refuted: false,
    });
  } finally {
    await pool.query('DELETE FROM users WHERE id = $1', [userId]);
    await pool.end();
  }
});

test('a real new round starts with a different context for the latest refuted observation', async ({ skip }) => {
  if (!url || !isolated) skip();
  const pool = new Pool({ connectionString: url! });
  const userId = randomUUID();
  const roundId = randomUUID();
  const resultId = randomUUID();
  const disputed = selectThemeRoundCore('emotion', 0)[2]!;
  const service = new ThemeAssessmentService({ pool } as never, {} as never);
  try {
    await pool.query('INSERT INTO users (id, email) VALUES ($1, $2)', [userId, `theme-followup-${userId}@example.invalid`]);
    await pool.query(
      `INSERT INTO theme_assessment_rounds
         (id, user_id, theme_lens, status, question_bank_version, completed_at)
       VALUES ($1, $2, 'emotion', 'completed', 'test', NOW())`,
      [roundId, userId],
    );
    await pool.query(
      `INSERT INTO theme_assessment_result_revisions (id, round_id, revision_number, result)
       VALUES ($1, $2, 1, '{}'::jsonb)`,
      [resultId, roundId],
    );
    await pool.query(
      `INSERT INTO theme_assessment_result_responses
         (result_revision_id, user_id, operation_id, action, evidence_question_id)
       VALUES ($1, $2, $3, 'refute', $4)`,
      [resultId, userId, randomUUID(), disputed.question_id],
    );

    const started = await service.start(userId, { theme: 'emotion' });
    expect(started.next.state).toBe('question');
    if (started.next.state !== 'question') throw new Error('expected first question');
    expect(started.next.question.focus_key).toBe(disputed.focus_key);
    expect(started.next.question.context).not.toBe(disputed.context);

    await pool.query(
      `INSERT INTO theme_assessment_result_responses
         (result_revision_id, user_id, operation_id, action, evidence_question_id)
       VALUES ($1, $2, $3, 'confirm', $4)`,
      [resultId, userId, randomUUID(), disputed.question_id],
    );
    const confirmed = await service.start(userId, { theme: 'emotion' });
    expect(confirmed.next.state).toBe('question');
    if (confirmed.next.state !== 'question') throw new Error('expected first question');
    expect(confirmed.next.question.question_id).toBe(selectThemeRoundCore('emotion', 2)[0]?.question_id);
  } finally {
    await pool.query('DELETE FROM users WHERE id = $1', [userId]);
    await pool.end();
  }
});
