type Queryable = {
  query<T = Record<string, unknown>>(text: string, params?: unknown[]): Promise<{ rows: T[] }>;
};

export type ThemeAssessmentPersistenceProof = {
  userId: string;
  roundId: string;
  answerCount: number;
  resultRevisionId: string;
  feedbackResponseId: string;
  feedbackAction: string;
};

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`theme DB verification failed: ${message}`);
}

export function assertLocalDatabaseUrl(databaseUrl: string): string {
  let url: URL;
  try {
    url = new URL(databaseUrl);
  } catch {
    throw new Error('theme DB verification requires a local database URL');
  }

  const host = url.hostname.replace(/^\[|\]$/g, '');
  assert(
    ['localhost', '127.0.0.1', '::1'].includes(host),
    'direct verification is limited to a local database',
  );
  return databaseUrl;
}

export async function verifyThemeAssessmentPersistence(
  db: Queryable,
  proof: ThemeAssessmentPersistenceProof,
): Promise<void> {
  const round = await db.query<{ id: string; status: string }>(
    `SELECT id, status FROM theme_assessment_rounds WHERE id = $1 AND user_id = $2`,
    [proof.roundId, proof.userId],
  );
  assert(round.rows[0]?.status === 'completed', 'completed round is missing or belongs to another user');

  const answers = await db.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count
     FROM theme_assessment_round_answers
     WHERE round_id = $1 AND user_id = $2 AND invalidated_at IS NULL`,
    [proof.roundId, proof.userId],
  );
  assert(Number(answers.rows[0]?.count) === proof.answerCount, 'active answer count does not match the API result');

  const revision = await db.query<{ id: string }>(
    `SELECT id FROM theme_assessment_result_revisions
     WHERE id = $1 AND round_id = $2 AND invalidated_at IS NULL`,
    [proof.resultRevisionId, proof.roundId],
  );
  assert(revision.rows[0]?.id === proof.resultRevisionId, 'published result revision is missing');

  const feedback = await db.query<{ id: string; action: string }>(
    `SELECT id, action FROM theme_assessment_result_responses
     WHERE id = $1 AND result_revision_id = $2 AND user_id = $3 AND action = $4`,
    [proof.feedbackResponseId, proof.resultRevisionId, proof.userId, proof.feedbackAction],
  );
  assert(feedback.rows[0]?.id === proof.feedbackResponseId, 'feedback response is missing or mismatched');
}
