/**
 * packages/database/src/migrations/migration-verification.test.ts
 * Migration verification tests for Self-Awareness Stage One.
 *
 * Verifies:
 * - SQL migration files exist and have valid structure
 * - No UNIQUE(user_id, date) on captures (Requirement 5.1)
 * - evidence_events has evidence_kind default 'formal' (Requirement 6.1)
 * - user_corrections has candidate_status (Requirement 8.1)
 * - diary_entries marked as deprecated read-only (Requirement 13.3)
 *
 * Validates: Requirements 5.1, 6.1, 6.2, 11.3, 13.3
 */

import { readFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { beforeAll, describe, expect, it } from 'vitest';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const MIGRATIONS_DIR = __dirname;

function readMigration(filename: string): string {
  const path = resolve(MIGRATIONS_DIR, filename);
  if (!existsSync(path)) {
    throw new Error(`Migration file not found: ${path}`);
  }
  return readFileSync(path, 'utf-8');
}

describe('Migration Files — Existence and Structure', () => {
  const migrationFiles = [
    '001_captures.sql',
    '002_capture_interpretations.sql',
    '003_evidence_extensions.sql',
    '004_corrections_and_diary.sql',
    // [Fix review-7] new dynamic-script migration added 2026-07-25
    '20260725120000_dynamic_script_tables.sql',
  ];

  it.each(migrationFiles)('migration %s should exist', (filename) => {
    const path = resolve(MIGRATIONS_DIR, filename);
    expect(existsSync(path)).toBe(true);
  });

  it.each(migrationFiles)('migration %s should contain BEGIN/COMMIT transaction', (filename) => {
    const sql = readMigration(filename);
    expect(sql).toMatch(/BEGIN/i);
    expect(sql).toMatch(/COMMIT/i);
  });

  it.each(migrationFiles)('migration %s should not contain DROP TABLE', (filename) => {
    const sql = readMigration(filename);
    // Requirement 13.3: SHALL NOT delete old tables
    expect(sql).not.toMatch(/DROP\s+TABLE(?!\s+IF\s+EXISTS)/i);
  });
});

describe('001_captures.sql — No UNIQUE(user_id, date)', () => {
  let sql: string;

  beforeAll(() => {
    sql = readMigration('001_captures.sql');
  });

  it('should create captures table', () => {
    expect(sql).toMatch(/CREATE\s+TABLE\s+(IF\s+NOT\s+EXISTS\s+)?captures/i);
  });

  it('should NOT have UNIQUE(user_id, date) or UNIQUE(user_id, local_date) constraint', () => {
    // Requirement 5.1: no UNIQUE(user_id, date) — allows multiple captures per day
    // Strip SQL comments before checking for UNIQUE constraints
    const sqlNoComments = sql.replace(/--.*$/gm, '');
    expect(sqlNoComments).not.toMatch(/UNIQUE\s*\(\s*user_id\s*,\s*date\s*\)/i);
    expect(sqlNoComments).not.toMatch(/UNIQUE\s*\(\s*user_id\s*,\s*local_date\s*\)/i);
    expect(sqlNoComments).not.toMatch(/UNIQUE\s*\(\s*user_id\s*,\s*entry_date\s*\)/i);
    expect(sqlNoComments).not.toMatch(/UNIQUE\s*\(\s*user_id\s*,\s*captured_at\s*\)/i);
  });

  it('should have entry_type with three valid values', () => {
    expect(sql).toMatch(/quick_fragment/);
    expect(sql).toMatch(/emotion_log/);
    expect(sql).toMatch(/decision_log/);
  });

  it('should have process_mode with three valid values', () => {
    expect(sql).toMatch(/save_only/);
    expect(sql).toMatch(/organize/);
    expect(sql).toMatch(/analyze/);
  });

  it('should have modality column with text/voice_transcript/image', () => {
    expect(sql).toMatch(/modality/i);
    expect(sql).toMatch(/text/);
    expect(sql).toMatch(/voice_transcript/);
    expect(sql).toMatch(/image/);
  });

  it('should preserve raw_text column for user original expression', () => {
    expect(sql).toMatch(/raw_text\s+TEXT/i);
  });

  it('should have captured_at timestamp (not date-unique)', () => {
    expect(sql).toMatch(/captured_at\s+TIMESTAMPTZ/i);
  });

  it('should have local_date as DATE (not unique)', () => {
    expect(sql).toMatch(/local_date\s+DATE/i);
  });

  it('should have RLS enabled', () => {
    expect(sql).toMatch(/ENABLE\s+ROW\s+LEVEL\s+SECURITY/i);
  });

  it('should have audit trigger', () => {
    expect(sql).toMatch(/audit_trigger/i);
  });

  it('should reserve simulation capture_mode for S2/S3', () => {
    expect(sql).toMatch(/simulation/);
    expect(sql).toMatch(/capture_mode/i);
  });
});

describe('003_evidence_extensions.sql — evidence_kind defaults and candidate flag', () => {
  let sql: string;

  beforeAll(() => {
    sql = readMigration('003_evidence_extensions.sql');
  });

  it('should add evidence_kind column with DEFAULT formal', () => {
    expect(sql).toMatch(/evidence_kind/i);
    expect(sql).toMatch(/DEFAULT\s+'formal'/i);
  });

  it('should have CHECK constraint including all valid evidence_kind values', () => {
    const kinds = ['formal', 'practice', 'calibration', 'reality', 'decision', 'correction', 'chat_legacy'];
    for (const kind of kinds) {
      expect(sql).toContain(kind);
    }
  });

  it('should add candidate column with DEFAULT false', () => {
    expect(sql).toMatch(/candidate\s+BOOLEAN\s+NOT\s+NULL\s+DEFAULT\s+false/i);
  });

  it('should add local_date column', () => {
    expect(sql).toMatch(/local_date\s+DATE/i);
  });

  it('should add evidence_mode column with DEFAULT choice', () => {
    expect(sql).toMatch(/evidence_mode/i);
    expect(sql).toMatch(/DEFAULT\s+'choice'/i);
  });

  it('should ensure old rows get evidence_kind=formal by default (backward compat)', () => {
    // The DEFAULT 'formal' on the ALTER TABLE means existing rows automatically have 'formal'
    // This is the intended backward compatibility: old test evidence → formal
    expect(sql).toMatch(/NOT\s+NULL\s+DEFAULT\s+'formal'/i);
  });
});

describe('004_corrections_and_diary.sql — candidate_status and diary deprecation', () => {
  let sql: string;

  beforeAll(() => {
    sql = readMigration('004_corrections_and_diary.sql');
  });

  it('should add candidate_status column to user_corrections', () => {
    expect(sql).toMatch(/candidate_status/i);
  });

  it('should have CHECK constraint with valid candidate_status values', () => {
    const statuses = ['candidate', 'verifying', 'verified', 'expired'];
    for (const status of statuses) {
      expect(sql).toContain(status);
    }
  });

  it('should default candidate_status to candidate', () => {
    expect(sql).toMatch(/DEFAULT\s+'candidate'/i);
  });

  it('should add verified_at timestamp column', () => {
    expect(sql).toMatch(/verified_at\s+TIMESTAMPTZ/i);
  });

  it('should add candidate_evidence_id FK to evidence_events', () => {
    expect(sql).toMatch(/candidate_evidence_id/i);
    expect(sql).toMatch(/REFERENCES\s+evidence_events/i);
  });

  it('should mark diary_entries as deprecated read-only (not DROP)', () => {
    // Requirement 13.3: diary_entries preserved as read-only archive
    expect(sql).toMatch(/DEPRECATED\s+S1/i);
    expect(sql).toMatch(/read-only\s+archive/i);
    expect(sql).not.toMatch(/DROP\s+TABLE\s+diary_entries/i);
  });

  it('should NOT delete data from diary_entries', () => {
    expect(sql).not.toMatch(/DELETE\s+FROM\s+diary_entries/i);
    expect(sql).not.toMatch(/TRUNCATE\s+diary_entries/i);
  });
});
