#!/usr/bin/env node
/**
 * 孤儿证据清理（2-C3）—— 主方案兜底。
 *
 * 扫描 evidence_events 中 source_id 指向已删除源记录的证据，
 * 默认 DRY-RUN（只报告，不改数据）；`--execute` 才提交。
 *
 * 处理语义：置 candidate=true + portrait_status='withdrawn' —— 与用户
 * 主动撤回（1-2a）同构：数据保留、被 1-3 过滤器与 formal 视图排除、
 * 用户仍可在纠偏界面看到它曾被隔离（来源已删）。
 *
 * source_type → 源表映射（source_id 多态关联，无外键可依）：
 *   test                          → assessment_runs / dynamic_scripts
 *   micro_sandbox_practice         → assessment_runs
 *   observation_response          → observation_responses
 *   user_correction               → user_corrections
 *   chat                          → conversations
 *   diary                         → diary_entries
 *   capture                       → captures
 * 未知 source_type 与 NULL source_id 不处理（仅统计）。
 *
 * 用法：
 *   DATABASE_URL=... bun run scripts/cleanup-orphan-evidence.mjs            # DRY-RUN
 *   DATABASE_URL=... bun run scripts/cleanup-orphan-evidence.mjs --execute  # 提交
 */
import pg from 'pg';
import { sourceTables, orphanPredicate } from './cleanup-orphan-evidence-sources.mjs';

const EXECUTE = process.argv.includes('--execute');
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error('[orphan-cleanup] DATABASE_URL is required');
  process.exit(1);
}

const client = new pg.Client({ connectionString: databaseUrl, ssl: { rejectUnauthorized: false } });
await client.connect();

const types = await client.query(
  `SELECT source_type, COUNT(*)::int AS n FROM evidence_events GROUP BY source_type ORDER BY n DESC`,
);
console.log(`[orphan-cleanup] 证据 source_type 分布: ${JSON.stringify(types.rows)}`);

let totalOrphans = 0;
for (const { source_type: sourceType } of types.rows) {
  const tables = sourceTables(sourceType);
  const predicate = orphanPredicate(sourceType);
  if (!predicate) {
    console.log(`[orphan-cleanup] 跳过未知 source_type: ${sourceType}（请人工核对映射）`);
    continue;
  }

  // source_id 为 NULL 的证据没有源可指——只发生在聚合型来源，单独报告
  // source_id 是 TEXT，可能存在非 UUID 值（22P02 教训）——非法格式单独归类，
  // 不参与 JOIN 也不参与自动隔离（需人工核对来源）
  const nonUuid = await client.query(
    `SELECT COUNT(*)::int AS n FROM evidence_events
     WHERE source_type = $1 AND source_id IS NOT NULL
       AND source_id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'`,
    [sourceType],
  );
  if (nonUuid.rows[0].n > 0) {
    console.log(`[orphan-cleanup] ${sourceType}: ${nonUuid.rows[0].n} 条非 UUID source_id，需人工核对（不自动处理）`);
  }

  const orphans = await client.query(
    `SELECT e.id, e.source_id, e.dimension
     FROM evidence_events e
     WHERE ${predicate}`,
    [sourceType],
  );

  if (orphans.rows.length === 0) continue;
  totalOrphans += orphans.rows.length;
  console.log(`[orphan-cleanup] ${sourceType} → ${tables.join(' / ')}: ${orphans.rows.length} 条孤儿`);
  for (const row of orphans.rows.slice(0, 10)) {
    console.log(`  - ${row.id} (dimension=${row.dimension}, source_id=${row.source_id})`);
  }
  if (orphans.rows.length > 10) console.log(`  ... 及 ${orphans.rows.length - 10} 条`);

  if (EXECUTE) {
    const ids = orphans.rows.map((r) => r.id);
    const res = await client.query(
      `UPDATE evidence_events e
       SET candidate = true, portrait_status = 'withdrawn', updated_at = NOW()
       WHERE e.id = ANY($2::uuid[]) AND ${predicate}`,
      [sourceType, ids],
    );
    console.log(`[orphan-cleanup] 已隔离 ${res.rowCount} 条（candidate=true, withdrawn）`);
  }
}

if (totalOrphans === 0) {
  console.log('[orphan-cleanup] 无孤儿证据');
} else if (!EXECUTE) {
  console.log(`[orphan-cleanup] DRY-RUN：共 ${totalOrphans} 条待隔离。确认后加 --execute 提交。`);
} else {
  console.log(`[orphan-cleanup] 完成：共隔离 ${totalOrphans} 条。`);
}

await client.end();
