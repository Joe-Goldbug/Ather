import { expect, test } from 'bun:test';
import { assertLocalDatabaseUrl, verifyThemeAssessmentPersistence } from './smoke-theme-db-verification.js';

test('accepts only local PostgreSQL connections for direct smoke verification', () => {
  expect(assertLocalDatabaseUrl('postgresql://user:pass@127.0.0.1:5432/eva')).toBe(
    'postgresql://user:pass@127.0.0.1:5432/eva',
  );
  expect(() => assertLocalDatabaseUrl('postgresql://user:pass@db.example.com:5432/eva')).toThrow(
    'local database',
  );
});

test('proves that a completed theme round persisted its answers, result, and feedback', async () => {
  const calls: Array<{ text: string; params?: unknown[] }> = [];
  const query = async (text: string, params?: unknown[]) => {
    calls.push({ text, params });
    if (text.includes('FROM theme_assessment_rounds')) {
      return { rows: [{ id: 'round-1', status: 'completed' }] };
    }
    if (text.includes('COUNT(*)')) return { rows: [{ count: '6' }] };
    if (text.includes('FROM theme_assessment_result_revisions')) {
      return { rows: [{ id: 'result-1' }] };
    }
    return { rows: [{ id: 'feedback-1', action: 'clarify' }] };
  };

  await expect(verifyThemeAssessmentPersistence({ query }, {
    userId: 'user-1',
    roundId: 'round-1',
    answerCount: 6,
    resultRevisionId: 'result-1',
    feedbackResponseId: 'feedback-1',
    feedbackAction: 'clarify',
  })).resolves.toBeUndefined();

  expect(calls).toHaveLength(4);
  expect(calls[0].params).toEqual(['round-1', 'user-1']);
  expect(calls[3].params).toEqual(['feedback-1', 'result-1', 'user-1', 'clarify']);
});
