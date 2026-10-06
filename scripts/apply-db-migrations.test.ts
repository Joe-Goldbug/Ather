import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  buildAdoptedMigrationSql,
  buildAtomicMigrationSql,
  isAcceptedLedgerStatus,
  isMigrationFilename,
  LEDGERLESS_MIGRATION_CONTRACTS,
  orderMigrations,
  stripOuterTransaction,
} from './apply-db-migrations.mjs';

describe('migration runner helpers', () => {
  it('accepts canonical migration names and ignores duplicate Finder copies', () => {
    expect(isMigrationFilename('003_evidence_extensions.sql')).toBe(true);
    expect(isMigrationFilename('2026-07-29-continuous-portrait-v1.sql')).toBe(true);
    expect(isMigrationFilename('005_user_entitlement_tier 2.sql')).toBe(false);
  });

  it('owns one transaction around a legacy migration and its ledger write', () => {
    const sql = buildAtomicMigrationSql('-- legacy comment\nBEGIN;\nSELECT 1;\nCOMMIT;\n', '003_evidence_extensions.sql', 'abc');

    expect(stripOuterTransaction('-- legacy comment\nBEGIN;\nSELECT 1;\nCOMMIT;')).toBe('-- legacy comment\nSELECT 1;');
    expect(sql).toMatch(/^BEGIN;/);
    expect(sql).toContain('SELECT 1;');
    expect(sql).toContain("INSERT INTO schema_migrations (filename, checksum, status) VALUES ('003_evidence_extensions.sql', 'abc', 'applied');");
    expect(sql.trim().endsWith('COMMIT;')).toBe(true);
  });

  it('records a verified ledgerless migration as adopted rather than pretending it ran now', () => {
    expect(buildAdoptedMigrationSql('001_captures.sql', 'abc')).toContain("VALUES ('001_captures.sql', 'abc', 'adopted')");
    expect(isAcceptedLedgerStatus('applied')).toBe(true);
    expect(isAcceptedLedgerStatus('adopted')).toBe(true);
    expect(isAcceptedLedgerStatus('unknown')).toBe(false);
  });

  it('requires a structural adoption contract for every canonical migration', () => {
    expect(Object.keys(LEDGERLESS_MIGRATION_CONTRACTS).sort()).toEqual([
      '001_captures.sql',
      '002_capture_interpretations.sql',
      '003_evidence_extensions.sql',
      '004_corrections_and_diary.sql',
      '005_user_entitlement_tier.sql',
      '2026-04-28-critical-consistency-fixes.sql',
      '2026-07-29-continuous-portrait-v1.sql',
      '2026-07-29-correction-command-idempotency.sql',
      '2026-07-30-theme-assessment-rounds.sql',
    ]);
    for (const contract of Object.values(LEDGERLESS_MIGRATION_CONTRACTS)) {
      expect(contract.completeSql).toContain('SELECT');
      expect(contract.presentSql).toContain('SELECT');
    }
  });

  it('keeps the development launcher on the ledger runner', () => {
    const startDev = readFileSync(resolve(import.meta.dirname, 'start-dev.sh'), 'utf8');

    expect(startDev).toContain('node scripts/apply-db-migrations.mjs');
    expect(startDev).not.toContain('psql -h localhost -U "$(whoami)" -d eva_test -f');
  });

  it('makes bootstrap delegate schema DDL to the same migration runner', () => {
    const bootstrap = readFileSync(resolve(import.meta.dirname, 'bootstrap-neon-db.mjs'), 'utf8');

    expect(bootstrap).toContain("scripts/apply-db-migrations.mjs");
    expect(bootstrap).toContain('CREATE EXTENSION IF NOT EXISTS pgcrypto');
    expect(bootstrap).not.toContain('CREATE TABLE IF NOT EXISTS evidence_events');
  });

  it('initializes the repository schema before versioned migrations on an empty database', () => {
    const runner = readFileSync(resolve(import.meta.dirname, 'apply-db-migrations.mjs'), 'utf8');

    expect(runner).toContain("to_regclass('public.users') IS NOT NULL");
    expect(runner).toContain("'packages', 'database', 'src', 'schema.sql'");
    expect(runner).toContain('applying schema baseline to an empty database');
  });

  it('runs admin workflow hardening after the feedback table it references', () => {
    const ordered = orderMigrations([
      '2026-09-02-admin-workflow-hardening.sql',
      '2026-09-02-phase1-events-feedback.sql',
      '2026-09-02-phase1-events-feedback-incremental.sql',
    ]);

    expect(ordered.indexOf('2026-09-02-phase1-events-feedback.sql'))
      .toBeLessThan(ordered.indexOf('2026-09-02-admin-workflow-hardening.sql'));
  });
});
