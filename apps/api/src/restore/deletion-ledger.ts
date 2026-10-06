import type { Pool, PoolClient } from 'pg';

type DatabaseIdentity = {
  database_name: string;
  server_address: string;
  server_port: number;
};

type Tombstone = {
  user_id: string;
  deleted_at: Date | string;
};

export type DeletionLedgerReplayResult = {
  mode: 'dry_run' | 'apply';
  tombstones: number;
  matched_users: number;
  promotion_safe: boolean;
};

type SourcePool = Pick<Pool, 'query'>;
type TargetPool = Pick<Pool, 'query' | 'connect'>;

const IDENTITY_QUERY = `SELECT
  current_database() AS database_name,
  COALESCE(inet_server_addr()::text, 'local') AS server_address,
  inet_server_port() AS server_port`;

function sameDatabase(source: DatabaseIdentity, target: DatabaseIdentity): boolean {
  return source.database_name === target.database_name
    && source.server_address === target.server_address
    && source.server_port === target.server_port;
}

async function countMatches(queryable: Pick<PoolClient, 'query'>, userIds: string[]): Promise<number> {
  if (userIds.length === 0) return 0;
  const result = await queryable.query<{ matched_users: number }>(
    `SELECT COUNT(*)::int AS matched_users
     FROM users
     WHERE id = ANY($1::uuid[])`,
    [userIds],
  );
  return Number(result.rows[0]?.matched_users ?? 0);
}

export async function replayDeletionLedger(
  source: SourcePool,
  target: TargetPool,
  apply: boolean,
): Promise<DeletionLedgerReplayResult> {
  const [sourceIdentity, targetIdentity] = await Promise.all([
    source.query<DatabaseIdentity>(IDENTITY_QUERY),
    target.query<DatabaseIdentity>(IDENTITY_QUERY),
  ]);
  if (sameDatabase(sourceIdentity.rows[0], targetIdentity.rows[0])) {
    throw new Error('Source and restore target must be different databases');
  }

  const tombstones = (await source.query<Tombstone>(
    'SELECT user_id, deleted_at FROM account_deletion_tombstones ORDER BY deleted_at, user_id',
  )).rows;
  const userIds = tombstones.map((row) => row.user_id);

  if (!apply) {
    const matchedUsers = await countMatches(target as never, userIds);
    return {
      mode: 'dry_run',
      tombstones: tombstones.length,
      matched_users: matchedUsers,
      promotion_safe: matchedUsers === 0,
    };
  }

  const client = await target.connect();
  try {
    await client.query('BEGIN');
    if (tombstones.length > 0) {
      await client.query(
        `INSERT INTO account_deletion_tombstones (user_id, deleted_at)
         SELECT * FROM UNNEST($1::uuid[], $2::timestamptz[])
         ON CONFLICT (user_id) DO UPDATE
         SET deleted_at = LEAST(account_deletion_tombstones.deleted_at, EXCLUDED.deleted_at)`,
        [userIds, tombstones.map((row) => row.deleted_at)],
      );
      await client.query(
        `UPDATE users
         SET deletion_requested_at = COALESCE(users.deletion_requested_at, tombstone.deleted_at)
         FROM account_deletion_tombstones tombstone
         WHERE users.id = tombstone.user_id`,
      );
      await client.query(
        `UPDATE session_tokens
         SET revoked = true
         WHERE user_id IN (SELECT user_id FROM account_deletion_tombstones)`,
      );
    }
    const matchedUsers = await countMatches(client, userIds);
    await client.query('COMMIT');
    return {
      mode: 'apply',
      tombstones: tombstones.length,
      matched_users: matchedUsers,
      promotion_safe: matchedUsers === 0,
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
