import { pathToFileURL } from 'node:url';
import { Pool } from 'pg';
import { replayDeletionLedger } from '../apps/api/src/restore/deletion-ledger.js';

async function main(): Promise<void> {
  const sourceUrl = process.env.SOURCE_DATABASE_URL;
  const restoreUrl = process.env.RESTORE_DATABASE_URL;
  if (!sourceUrl || !restoreUrl) {
    console.error('[restore-guard] SOURCE_DATABASE_URL and RESTORE_DATABASE_URL are required');
    process.exitCode = 1;
    return;
  }

  const apply = process.argv.includes('--apply');
  const source = new Pool({ connectionString: sourceUrl, max: 2, connectionTimeoutMillis: 5_000 });
  const target = new Pool({ connectionString: restoreUrl, max: 2, connectionTimeoutMillis: 5_000 });
  try {
    const result = await replayDeletionLedger(source, target, apply);
    console.log(JSON.stringify(result));
    if (!result.promotion_safe) process.exitCode = 2;
  } catch {
    console.error('[restore-guard] failed without printing database credentials or user data');
    process.exitCode = 1;
  } finally {
    await Promise.allSettled([source.end(), target.end()]);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void main();
}
