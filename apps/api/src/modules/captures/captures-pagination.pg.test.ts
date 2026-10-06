import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { expect, test } from 'vitest';
import { CapturesService } from './captures.service.js';
import { DiaryService } from '../diary/diary.service.js';

test('record pages cover older rows without overlap or another user data', async ({ skip }) => {
  if (!process.env.EVA_TEST_DATABASE_URL || process.env.EVA_TEST_DATABASE_ISOLATED !== '1') skip();
  const pool = new Pool({ connectionString: process.env.EVA_TEST_DATABASE_URL! });
  const captures = new CapturesService({ pool } as never);
  const diary = new DiaryService({ pool } as never);
  const userId = randomUUID();
  const otherUserId = randomUUID();
  const captureIds = [randomUUID(), randomUUID(), randomUUID()];
  const diaryIds = [randomUUID(), randomUUID(), randomUUID()];
  try {
    await pool.query('INSERT INTO users (id, email) VALUES ($1, $2), ($3, $4)',
      [userId, `${userId}@example.invalid`, otherUserId, `${otherUserId}@example.invalid`]);
    for (const id of captureIds) {
      await pool.query(
        `INSERT INTO captures (id, user_id, entry_type, process_mode, modality, raw_text, captured_at)
         VALUES ($1, $2, 'quick_fragment', 'save_only', 'text', 'saved', '2026-09-26T00:00:00Z')`,
        [id, userId],
      );
    }
    await pool.query(
      `INSERT INTO captures (user_id, entry_type, process_mode, modality, raw_text, captured_at)
       VALUES ($1, 'quick_fragment', 'save_only', 'text', 'other', '2026-09-26T00:00:00Z')`,
      [otherUserId],
    );
    for (let index = 0; index < diaryIds.length; index += 1) {
      await pool.query(
        `INSERT INTO diary_entries (id, user_id, entry_date, content)
         VALUES ($1, $2, $3, $4::jsonb)`,
        [diaryIds[index], userId, `2026-09-${25 - index}`, JSON.stringify({ detail: `entry ${index}` })],
      );
    }
    await pool.query(
      `INSERT INTO diary_entries (user_id, entry_date, content)
       VALUES ($1, '2026-09-25', '{"detail":"other"}'::jsonb)`, [otherUserId],
    );

    const firstCaptures = await captures.list(userId, 2, 0);
    const nextCaptures = await captures.list(userId, 2, 2);
    expect([...firstCaptures, ...nextCaptures].map((row) => row.id))
      .toEqual([...captureIds].sort().reverse());
    const firstDiary = await diary.getRecentDiaries(userId, 2, 0);
    const nextDiary = await diary.getRecentDiaries(userId, 2, 2);
    expect([...firstDiary, ...nextDiary].map((row) => row.id)).toEqual(diaryIds);
    expect(nextDiary[0].content).toEqual({ detail: 'entry 2' });
  } finally {
    await pool.query('DELETE FROM users WHERE id = ANY($1::uuid[])', [[userId, otherUserId]]);
    await pool.end();
  }
});
