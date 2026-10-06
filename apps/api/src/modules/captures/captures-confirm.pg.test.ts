import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { expect, test } from 'vitest';
import { CapturesService } from './captures.service.js';
import { ProfileService } from '../profile/profile.service.js';

test('confirming a keyword cue can be retried without creating a second evidence event', async ({ skip }) => {
  if (!process.env.EVA_TEST_DATABASE_URL || process.env.EVA_TEST_DATABASE_ISOLATED !== '1') skip();
  const pool = new Pool({ connectionString: process.env.EVA_TEST_DATABASE_URL! });
  const service = new CapturesService({ pool } as never);
  const userId = randomUUID();
  const captureId = randomUUID();
  const interpretationId = randomUUID();
  try {
    await pool.query('INSERT INTO users (id, email) VALUES ($1, $2)', [userId, `${userId}@example.invalid`]);
    await pool.query(
      `INSERT INTO captures (id, user_id, entry_type, process_mode, modality, raw_text)
       VALUES ($1, $2, 'quick_fragment', 'analyze', 'text', '测试关键词线索')`, [captureId, userId],
    );
    await pool.query(
      `INSERT INTO capture_interpretations
         (id, capture_id, user_id, dimension, ai_explanation, proposed_delta)
       VALUES ($1, $2, $3, 'stressResponse', '待核对线索', 2)`, [interpretationId, captureId, userId],
    );

    const first = await service.confirmInterpretation(userId, captureId, interpretationId, 'unknown');
    const retry = await service.confirmInterpretation(userId, captureId, interpretationId, 'unknown');
    expect(retry.evidenceId).toBe(first.evidenceId);
    expect(retry.interpretation.status).toBe('confirmed');
    await expect(service.confirmInterpretation(userId, captureId, interpretationId, 'self'))
      .rejects.toMatchObject({ response: { code: 'confirmation_attribution_changed' } });
    await expect(service.confirmInterpretation(userId, captureId, interpretationId, 'untrusted' as never))
      .rejects.toMatchObject({ response: { code: 'invalid_attribution' } });
    const evidence = await pool.query<{ count: string }>(
      "SELECT COUNT(*) AS count FROM evidence_events WHERE user_id = $1 AND source_type = 'capture' AND source_id = $2",
      [userId, captureId],
    );
    expect(evidence.rows[0].count).toBe('1');
  } finally {
    await pool.query('DELETE FROM capture_interpretations WHERE id = $1', [interpretationId]);
    await pool.query("DELETE FROM evidence_events WHERE user_id = $1 AND source_type = 'capture' AND source_id = $2", [userId, captureId]);
    await pool.query('DELETE FROM users WHERE id = $1', [userId]);
    await pool.end();
  }
});

