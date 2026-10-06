import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const migrationsDir = dirname(fileURLToPath(import.meta.url));
const path = resolve(migrationsDir, '2026-07-30-theme-assessment-rounds.sql');

describe('theme assessment round migration', () => {
  it('stores Track A rounds separately from formal portraits', () => {
    expect(existsSync(path)).toBe(true);
    const sql = readFileSync(path, 'utf8');
    for (const table of [
      'theme_assessment_rounds',
      'theme_assessment_round_items',
      'theme_assessment_round_answers',
      'theme_assessment_result_revisions',
      'theme_assessment_result_responses',
    ]) {
      expect(sql).toMatch(new RegExp(`CREATE\\s+TABLE\\s+IF\\s+NOT\\s+EXISTS\\s+${table}`, 'i'));
    }
    expect(sql).toContain("'emotion', 'relationship', 'social', 'workplace', 'self_evaluation'");
    expect(sql).toContain("'core', 'clarifier', 'counterexample'");
    expect(sql).not.toMatch(/INSERT\s+INTO\s+continuous_portraits/i);
    expect(sql).not.toMatch(/DROP\s+TABLE/i);
  });
});
