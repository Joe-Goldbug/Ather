import type { QueryPool } from '../common/pool.js';

export const CHAT_RAW_RETENTION_DAYS = 90;

type CountRow = { count: number | string };

export async function pruneExpiredChatTurns(
  pool: QueryPool,
  now = new Date(),
): Promise<{ conversations: number; memories: number }> {
  const cutoff = now.getTime() - CHAT_RAW_RETENTION_DAYS * 24 * 60 * 60 * 1000;
  const conversations = await pool.query<CountRow>(
    `WITH updated AS (
       UPDATE conversations conversation
       SET turns = COALESCE((
         SELECT jsonb_agg(item.turn ORDER BY item.ordinality)
         FROM jsonb_array_elements(COALESCE(conversation.turns, '[]'::jsonb))
              WITH ORDINALITY AS item(turn, ordinality)
         WHERE jsonb_typeof(item.turn->'timestamp') IS DISTINCT FROM 'number'
            OR (item.turn->>'timestamp')::numeric >= $1
       ), '[]'::jsonb)
       WHERE EXISTS (
         SELECT 1
         FROM jsonb_array_elements(COALESCE(conversation.turns, '[]'::jsonb)) AS expired(turn)
         WHERE jsonb_typeof(expired.turn->'timestamp') = 'number'
           AND (expired.turn->>'timestamp')::numeric < $1
       )
       RETURNING 1
     ) SELECT COUNT(*)::int AS count FROM updated`,
    [cutoff],
  );
  const memories = await pool.query<CountRow>(
    `WITH updated AS (
       UPDATE users account
       SET memory_state = jsonb_set(account.memory_state, '{conversation_history}', COALESCE((
         SELECT jsonb_agg(item.turn ORDER BY item.ordinality)
         FROM jsonb_array_elements(account.memory_state->'conversation_history')
              WITH ORDINALITY AS item(turn, ordinality)
         WHERE jsonb_typeof(item.turn->'timestamp') IS DISTINCT FROM 'number'
            OR (item.turn->>'timestamp')::numeric >= $1
       ), '[]'::jsonb), true),
       updated_at = NOW()
       WHERE jsonb_typeof(account.memory_state->'conversation_history') = 'array'
         AND EXISTS (
           SELECT 1
           FROM jsonb_array_elements(account.memory_state->'conversation_history') AS expired(turn)
           WHERE jsonb_typeof(expired.turn->'timestamp') = 'number'
             AND (expired.turn->>'timestamp')::numeric < $1
         )
       RETURNING 1
     ) SELECT COUNT(*)::int AS count FROM updated`,
    [cutoff],
  );
  return {
    conversations: Number(conversations.rows[0]?.count ?? 0),
    memories: Number(memories.rows[0]?.count ?? 0),
  };
}
