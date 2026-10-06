import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const migrationsDir = dirname(fileURLToPath(import.meta.url));
const filename = '2026-09-18-weekly-experiments.sql';
const path = resolve(migrationsDir, filename);

describe('weekly experiments migration', () => {
  it('adds user-owned voluntary experiments and append-only check-ins', () => {
    expect(existsSync(path)).toBe(true);
    const sql = readFileSync(path, 'utf8');

    expect(sql).toMatch(/CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS\s+weekly_experiments/i);
    expect(sql).toMatch(/CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS\s+weekly_experiment_checkins/i);
    expect(sql).toMatch(/weekly_review_id\s+UUID\s+NOT\s+NULL\s+REFERENCES\s+weekly_reviews/i);
    expect(sql).toMatch(/'active',\s*'completed',\s*'paused'/i);
    expect(sql).toMatch(/'done',\s*'partly_done',\s*'no_opportunity',\s*'paused'/i);
  });

  it('enforces user ownership with indexes and RLS', () => {
    const sql = readFileSync(path, 'utf8');

    expect(sql).toMatch(/UNIQUE\s*\(\s*user_id\s*,\s*weekly_review_id\s*\)/i);
    expect(sql).toMatch(/idx_weekly_experiments_user_state/i);
    expect(sql).toMatch(/idx_weekly_experiment_checkins_experiment_created/i);
    expect(sql).toMatch(/ALTER\s+TABLE\s+weekly_experiments\s+ENABLE\s+ROW\s+LEVEL\s+SECURITY/i);
    expect(sql).toMatch(/ALTER\s+TABLE\s+weekly_experiment_checkins\s+ENABLE\s+ROW\s+LEVEL\s+SECURITY/i);
    expect(sql).toMatch(/CREATE\s+POLICY\s+weekly_experiments_self/i);
    expect(sql).toMatch(/CREATE\s+POLICY\s+weekly_experiment_checkins_self/i);
    expect(sql).toContain("current_setting('app.session_token', true)");
  });

  it('does not create an experiment merely because a review suggests one', () => {
    const sql = readFileSync(path, 'utf8');
    expect(sql).not.toMatch(/INSERT\s+INTO\s+weekly_experiments/i);
  });
});
