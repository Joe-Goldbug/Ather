import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const migrationPath = join(import.meta.dirname, '2026-09-26-zz-account-deletion-tombstones.sql');

describe('account deletion tombstones migration', () => {
  it('keeps an opaque deletion ledger without a users foreign key', () => {
    const sql = readFileSync(migrationPath, 'utf8');

    expect(sql).toContain('CREATE TABLE IF NOT EXISTS account_deletion_tombstones');
    expect(sql).toContain('user_id UUID PRIMARY KEY');
    expect(sql).toContain('deleted_at TIMESTAMPTZ NOT NULL');
    expect(sql).not.toMatch(/REFERENCES\s+users/i);
    expect(sql).not.toMatch(/email|content|raw_text/i);
  });

  it('does not expose tombstones through a permissive RLS policy', () => {
    const sql = readFileSync(migrationPath, 'utf8');

    expect(sql).toContain('ENABLE ROW LEVEL SECURITY');
    expect(sql).not.toMatch(/CREATE\s+POLICY/i);
  });
});
