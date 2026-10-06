import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const sql = readFileSync(new URL('./2026-09-26-captures-weekly-review-consent.sql', import.meta.url), 'utf8');

describe('weekly review consent migration', () => {
  it('adds per-capture opt-in, default false, without rewriting old records', () => {
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS allow_weekly_review BOOLEAN NOT NULL DEFAULT false/i);
    expect(sql).not.toMatch(/UPDATE\s+captures/i);
  });

  it('removes unsupported stable mood default without altering existing values', () => {
    expect(sql).toMatch(/ALTER TABLE weekly_reviews ALTER COLUMN mood_trend DROP DEFAULT/i);
    expect(sql).not.toMatch(/UPDATE\s+weekly_reviews/i);
  });
});
