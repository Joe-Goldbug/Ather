import type { QueryPool } from '../common/pool.js';

type CountRow = { count: number | string };

/** Unsaved conversations are temporary by default; saved records remain until the user deletes them. */
export async function pruneExpiredUnderstandingSessions(pool: QueryPool): Promise<{ sessions: number }> {
  const result = await pool.query<CountRow>(
    `WITH removed AS (
       DELETE FROM understanding_sessions
        WHERE expires_at < NOW() AND saved_at IS NULL
       RETURNING id
     ) SELECT COUNT(*)::int AS count FROM removed`,
  );
  return { sessions: Number(result.rows[0]?.count ?? 0) };
}
