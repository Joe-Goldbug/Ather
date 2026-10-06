#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error('DATABASE_URL not set');
}

const scriptDir = dirname(fileURLToPath(import.meta.url));
const root = join(scriptDir, '..');

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: root,
    env: process.env,
    stdio: 'inherit',
  });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

// pgcrypto is a database prerequisite for the baseline's UUID defaults. All
// application schema DDL belongs to the ordered migration runner below.
run('psql', [databaseUrl, '-v', 'ON_ERROR_STOP=1', '-c', 'CREATE EXTENSION IF NOT EXISTS pgcrypto;']);
run(process.execPath, ['scripts/apply-db-migrations.mjs']);

console.log('db bootstrap completed through the migration runner');
