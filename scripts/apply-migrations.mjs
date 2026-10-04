// Ather-Solana 数据库迁移执行器
//
// ⚠️ Neon 池化连接**不支持 search_path 启动参数**
//    （报unsupported startup parameter in options: search_path），
//    所以不能用连接串?options=-csearch_path=xxx 的方式隔离 schema。
//    本脚本的做法是：连接后逐条 SET search_path，再执行迁移。
//    应用侧由 common/pool.ts 在建连后同样设置（见该文件说明）。
//
// 迁移文件采用统一的「3位序号_描述.sql」格式（000/001/002/003），
// 因此纯字符串排序即可安全执行——这是为了规避 Ather-ethan 混用
// 「2026-09-02-x.sql」与「20260725120000_x.sql」两套格式导致的
// 增量迁移先于基表执行的问题。
//
// 所有迁移包在独立事务里执行，幂等（IF NOT EXISTS）。
// 用法：DATABASE_URL=<连接串> node scripts/apply-migrations.mjs [schema]
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from 'pg';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error('DATABASE_URL is required');
  process.exit(1);
}

const SCHEMA = process.argv[2] || 'ather_solana';

const here = dirname(fileURLToPath(import.meta.url));
const migrationsDir = join(here, '..', 'packages/database/src/migrations');

const files = readdirSync(migrationsDir)
  .filter((f) => f.endsWith('.sql'))
  .sort();

const client = new Client({
  connectionString: databaseUrl,
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 20000,
});

let ok = 0;
let skipped = 0;
const failures = [];

try {
  await client.connect();
  await client.query(`CREATE SCHEMA IF NOT EXISTS ${SCHEMA}`);
  await client.query(`SET search_path TO ${SCHEMA}`);
  console.log(`[migrate] connected, schema=${SCHEMA}, ${files.length} migration(s)\n`);
  console.log('[migrate] 执行顺序:');
  files.forEach((f, i) => console.log(`  ${String(i + 1).padStart(2)}. ${f}`));
  console.log('');

  for (const file of files) {
    const sql = readFileSync(join(migrationsDir, file), 'utf8');
    try {
      await client.query('BEGIN');
      await client.query(`SET LOCAL search_path TO ${SCHEMA}`);
      await client.query(sql);
      await client.query('COMMIT');
      console.log(`[migrate] OK   ${file}`);
      ok += 1;
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      const msg = err instanceof Error ? err.message : String(err);
      if (/already exists|duplicate column|duplicate key/i.test(msg)) {
        console.log(`[migrate] SKIP ${file} (${msg.split('\n')[0]})`);
        skipped += 1;
      } else {
        console.log(`[migrate] FAIL ${file}: ${msg.split('\n')[0]}`);
        failures.push({ file, msg: msg.split('\n')[0] });
      }
    }
  }
} catch (err) {
  console.error('[migrate] 连接失败:', err instanceof Error ? err.message : err);
  process.exit(1);
} finally {
  await client.end().catch(() => {});
}

console.log(`\n[migrate] done: ok=${ok} skipped=${skipped} failed=${failures.length}`);
if (failures.length) {
  console.log('[migrate] 失败清单:');
  for (const f of failures) console.log(`  - ${f.file}: ${f.msg}`);
  process.exit(1);
}
