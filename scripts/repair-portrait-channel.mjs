#!/usr/bin/env bun
/**
 * 补链前置修复：打通正式证据通道 + 修复报告写入缺列
 *
 * 背景（见 docs/EVA-补链待办清单-定稿-2026-09-10.md）：
 *   1. [P0] conversation_reports 缺 report_data 列 → worker.ts:113 的 completeReport 必然失败
 *   2. [0-3] portrait_formal_evidence_v1 视图恒空（5 重条件无一满足）
 *           → 7 处消费方（报告 allowedIds / 画像 / 证据列表 / V3 对外通道）全部拿空集
 *
 * 做法（方案 A「最小晋升规则」，符合架构意图，不绕过治理）：
 *   a. 建立 1 条 approved 治理规则
 *   b. 把 evidence_kind='formal' 且 candidate=false 的证据晋升为 portrait_status='formal'
 *      （即测评/微沙盒产生的结构化证据；candidate 证据一律不晋升）
 *
 * 幂等：可重复执行；默认 dry-run，需显式 --execute 才提交。
 * 回滚：见文件末尾 ROLLBACK_SQL。
 *
 * 用法：
 *   bun run scripts/repair-portrait-channel.mjs             # dry-run（事务内验证后回滚）
 *   bun run scripts/repair-portrait-channel.mjs --execute    # 实际提交
 */
import { Client } from 'pg';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const EXECUTE = process.argv.includes('--execute');

const RULE_KEY = 'portrait_formal_v1';
const RULE_VERSION = 1;
const PURPOSE_SCOPE = 'evidence_collection';

const RULE_DEFINITION = {
  scope: 'evidence_kind=formal AND candidate=false',
  purpose_scope: PURPOSE_SCOPE,
  note: '测评 / 微沙盒产生的结构化证据可进入正式画像视图；候选证据一律不晋升',
  approved_by: 'engineering-repair-2026-09-10',
};

function resolveDatabaseUrl() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const envPath = join(ROOT, 'apps', 'api', '.env');
  const raw = readFileSync(envPath, 'utf8');
  const line = raw.split('\n').map((l) => l.trim()).find((l) => l.startsWith('DATABASE_URL='));
  if (!line) throw new Error('DATABASE_URL not found in env or apps/api/.env');
  return line.slice('DATABASE_URL='.length).trim();
}

const client = new Client({
  connectionString: resolveDatabaseUrl(),
  ssl: { rejectUnauthorized: false },
});

async function main() {
  await client.connect();
  console.log(`[repair] mode = ${EXECUTE ? 'EXECUTE (will COMMIT)' : 'DRY-RUN (will ROLLBACK)'}`);

  try {
    await client.query('BEGIN');

    // ── 修复 1：report_data 缺列 ────────────────────────────────────────────
    console.log('\n[1/3] conversation_reports.report_data');
    const beforeCol = await client.query(
      `SELECT COUNT(*)::int AS n FROM information_schema.columns
       WHERE table_name='conversation_reports' AND column_name='report_data'`,
    );
    await client.query(`ALTER TABLE conversation_reports ADD COLUMN IF NOT EXISTS report_data JSONB`);
    const afterCol = await client.query(
      `SELECT COUNT(*)::int AS n FROM information_schema.columns
       WHERE table_name='conversation_reports' AND column_name='report_data'`,
    );
    console.log(`      column before=${beforeCol.rows[0].n} after=${afterCol.rows[0].n}${beforeCol.rows[0].n === 0 ? '  <== ADDED (P0 FIXED)' : '  (already present)'}`);

    // ── 修复 2：建立 approved 治理规则 ─────────────────────────────────────
    console.log('\n[2/3] governance rule');
    await client.query(
      `INSERT INTO governance_rule_versions (rule_key, version, status, definition, evidence_ref, approved_at)
       VALUES ($1, $2, 'approved', $3::jsonb, $4, NOW())
       ON CONFLICT (rule_key, version) DO NOTHING`,
      [RULE_KEY, RULE_VERSION, JSON.stringify(RULE_DEFINITION), 'docs/EVA-补链待办清单-定稿-2026-09-10.md'],
    );
    const rule = await client.query(
      `SELECT id, status FROM governance_rule_versions WHERE rule_key=$1 AND version=$2`,
      [RULE_KEY, RULE_VERSION],
    );
    const ruleId = rule.rows[0].id;
    console.log(`      ${RULE_KEY} v${RULE_VERSION} status=${rule.rows[0].status} id=${ruleId}`);

    // ── 修复 3：晋升既有证据 ───────────────────────────────────────────────
    console.log('\n[3/3] promote evidence');
    const upd = await client.query(
      `UPDATE evidence_events
       SET portrait_status='formal', status_rule_id=$1, purpose_scope=$2, updated_at=NOW()
       WHERE evidence_kind='formal'
         AND COALESCE(candidate, false) = false
         AND portrait_status <> 'formal'`,
      [ruleId, PURPOSE_SCOPE],
    );
    console.log(`      promoted rows = ${upd.rowCount}`);

    // ── 验证 ───────────────────────────────────────────────────────────────
    console.log('\n[verify]');
    const status = await client.query(
      `SELECT portrait_status, COUNT(*)::int AS n FROM evidence_events GROUP BY portrait_status ORDER BY n DESC`,
    );
    console.log('      evidence_events.portrait_status:', JSON.stringify(status.rows));

    const view = await client.query(`SELECT COUNT(*)::int AS n FROM portrait_formal_evidence_v1`);
    console.log(`      portrait_formal_evidence_v1 rows = ${view.rows[0].n}`);

    const leak = await client.query(
      `SELECT COUNT(*)::int AS n FROM portrait_formal_evidence_v1 WHERE candidate = true OR status_rule_id IS NULL OR purpose_scope IS NULL`,
    );
    const leakN = leak.rows[0].n;
    console.log(`      invariants violated (candidate/rule/scope null) = ${leakN}${leakN === 0 ? '  OK' : '  <== FAIL'}`);

    if (EXECUTE) {
      await client.query('COMMIT');
      console.log('\n[repair] COMMITTED');
    } else {
      await client.query('ROLLBACK');
      console.log('\n[repair] ROLLED BACK (dry-run, no changes persisted)');
    }
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('\n[repair] FAILED and rolled back:', err.message);
    process.exitCode = 1;
  } finally {
    await client.end();
  }
}

await main();

/**
 * ROLLBACK_SQL（如需撤销本次修复）：
 *
 *   BEGIN;
 *   UPDATE evidence_events
 *   SET portrait_status='legacy_unclassified', status_rule_id=NULL, purpose_scope=NULL, updated_at=NOW()
 *   WHERE status_rule_id = (SELECT id FROM governance_rule_versions WHERE rule_key='portrait_formal_v1' AND version=1);
 *   DELETE FROM governance_rule_versions WHERE rule_key='portrait_formal_v1' AND version=1;
 *   -- 谨慎：仅当确认无其它依赖时执行
 *   ALTER TABLE conversation_reports DROP COLUMN IF EXISTS report_data;
 *   COMMIT;
 */
