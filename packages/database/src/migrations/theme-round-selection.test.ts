import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const sql = readFileSync(resolve(__dirname, '2026-09-28-theme-round-selection.sql'), 'utf8');

describe('theme round selection migration', () => {
  it('adds nullable decision metadata without rewriting existing round data', () => {
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS selection_decision JSONB/i);
    expect(sql).toContain('BEGIN;');
    expect(sql).toContain('COMMIT;');
    expect(sql).not.toMatch(/DROP\s+COLUMN|DELETE\s+FROM|UPDATE\s+theme_assessment_rounds/i);
  });
});
