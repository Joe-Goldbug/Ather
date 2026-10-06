#!/usr/bin/env node

import { readdirSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

// 接受三种命名：
//   1. 三位序号      001_captures.sql
//   2. 日期前缀      2026-07-29-continuous-portrait-v1.sql
//   3. 时间戳前缀    20260725120000_dynamic_script_tables.sql
// 第 3 种是历史遗留命名，此前不在白名单内 → 被静默忽略（仅 warn），
// 导致这些迁移在生产库只能靠手工执行，是 schema 与迁移体系脱节的成因之一。
const MIGRATION_FILENAME = /^(?:\d{3}_[a-z0-9_]+|\d{4}-\d{2}-\d{2}-[a-z0-9-]+|\d{8,14}_[a-z0-9_]+)\.sql$/;
const ACCEPTED_LEDGER_STATUSES = new Set(['applied', 'adopted']);

/**
 * Historical migration files are immutable. A small number therefore need an
 * explicit dependency that their filenames cannot encode. Keep this list here
 * (rather than altering old SQL) so every environment uses the same order.
 */
export const MIGRATION_DEPENDENCIES = Object.freeze({
  '2026-09-02-admin-workflow-hardening.sql': [
    '2026-09-02-phase1-events-feedback.sql',
  ],
});

/**
 * 基线声明模式（`--baseline --confirm-baseline`）。
 *
 * 用于「schema 已就位、但从未记录 ledger」的历史遗留库：把所有本地迁移
 * 标记为 adopted，使**未来的新迁移**能正常经 runner 记录与应用——这是打破
 * "只能手工执行 → schema 与迁移体系持续脱节"循环的唯一入口。
 *
 * ⚠️ 这是「声明」而非「验证」：它不检查 schema 是否真的匹配，必须由操作员确认。
 */
const BASELINE_MODE = process.argv.includes('--baseline');

function tableExists(name) {
  return `to_regclass('public.${name}') IS NOT NULL`;
}

function columnsExist(table, columns) {
  const names = columns.map(sqlLiteral).join(', ');
  return `(SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = 'public' AND table_name = ${sqlLiteral(table)} AND column_name IN (${names})) = ${columns.length}`;
}

function anyColumnsExist(table, columns) {
  const names = columns.map(sqlLiteral).join(', ');
  return `EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = ${sqlLiteral(table)} AND column_name IN (${names}))`;
}

function policyExists(table, policy) {
  return `EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = ${sqlLiteral(table)} AND policyname = ${sqlLiteral(policy)})`;
}

function triggerExists(table, trigger) {
  return `EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid = ${sqlLiteral(`public.${table}`)}::regclass AND tgname = ${sqlLiteral(trigger)} AND NOT tgisinternal)`;
}

function constraintExists(name) {
  return `EXISTS (SELECT 1 FROM pg_constraint WHERE conname = ${sqlLiteral(name)})`;
}

function indexExists(name) {
  return `EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = ${sqlLiteral(name)})`;
}

function viewExists(name) {
  return `to_regclass('public.${name}') IS NOT NULL`;
}

function booleanQuery(...clauses) {
  // psql -t -A prints PostgreSQL booleans as `t` / `f`; keep that native
  // format so readBooleanQuery can distinguish a failed contract reliably.
  return `SELECT (${clauses.join(' AND ')});`;
}

/**
 * A database created before the migration ledger may already contain a whole
 * migration. Re-running its historical DDL is unsafe because old CREATE POLICY
 * statements were not idempotent. These contracts permit adoption only when
 * the visible schema proves that the migration completed.
 */
export const LEDGERLESS_MIGRATION_CONTRACTS = Object.freeze({
  '001_captures.sql': {
    presentSql: booleanQuery(tableExists('captures')),
    completeSql: booleanQuery(
      tableExists('captures'),
      columnsExist('captures', [
        'id', 'user_id', 'entry_type', 'process_mode', 'modality', 'raw_text', 'media_url',
        'source_weight', 'captured_at', 'local_date', 'timezone', 'mood_label', 'mood_intensity',
        'capture_mode', 'linked_twin_id', 'created_at', 'updated_at',
      ]),
      policyExists('captures', 'captures_self'),
      triggerExists('captures', 'audit_captures'),
    ),
  },
  '002_capture_interpretations.sql': {
    presentSql: booleanQuery(tableExists('capture_interpretations')),
    completeSql: booleanQuery(
      tableExists('capture_interpretations'),
      columnsExist('capture_interpretations', [
        'id', 'capture_id', 'user_id', 'dimension', 'ai_explanation', 'proposed_delta',
        'ai_confidence', 'status', 'confirmed_at', 'support_count', 'emitted_evidence_id', 'created_at',
      ]),
      policyExists('capture_interpretations', 'capint_self'),
      triggerExists('capture_interpretations', 'audit_capint'),
    ),
  },
  '003_evidence_extensions.sql': {
    presentSql: booleanQuery(anyColumnsExist('evidence_events', ['evidence_kind', 'local_date', 'candidate', 'evidence_mode'])),
    completeSql: booleanQuery(columnsExist('evidence_events', ['evidence_kind', 'local_date', 'candidate', 'evidence_mode'])),
  },
  '004_corrections_and_diary.sql': {
    presentSql: booleanQuery(anyColumnsExist('user_corrections', ['candidate_status', 'verified_at', 'candidate_evidence_id', 'source_type_ext'])),
    completeSql: booleanQuery(columnsExist('user_corrections', ['candidate_status', 'verified_at', 'candidate_evidence_id', 'source_type_ext'])),
  },
  '005_user_entitlement_tier.sql': {
    presentSql: booleanQuery(anyColumnsExist('users', ['entitlement_tier'])),
    completeSql: booleanQuery(columnsExist('users', ['entitlement_tier']), constraintExists('users_entitlement_tier_check')),
  },
  '2026-04-28-critical-consistency-fixes.sql': {
    presentSql: booleanQuery(constraintExists('conversation_reports_conversation_id_key')),
    completeSql: booleanQuery(constraintExists('conversation_reports_conversation_id_key')),
  },
  '2026-07-29-continuous-portrait-v1.sql': {
    presentSql: booleanQuery(tableExists('continuous_portraits')),
    completeSql: booleanQuery(
      ...[
        'governance_rule_versions', 'evidence_source_fragments', 'evidence_relationships',
        'continuous_portraits', 'portrait_revisions', 'portrait_dimension_states',
        'portrait_revision_evidence', 'observation_selection_runs', 'observation_candidates',
        'observation_claims', 'observation_claim_evidence', 'published_observations',
        'published_observation_revisions', 'observation_responses', 'correction_records',
        'correction_record_revisions', 'portrait_outbox', 'agent_scope_grants',
        'legacy_archetype_references', 'historical_report_references',
      ].map(tableExists),
      columnsExist('evidence_events', [
        'portrait_status', 'status_rule_id', 'context_key', 'source_revision', 'origin_operation_id',
        'quality_metadata', 'purpose_scope', 'updated_at',
      ]),
      viewExists('portrait_formal_evidence_v1'),
    ),
  },
  '2026-07-29-correction-command-idempotency.sql': {
    presentSql: booleanQuery(anyColumnsExist('correction_record_revisions', ['operation_id', 'request_fingerprint'])),
    completeSql: booleanQuery(
      columnsExist('correction_record_revisions', ['operation_id', 'request_fingerprint']),
      indexExists('idx_correction_revision_user_operation'),
    ),
  },
  '2026-07-30-theme-assessment-rounds.sql': {
    presentSql: booleanQuery(tableExists('theme_assessment_rounds')),
    completeSql: booleanQuery(
      ...[
        'theme_assessment_rounds', 'theme_assessment_round_items', 'theme_assessment_round_answers',
        'theme_assessment_result_revisions', 'theme_assessment_result_responses',
      ].map(tableExists),
      policyExists('theme_assessment_rounds', 'theme_rounds_self'),
      policyExists('theme_assessment_round_items', 'theme_round_items_self'),
      policyExists('theme_assessment_round_answers', 'theme_round_answers_self'),
      policyExists('theme_assessment_result_revisions', 'theme_result_revisions_self'),
      policyExists('theme_assessment_result_responses', 'theme_result_responses_self'),
    ),
  },
});

export function isMigrationFilename(filename) {
  return MIGRATION_FILENAME.test(filename);
}

/**
 * 归一化排序键 —— 修正裸 `.sort()` 的两处字典序歧义。
 *
 * 坑 1：`...-feedback-incremental.sql` 会排在 `...-feedback.sql` **之前**
 *   （比较到第 33 字符时 `-` 0x2D < `.` 0x2E），于是 incremental 里的
 *   `ALTER TABLE product_events` 在 feedback.sql 建表之前执行 → 空库迁移直接失败。
 * 坑 2：时间戳命名（`20260725120000_`）与日期命名（`2026-07-29-`）混排时，
 *   `-` 0x2D < `0` 0x30，会把所有时间戳文件排到日期文件之后。
 *
 * 做法：三种命名统一归一成「日期-时刻-名称」再比较。
 *   001_captures                      -> 0000-00-00-000-001_captures（恒排最前）
 *   20260725120000_dynamic_script     -> 2026-07-25-120000-dynamic_script
 *   2026-07-29-continuous-portrait-v1 -> 2026-07-29-continuous-portrait-v1
 *
 * 注意：键里保留去掉 `.sql` 的完整名，因此 `xxx.sql` 会排在
 * `xxx-incremental.sql` 之前（短名是前缀），顺序符合"先建表后改表"的直觉。
 */
export function migrationSortKey(filename) {
  const base = filename.replace(/\.sql$/, '');

  const stamped = base.match(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})_(.+)$/);
  if (stamped) {
    const [, y, mo, d, h, mi, s, rest] = stamped;
    return `${y}-${mo}-${d}-${h}${mi}${s}-${rest}`;
  }

  const numbered = base.match(/^(\d{3})_(.+)$/);
  if (numbered) return `0000-00-00-000-${numbered[1]}_${numbered[2]}`;

  return base;
}