test('refuting a pending or confirmed cue is repeatable and withdraws linked candidate evidence', async ({ skip }) => {
  if (!process.env.EVA_TEST_DATABASE_URL || process.env.EVA_TEST_DATABASE_ISOLATED !== '1') skip();
  const pool = new Pool({ connectionString: process.env.EVA_TEST_DATABASE_URL! });
  const service = new CapturesService({ pool } as never);
  const userId = randomUUID();
  const otherUserId = randomUUID();
  const captureId = randomUUID();
  const pendingId = randomUUID();
  const confirmedId = randomUUID();
  try {
    await pool.query('INSERT INTO users (id, email) VALUES ($1, $2), ($3, $4)',
      [userId, `${userId}@example.invalid`, otherUserId, `${otherUserId}@example.invalid`]);
    await pool.query(
      `INSERT INTO captures (id, user_id, entry_type, process_mode, modality, raw_text)
       VALUES ($1, $2, 'quick_fragment', 'analyze', 'text', '测试线索反驳')`, [captureId, userId],
    );
    await pool.query(
      `INSERT INTO capture_interpretations
         (id, capture_id, user_id, dimension, ai_explanation, proposed_delta)
       VALUES ($1, $3, $4, 'stressResponse', '待核对线索', 2),
              ($2, $3, $4, 'agency', '另一个待核对线索', 1)`, [pendingId, confirmedId, captureId, userId],
    );

    const pending = await service.refuteInterpretation(userId, captureId, pendingId);
    expect(pending.interpretation.status).toBe('refuted');
    expect(pending.evidenceId).toBeNull();
    expect((await service.refuteInterpretation(userId, captureId, pendingId)).alreadyRefuted).toBe(true);
    await expect(service.confirmInterpretation(userId, captureId, pendingId))
      .rejects.toMatchObject({ response: { code: 'interpretation_not_pending' } });

    const confirmed = await service.confirmInterpretation(userId, captureId, confirmedId);
    await expect(service.refuteInterpretation(otherUserId, captureId, confirmedId))
      .rejects.toMatchObject({ response: { code: 'interpretation_not_found' } });
    const refuted = await service.refuteInterpretation(userId, captureId, confirmedId);
    expect(refuted.evidenceId).toBe(confirmed.evidenceId);
    expect((await service.refuteInterpretation(userId, captureId, confirmedId)).alreadyRefuted).toBe(true);
    const evidence = await pool.query<{ portrait_status: string; candidate: boolean }>(
      'SELECT portrait_status, candidate FROM evidence_events WHERE id = $1', [confirmed.evidenceId],
    );
    expect(evidence.rows[0]).toMatchObject({ portrait_status: 'withdrawn', candidate: true });
  } finally {
    await pool.query('DELETE FROM users WHERE id = ANY($1::uuid[])', [[userId, otherUserId]]);
    await pool.end();
  }
});

test('withdrawing capture evidence through profile also refutes its cue', async ({ skip }) => {
  if (!process.env.EVA_TEST_DATABASE_URL || process.env.EVA_TEST_DATABASE_ISOLATED !== '1') skip();
  const pool = new Pool({ connectionString: process.env.EVA_TEST_DATABASE_URL! });
  const captures = new CapturesService({ pool } as never);
  const profile = new ProfileService({ pool } as never, {
    recomputeDimension: async () => null,
  } as never);
  const userId = randomUUID();
  const captureId = randomUUID();
  const interpretationId = randomUUID();
  try {
    await pool.query('INSERT INTO users (id, email) VALUES ($1, $2)', [userId, `${userId}@example.invalid`]);
    await pool.query(
      `INSERT INTO captures (id, user_id, entry_type, process_mode, modality, raw_text)
       VALUES ($1, $2, 'quick_fragment', 'analyze', 'text', '测试画像入口撤回')`, [captureId, userId],
    );
    await pool.query(
      `INSERT INTO capture_interpretations
         (id, capture_id, user_id, dimension, ai_explanation, proposed_delta)
       VALUES ($1, $2, $3, 'agency', '待核对线索', 1)`, [interpretationId, captureId, userId],
    );
    const confirmed = await captures.confirmInterpretation(userId, captureId, interpretationId);
    await profile.withdrawEvidence(userId, confirmed.evidenceId);
    const interpretation = await pool.query<{ status: string }>(
      'SELECT status FROM capture_interpretations WHERE id = $1', [interpretationId],
    );
    expect(interpretation.rows[0].status).toBe('refuted');
    await expect(captures.confirmInterpretation(userId, captureId, interpretationId))
      .rejects.toMatchObject({ response: { code: 'interpretation_not_pending' } });
    await pool.query("UPDATE capture_interpretations SET status = 'confirmed' WHERE id = $1", [interpretationId]);
    const retry = await profile.withdrawEvidence(userId, confirmed.evidenceId);
    expect(retry.already_withdrawn).toBe(true);
    expect((await pool.query<{ status: string }>(
      'SELECT status FROM capture_interpretations WHERE id = $1', [interpretationId],
    )).rows[0].status).toBe('refuted');
  } finally {
    await pool.query('DELETE FROM users WHERE id = $1', [userId]);
    await pool.end();
  }
});
