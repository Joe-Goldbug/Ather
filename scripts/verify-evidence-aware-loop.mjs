#!/usr/bin/env node

/**
 * Fast, dependency-free preflight for the evidence-aware acceptance loop.
 * Runtime smoke remains a separate gate because it requires API, Redis and a
 * local PostgreSQL service. This script proves the common migration path and
 * prevents Task 12 from silently claiming that an empty database is safe.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { isMigrationFilename, orderMigrations } from './apply-db-migrations.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const required = [
  'scripts/apply-db-migrations.mjs',
  'scripts/verify-migration-order.mjs',
  'scripts/bootstrap-neon-db.mjs',
  'scripts/smoke-test.ts',
  'packages/database/src/schema.sql',
];

for (const relativePath of required) {
  if (!existsSync(join(root, relativePath))) {
    throw new Error(`missing acceptance prerequisite: ${relativePath}`);
  }
}

const orderCheck = spawnSync(process.execPath, ['scripts/verify-migration-order.mjs'], {
  cwd: root,
  encoding: 'utf8',
});
process.stdout.write(orderCheck.stdout);
process.stderr.write(orderCheck.stderr);
if (orderCheck.status !== 0) process.exit(orderCheck.status ?? 1);

console.log('[verify:evidence-loop] preflight passed: shared runner, bootstrap, and migration order are present');

const cleanDatabaseUrl = process.env.EVIDENCE_LOOP_DATABASE_URL;
if (cleanDatabaseUrl) {
  const migrationDir = join(root, 'packages', 'database', 'src', 'migrations');
  const expectedMigrations = orderMigrations(
    readdirSync(migrationDir).filter((filename) => isMigrationFilename(filename)),
  );
  const result = spawnSync('psql', [
    cleanDatabaseUrl,
    '-v', 'ON_ERROR_STOP=1', '-t', '-A', '-F', '|', '-c', `
      SELECT filename, status
      FROM schema_migrations
      ORDER BY filename;

      SELECT to_regclass('public.product_feedback')::text,
             to_regclass('public.product_feedback_status_history')::text;
    `,
  ], { encoding: 'utf8' });
  if (result.status !== 0) {
    process.stderr.write(result.stderr);
    throw new Error('clean database assertions could not be executed');
  }

  const lines = result.stdout.trim().split('\n').filter(Boolean);
  const ledger = lines.slice(0, expectedMigrations.length).map((line) => line.split('|'));
  const tables = lines.at(-1)?.split('|') ?? [];
  const appliedNames = ledger.map(([filename]) => filename).sort();
  const expectedNames = [...expectedMigrations].sort();
  const allApplied = ledger.every(([, status]) => status === 'applied');
  if (JSON.stringify(appliedNames) !== JSON.stringify(expectedNames) || !allApplied) {
    throw new Error('clean database ledger does not contain every canonical migration as applied');
  }
  if (tables[0] !== 'product_feedback' || tables[1] !== 'product_feedback_status_history') {
    throw new Error('clean database is missing feedback workflow tables after migration');
  }
  console.log(`[verify:evidence-loop] clean database passed: ${ledger.length} canonical migrations applied; feedback workflow dependency satisfied`);
} else {
  console.log('[verify:evidence-loop] clean database assertions skipped: set EVIDENCE_LOOP_DATABASE_URL after bootstrapping a disposable empty database.');
}

console.log('[verify:evidence-loop] runtime smoke requires a started local API, Redis, and PostgreSQL; run `bun run test:smoke:ci` separately for its static CI gate.');
