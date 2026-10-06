#!/usr/bin/env bun
/**
 * 迁移 ledger 基线引导（一次性 / 可重复执行）
 *
 * 用途：修复「schema 已就位、但从未记录 ledger」的历史遗留库。
 * 把 packages/database/src/migrations 下的全部本地迁移标记为 `adopted`，
 * 使**未来的新迁移**能正常经 apply-db-migrations.mjs 记录与应用。
 *
 * 为什么需要独立脚本：apply-db-migrations.mjs 内部通过 psql 执行 SQL，
 * 而本机可能没有 psql（只有 node_modules/pg）。本脚本用 pg 完成同样的引导动作。
 *
 * ⚠️ 语义：这是「基线声明」，不是「验证通过」——它不检查 schema 是否真的匹配。
 *    执行前请确认库中表结构确已就位（可用 --check 抽查关键表）。
 *
 * 用法：
 *   bun run scripts/baseline-migration-ledger.mjs            # dry-run
 *   bun run scripts/baseline-migration-ledger.mjs --execute  # 提交
 *   bun run scripts/baseline-migration-ledger.mjs --check    # 仅抽查关键 schema 是否就位
 */
import { Client } from 'pg';
import { readdirSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import { isMigrationFilename, migrationSortKey } from './apply-db-migrations.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const MIGRATION_DIR = join(ROOT, 'packages', 'database', 'src', 'migrations');
const EXECUTE = process.argv.includes('--execute');
const CHECK_ONLY = process.argv.includes('--check');

function resolveDatabaseUrl() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const raw = readFileSync(join(ROOT, 'apps', 'api', '.env'), 'utf8');
  const line = raw.split('\n').map((l) => l.trim()).find((l) => l.startsWith('DATABASE_URL='));
  if (!line) throw new Error('DATABASE_URL not found');
  return line.slice('DATABASE_URL='.length).trim();
}

const files = readdirSync(MIGRATION_DIR)
  .filter((f) => f.endsWith('.sql') && isMigrationFilename(f))
  .sort((a, b) => {
    const ka = migrationSortKey(a);
    const kb = migrationSortKey(b);
    return ka < kb ? -1 : ka > kb ? 1 : 0;
  });

const client = new Client({ connectionString: resolveDatabaseUrl(), ssl: { rejectUnauthorized: false } });
await client.connect();

const SCHEMA_PROBES = [
  ['users', "to_regclass('public.users') IS NOT NULL"],
  ['evidence_events.portrait_status', "EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='evidence_events' AND column_name='portrait_status')"],
  ['evidence_events.evidence_kind', "EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='evidence_events' AND column_name='evidence_kind')"],
  ['captures', "to_regclass('public.captures') IS NOT NULL"],
  ['theme_assessment_rounds', "to_regclass('public.theme_assessment_rounds') IS NOT NULL"],
  ['correction_record_revisions', "to_regclass('public.correction_record_revisions') IS NOT NULL"],
  ['continuous_portraits', "to_regclass('public.continuous_portraits') IS NOT NULL"],
  ['governance_rule_versions', "to_regclass('public.governance_rule_versions') IS NOT NULL"],
  ['portrait_outbox', "to_regclass('public.portrait_outbox') IS NOT NULL"],
  ['evidence_source_fragments', "to_regclass('public.evidence_source_fragments') IS NOT NULL"],
  ['dynamic_script_sessions', "to_regclass('public.dynamic_script_sessions') IS NOT NULL"],
  ['product_events', "to_regclass('public.product_events') IS NOT NULL"],
  ['conversation_reports.report_data', "EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='conversation_reports' AND column_name='report_data')"],
];

try {
  console.log('[baseline] 关键 schema 抽查（声明基线的依据）：');
  let missing = 0;
  for (const [label, expr] of SCHEMA_PROBES) {
    const r = await client.query(`SELECT (${expr}) AS ok`);
    const ok = r.rows[0].ok === true;
    if (!ok) missing += 1;
    console.log(`  ${ok ? 'OK  ' : 'MISS'}  ${label}`);
  }
  console.log(missing === 0 ? '\n[baseline] 所有抽查项均存在 —— 库结构已就位\n' : `\n[baseline] ⚠️ ${missing} 项缺失，基线声明可能不成立\n`);

  if (CHECK_ONLY) {
    await client.end();
    process.exit(missing === 0 ? 0 : 1);
  }

  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename   TEXT PRIMARY KEY,
      checksum   TEXT NOT NULL,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      status     TEXT NOT NULL DEFAULT 'applied'
    )`);

  const existing = await client.query('SELECT filename, status FROM schema_migrations');
  const known = new Map(existing.rows.map((r) => [r.filename, r.status]));
  console.log(`[baseline] ledger 现有记录 ${known.size} 条；本地迁移 ${files.length} 个`);
  console.log(`[baseline] mode = ${EXECUTE ? 'EXECUTE' : 'DRY-RUN'}\n`);

  let adopted = 0;
  for (const filename of files) {
    const checksum = createHash('sha256').update(readFileSync(join(MIGRATION_DIR, filename), 'utf8')).digest('hex');
    if (known.has(filename)) {
      console.log(`  skip   ${filename}  (已记录为 ${known.get(filename)})`);
      continue;
    }
    if (EXECUTE) {
      await client.query(
        `INSERT INTO schema_migrations (filename, checksum, status) VALUES ($1, $2, 'adopted')
         ON CONFLICT (filename) DO NOTHING`,
        [filename, checksum],
      );
    }
    adopted += 1;
    console.log(`  ${EXECUTE ? 'adopt ' : 'would '} ${filename}`);
  }

  if (EXECUTE) {
    const after = await client.query(`SELECT status, COUNT(*)::int AS n FROM schema_migrations GROUP BY status`);
    console.log(`\n[baseline] COMMITTED —— ledger 状态：${JSON.stringify(after.rows)}`);
    console.log('[baseline] 此后新增迁移可正常经 apply-db-migrations.mjs 应用');
  } else {
    console.log(`\n[baseline] DRY-RUN：将新增 ${adopted} 条 adopted 记录（未提交）`);
    console.log('[baseline] 确认无误后加 --execute 提交');
  }
} catch (e) {
  console.error('[baseline] ERROR:', e.message);
  process.exitCode = 1;
} finally {
  await client.end();
}
