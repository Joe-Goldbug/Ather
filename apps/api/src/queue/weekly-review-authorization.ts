import type { QueryPool } from '../common/pool.js';

type Skipped = {
  status: 'skipped';
  reason: 'weekly_review_permission_revoked' | 'record_permission_revoked';
};

async function currentPermission(
  pool: QueryPool,
  userId: string,
  captureIds: string[],
): Promise<Skipped | null> {
  const result = await pool.query<{ granted: boolean; eligible_count: string }>(
    `SELECT EXISTS (
       SELECT 1 FROM consent_grants
       WHERE user_id = $1 AND consent_type = 'weekly_review_analysis' AND granted = true
     ) AS granted,
     (SELECT COUNT(*)::text FROM captures
      WHERE user_id = $1 AND id = ANY($2::uuid[])
        AND process_mode <> 'save_only' AND allow_weekly_review = true) AS eligible_count`,
    [userId, captureIds],
  );
  if (!result.rows[0]?.granted) return { status: 'skipped', reason: 'weekly_review_permission_revoked' };
  if (captureIds.length === 0 || Number(result.rows[0].eligible_count) !== captureIds.length) {
    return { status: 'skipped', reason: 'record_permission_revoked' };
  }
  return null;
}

export async function runAuthorizedWeeklyReview(
  pool: QueryPool,
  userId: string,
  captureIds: string[],
  generate: () => Promise<string>,
): Promise<Skipped | { status: 'ready'; narrative: string }> {
  const before = await currentPermission(pool, userId, captureIds);
  if (before) return before;
  const narrative = await generate();
  const after = await currentPermission(pool, userId, captureIds);
  return after ?? { status: 'ready', narrative };
}