/**
 * Sort migrations by their normalized filename key, then apply explicit
 * historical dependencies. Choosing the first ready item in the base order
 * keeps the result deterministic and limits ordering changes to the declared
 * dependency edges.
 */
export function orderMigrations(filenames) {
  const pending = new Set(filenames);
  const ordered = [];
  const baseOrder = [...filenames].sort((a, b) => {
    const ka = migrationSortKey(a);
    const kb = migrationSortKey(b);
    return ka < kb ? -1 : ka > kb ? 1 : 0;
  });

  for (const filename of baseOrder) {
    const dependencies = MIGRATION_DEPENDENCIES[filename] ?? [];
    for (const dependency of dependencies) {
      if (!pending.has(dependency) && !ordered.includes(dependency)) {
        throw new Error(`migration ${filename} depends on missing ${dependency}`);
      }
    }
  }

  while (pending.size > 0) {
    const next = baseOrder.find((filename) => {
      if (!pending.has(filename)) return false;
      return (MIGRATION_DEPENDENCIES[filename] ?? []).every((dependency) => ordered.includes(dependency));
    });

    if (!next) {
      const blocked = baseOrder.filter((filename) => pending.has(filename));
      throw new Error(`migration dependency cycle or unresolved dependency: ${blocked.join(', ')}`);
    }

    pending.delete(next);
    ordered.push(next);
  }

  return ordered;
}

