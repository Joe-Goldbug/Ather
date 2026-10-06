import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const sql = readFileSync(new URL('./2026-10-04-dynamic-script-playback.sql', import.meta.url), 'utf8');

describe('dynamic script playback migration', () => {
  it('wraps changes in BEGIN/COMMIT', () => {
    expect(sql.trim()).toMatch(/^BEGIN;/);
    expect(sql.trim()).toMatch(/COMMIT;$/);
  });
  it('adds nullable playback columns without changing historical data', () => {
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS played_path JSONB/);
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS play_completed_at TIMESTAMPTZ/);
    expect(sql).not.toMatch(/DROP|DELETE|TRUNCATE|UPDATE\s+dynamic_scripts|NOT NULL|DEFAULT/i);
  });
  it('permits owner-only UPDATE with both USING and WITH CHECK', () => {
    expect(sql).toMatch(/CREATE POLICY dynamic_scripts_update ON dynamic_scripts\s+FOR UPDATE USING/);
    expect(sql).toMatch(/WITH CHECK/);
    expect(sql.match(/current_setting\('app.session_token', true\)/g)).toHaveLength(2);
    expect(sql.match(/revoked IS NULL OR revoked = FALSE/g)).toHaveLength(2);
  });
});
