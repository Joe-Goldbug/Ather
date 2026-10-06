import type { QueryPool } from '../common/pool.js';

export class UserQueueAdmissionClosedError extends Error {
  constructor() {
    super('User queue admission is closed');
    this.name = 'UserQueueAdmissionClosedError';
  }
}

export async function withUserQueueAdmission<T>(
  pool: QueryPool,
  userId: string,
  action: () => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1::text, 0))', [userId]);
    const admitted = await client.query<{ id: string }>(
      `SELECT id FROM users
       WHERE id = $1 AND deletion_requested_at IS NULL
       FOR SHARE`,
      [userId],
    );
    if (!admitted.rows[0]) throw new UserQueueAdmissionClosedError();

    const result = await action();
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}
