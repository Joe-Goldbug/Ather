#!/usr/bin/env bun
/**
 * 迁移清单一致性 + 排序正确性校验（CI 门禁用）
 *
 * 防住两类已发生过的回归：
 *   1. 文件名不在白名单内 → runner 静默忽略（仅 warn）→ 迁移永远不执行
 *      （历史案例：20260725120000_dynamic_script_tables.sql 等 3 个）
 *   2. 裸字典序排序 → `-incremental` 排在主迁移之前 → 空库执行时 ALTER 不存在的表而失败
 *
 * 用法：bun run scripts/verify-migration-order.mjs
 * 退出码：0 = 通过，1 = 发现问题
 */
import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import {
  isMigrationFilename,
  MIGRATION_DEPENDENCIES,
  orderMigrations,
} from './apply-db-migrations.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const MIGRATION_DIR = join(ROOT, 'packages', 'database', 'src', 'migrations');

const all = readdirSync(MIGRATION_DIR).filter((f) => f.endsWith('.sql')).sort();
const accepted = all.filter(isMigrationFilename);
const rejected = all.filter((f) => !isMigrationFilename(f));
const finderCopies = rejected.filter((filename) => / \d+\.sql$/.test(filename));
const invalidNames = rejected.filter((filename) => !finderCopies.includes(filename));

let ordered = [];
try {
  ordered = orderMigrations(accepted);
} catch (error) {
  console.error(`[verify] migration dependency graph invalid: ${error.message}`);
  process.exit(1);
}

const failures = [];
const indexOf = (name) => ordered.indexOf(name);

console.log(`[verify] 迁移文件总数 ${all.length}｜被 runner 接受 ${accepted.length}｜Finder 副本 ${finderCopies.length}｜异常命名 ${invalidNames.length}\n`);

if (finderCopies.length > 0) {
  console.warn(`[verify] 忽略 Finder 副本（不参与迁移）：\n    ${finderCopies.join('\n    ')}`);
}

if (invalidNames.length > 0) {
  failures.push(`以下文件不在白名单内，runner 会忽略：\n    ${invalidNames.join('\n    ')}`);
}

// 顺序断言：主文件必须先于其 -incremental 变体（先建表后改表）
const sequenceChecks = [
  ['2026-09-02-phase1-events-feedback.sql', '2026-09-02-phase1-events-feedback-incremental.sql'],
  ['001_captures.sql', '2026-04-28-critical-consistency-fixes.sql'],
  ['20260725120000_dynamic_script_tables.sql', '2026-07-29-continuous-portrait-v1.sql'],
  ['2026-07-29-continuous-portrait-v1.sql', '2026-09-10-portrait-channel-repair.sql'],
  ...Object.entries(MIGRATION_DEPENDENCIES).flatMap(([after, befores]) =>
    befores.map((before) => [before, after]),
  ),
];

for (const [before, after] of sequenceChecks) {
  const i = indexOf(before);
  const j = indexOf(after);
  if (i === -1 || j === -1) {
    failures.push(`顺序断言跳过（文件不存在）：${before} → ${after}`);
    continue;
  }
  const ok = i < j;
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${before}  (${i})  <  ${after}  (${j})`);
  if (!ok) failures.push(`顺序错误：${before} 应排在 ${after} 之前，实际 ${i} vs ${j}`);
}

console.log('\n[verify] runner 实际执行顺序：');
ordered.forEach((f, i) => console.log(`  ${String(i + 1).padStart(2)}. ${f}`));

if (failures.length > 0) {
  console.error('\n[verify] FAILED:');
  failures.forEach((f) => console.error(`  - ${f}`));
  process.exit(1);
}
console.log('\n[verify] PASSED — 命名白名单与执行顺序均正确');
