import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { expect, test } from 'vitest';
import { pruneExpiredChatTurns } from './chat-retention.js';

test('90-day retention prunes chat raw turns but preserves diary memory', async ({ skip }) => {
  if (!process.env.EVA_TEST_DATABASE_URL || process.env.EVA_TEST_DATABASE_ISOLATED !== '1') skip();
  const pool = new Pool({ connectionString: process.env.EVA_TEST_DATABASE_URL });
  const userId = randomUUID();
  const conversationId = randomUUID();
  const oldTurn = { id: 'old', role: 'user', content: 'expired raw chat', timestamp: Date.parse('2026-06-01T00:00:00Z') };
  const recentTurn = { id: 'recent', role: 'eva', content: 'recent raw chat', timestamp: Date.parse('2026-09-01T00:00:00Z') };
  const unknownAgeTurn = { id: 'unknown-age', role: 'user', content: 'legacy turn without timestamp' };
  const memory = {
    conversation_history: [oldTurn, unknownAgeTurn, recentTurn],
    diary_entries: [{ date: '2026-06-01', raw_user_messages: ['preserved diary text'] }],
  };
  try {
    await pool.query(
      'INSERT INTO users (id, email, memory_state) VALUES ($1, $2, $3::jsonb)',
      [userId, `${userId}@example.invalid`, JSON.stringify(memory)],
    );
    await pool.query(
      'INSERT INTO conversations (id, user_id, turns) VALUES ($1, $2, $3::jsonb)',
      [conversationId, userId, JSON.stringify([oldTurn, unknownAgeTurn, recentTurn])],
    );

    await expect(pruneExpiredChatTurns(pool as never, new Date('2026-09-26T00:00:00Z')))
      .resolves.toEqual({ conversations: 1, memories: 1 });

    const conversation = await pool.query<{ turns: Array<{ id: string }> }>(
      'SELECT turns FROM conversations WHERE id = $1', [conversationId],
    );
    const account = await pool.query<{ memory_state: typeof memory }>(
      'SELECT memory_state FROM users WHERE id = $1', [userId],
    );
    expect(conversation.rows[0].turns.map((turn) => turn.id)).toEqual(['unknown-age', 'recent']);
    expect(account.rows[0].memory_state.conversation_history.map((turn) => turn.id)).toEqual(['unknown-age', 'recent']);
    expect(account.rows[0].memory_state.diary_entries).toEqual(memory.diary_entries);
  } finally {
    await pool.query('DELETE FROM users WHERE id = $1', [userId]);
    await pool.end();
  }
});