export function sqlLiteral(value) {
  return `'${value.replaceAll("'", "''")}'`;
}

/**
 * Old migrations already contain BEGIN/COMMIT. The runner owns the outer
 * transaction so the migration body and ledger insert cannot diverge.
 */
export function stripOuterTransaction(sql) {
  return sql
    // Legacy files may place comments before their transaction marker. The
    // runner owns that transaction, so remove the first standalone marker
    // rather than emitting a nested BEGIN warning.
    .replace(/\bBEGIN\s*;\s*/i, '')
    .replace(/\s*COMMIT\s*;\s*$/i, '');
}

export function buildAtomicMigrationSql(content, filename, checksum) {
  const body = stripOuterTransaction(content);
  return [
    'BEGIN;',
    body,
    `INSERT INTO schema_migrations (filename, checksum, status) VALUES (${sqlLiteral(filename)}, ${sqlLiteral(checksum)}, 'applied');`,
    'COMMIT;',
  ].join('\n');
}

export function buildAdoptedMigrationSql(filename, checksum) {
  return `INSERT INTO schema_migrations (filename, checksum, status) VALUES (${sqlLiteral(filename)}, ${sqlLiteral(checksum)}, 'adopted');`;
}

export function isAcceptedLedgerStatus(status) {
  return ACCEPTED_LEDGER_STATUSES.has(status);
}

function runPsql(databaseUrl, args, options = {}) {
  return spawnSync('psql', [databaseUrl, '-v', 'ON_ERROR_STOP=1', ...args], {
    encoding: 'utf8',
    ...options,
  });
}

function readBooleanQuery(databaseUrl, sql, label) {
  const result = runPsql(databaseUrl, ['-t', '-A', '-c', sql], { stdio: ['pipe', 'pipe', 'pipe'] });
  if (result.status !== 0) {
    console.error(`[db:migrate] failed to inspect ${label}:`, result.stderr);
    process.exit(result.status ?? 1);
  }
  return result.stdout.trim() === 't';
}

function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error('[db:migrate] DATABASE_URL is required');
    process.exit(1);
  }

  const baselineExists = readBooleanQuery(databaseUrl, "SELECT to_regclass('public.users') IS NOT NULL;", 'database baseline');
  let appliedBaseline = false;

  if (!baselineExists) {
    const baselinePath = join(process.cwd(), 'packages', 'database', 'src', 'schema.sql');
    console.log('[db:migrate] applying schema baseline to an empty database');
    const baseline = runPsql(
      databaseUrl,
      [],
      { input: readFileSync(baselinePath, 'utf8'), stdio: ['pipe', 'inherit', 'inherit'] },
    );
    if (baseline.status !== 0) {
      console.error('[db:migrate] baseline failed; no versioned migrations were attempted');
      process.exit(baseline.status ?? 1);
    }
    appliedBaseline = true;
  }

  const initRes = runPsql(databaseUrl, ['-c', `
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename TEXT PRIMARY KEY,
      checksum TEXT NOT NULL,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      status TEXT NOT NULL DEFAULT 'applied'
    );
  `], { stdio: ['pipe', 'pipe', 'pipe'] });
  if (initRes.status !== 0) {
    console.error('[db:migrate] failed to initialize migration ledger:', initRes.stderr);
    process.exit(initRes.status ?? 1);
  }

  const queryRes = runPsql(
    databaseUrl,
    ['-t', '-A', '-F', '|', '-c', 'SELECT filename, checksum, status FROM schema_migrations;'],
    { stdio: ['pipe', 'pipe', 'pipe'] },
  );
  if (queryRes.status !== 0) {
    console.error('[db:migrate] failed to read migration ledger:', queryRes.stderr);
    process.exit(queryRes.status ?? 1);
  }

  const applied = new Map();
  for (const line of queryRes.stdout.trim().split('\n').filter(Boolean)) {
    const [filename, checksum, status] = line.split('|');
    applied.set(filename, { checksum, status });
  }

  const migrationDir = join(process.cwd(), 'packages', 'database', 'src', 'migrations');
  const ignored = [];
  const discovered = readdirSync(migrationDir)
    .filter((file) => file.endsWith('.sql'))
    .filter((file) => {
      const accepted = isMigrationFilename(file);
      if (!accepted) ignored.push(file);
      return accepted;
    });
  let files;
  try {
    files = orderMigrations(discovered);
  } catch (error) {
    console.error(`[db:migrate] invalid migration dependency graph: ${error.message}`);
    process.exit(1);
  }

  if (ignored.length > 0) {
    console.warn(`[db:migrate] ignoring non-canonical migration filenames: ${ignored.join(', ')}`);
  }

  // A pre-ledger installation can be recovered only if every adopted migration
  // has its complete, version-specific schema contract. Partial states stay
  // blocked so an operator never mistakes a damaged database for a migrated one.
  const ledgerIsEmpty = applied.size === 0;

  if (baselineExists && !appliedBaseline && ledgerIsEmpty && BASELINE_MODE) {
    if (!process.argv.includes('--confirm-baseline')) {
      console.error('[db:migrate] FATAL: --baseline requires --confirm-baseline (it asserts the existing schema already matches every local migration)');
      process.exit(1);
    }
    console.warn(`[db:migrate] BASELINE MODE: adopting ${files.length} local migrations into the ledger WITHOUT running DDL`);
    for (const filename of files) {
      const content = readFileSync(join(migrationDir, filename), 'utf8');
      const checksum = createHash('sha256').update(content).digest('hex');
      const adopted = runPsql(databaseUrl, ['-c', buildAdoptedMigrationSql(filename, checksum)], {
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      if (adopted.status !== 0) {
        console.error(`[db:migrate] failed to baseline ${filename}:`, adopted.stderr);
        process.exit(adopted.status ?? 1);
      }
      applied.set(filename, { checksum, status: 'adopted' });
    }
    console.log(`[db:migrate] baseline adopted for ${files.length} migrations; future migrations will apply normally`);
  }

  if (baselineExists && !appliedBaseline && ledgerIsEmpty && !BASELINE_MODE) {
    console.warn('[db:migrate] detected an existing database without a migration ledger; verifying adoptable migrations');
    for (const filename of files) {
      const contract = LEDGERLESS_MIGRATION_CONTRACTS[filename];
      if (!contract) {
        console.error(`[db:migrate] FATAL: ${filename} has no ledgerless-adoption contract`);
        process.exit(1);
      }

      const content = readFileSync(join(migrationDir, filename), 'utf8');
      const checksum = createHash('sha256').update(content).digest('hex');
      if (readBooleanQuery(databaseUrl, contract.completeSql, `${filename} completion contract`)) {
        const adopted = runPsql(databaseUrl, ['-c', buildAdoptedMigrationSql(filename, checksum)], {
          stdio: ['pipe', 'pipe', 'pipe'],
        });
        if (adopted.status !== 0) {
          console.error(`[db:migrate] failed to adopt ${filename}:`, adopted.stderr);
          process.exit(adopted.status ?? 1);
        }
        applied.set(filename, { checksum, status: 'adopted' });
        console.log(`[db:migrate] adopted verified ${filename}`);
      } else if (readBooleanQuery(databaseUrl, contract.presentSql, `${filename} partial-state contract`)) {
        console.error(`[db:migrate] FATAL: ${filename} is partially present in a ledgerless database; repair it before retrying`);
        process.exit(1);
      }
    }
  }

  for (const filename of files) {
    const content = readFileSync(join(migrationDir, filename), 'utf8');
    const checksum = createHash('sha256').update(content).digest('hex');
    const record = applied.get(filename);

    if (record) {
      if (record.checksum !== checksum || !isAcceptedLedgerStatus(record.status)) {
        console.error(`[db:migrate] FATAL: migration ledger mismatch for ${filename}`);
        process.exit(1);
      }
      console.log(`[db:migrate] skipping ${record.status} ${filename}`);
      continue;
    }

    console.log(`[db:migrate] applying ${filename} (${checksum.slice(0, 8)})`);
    const result = runPsql(
      databaseUrl,
      [],
      { input: buildAtomicMigrationSql(content, filename, checksum), stdio: ['pipe', 'inherit', 'inherit'] },
    );
    if (result.status !== 0) {
      console.error(`[db:migrate] transaction failed for ${filename}; no ledger entry was written`);
      process.exit(result.status ?? 1);
    }
  }

  console.log('[db:migrate] complete');
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main();
}
