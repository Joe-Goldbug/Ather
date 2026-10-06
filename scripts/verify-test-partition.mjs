#!/usr/bin/env node
/**
 * 测试分区校验 —— 防止测试文件掉进 jest / vitest 之间的缝隙
 *
 * 背景
 * ----
 * apps/api 同时使用两个测试框架，且此前两侧的执行清单都是**手工枚举**：
 *   jest   → --testPathIgnorePatterns='a|b|c|d'
 *   vitest → 显式列出一串文件路径
 * 新增的 profile-withdraw.test.ts（vitest 风格）既没被加进 vitest 清单，
 * 又落在 jest 的 testPath 内 → jest 会执行它，并以
 * "Vitest cannot be imported in a CommonJS module" 失败（本地 + CI 全平台）。
 *
 * 现在改为**约定驱动**，且由本脚本机器校验：
 *   .spec.ts        → jest
 *   .test.ts/.tsx   → vitest
 *   .spec.tsx       → vitest（例外：React Email 模板需要 vitest 的 JSX 管线）
 *
 * 断言的不变量（任一失败 → exit 1）
 * --------------------------------
 *   I1  jest 实际收集的文件集合 == 约定中的 jest 集合
 *   I2  vitest 实际收集的文件集合 == 约定中的 vitest 集合
 *   I3  每个测试文件都被恰好一个 runner 认领（无重叠、无孤儿）
 *   I4  jest 的 ignore 参数仍保留 /node_modules/ 与 /dist/
 *       —— 命令行 --testPathIgnorePatterns 会**整体覆盖** jest.config.js 的同名配置，
 *          漏掉这两项就会把依赖/产物目录卷进测试扫描。
 *   I5  jest 认领的文件里没有 import 'vitest' 或 'bun:test'（缝隙 bug 的内容级兜底）
 *
 * 参数取自 package.json 的真实脚本，因此也能捕获"脚本被改坏"的漂移。
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const API_SRC = join(ROOT, 'apps', 'api', 'src');
const SKIP_DIRS = new Set(['node_modules', 'dist', 'coverage', '.worktrees', '.git', '.claude']);

const isTestTs = /\.test\.tsx?$/; // vitest
const isSpecTsx = /\.spec\.tsx$/; // vitest（例外）
const isSpecTs = /\.spec\.ts$/; // jest

const failures = [];
const notes = [];

// ── 1. 枚举真实测试文件 ─────────────────────────────────────────────────────
function walk(dir, acc = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      walk(join(dir, entry.name), acc);
    } else if (isTestTs.test(entry.name) || isSpecTsx.test(entry.name) || isSpecTs.test(entry.name)) {
      acc.push(join(dir, entry.name));
    }
  }
  return acc;
}

const rel = (p) => relative(ROOT, p).split(sep).join('/');
const allTestFiles = walk(API_SRC).map(rel).sort();
const expectedVitest = allTestFiles
  .filter((f) => isTestTs.test(f) || isSpecTsx.test(f))
  .sort();
const expectedJest = allTestFiles.filter((f) => isSpecTs.test(f)).sort();

// ── 2. 读取 package.json 的真实脚本参数 ─────────────────────────────────────
const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
const jestScript = pkg.scripts['test:api:jest'] ?? '';
const vitestScript = pkg.scripts['test:api:vitest'] ?? '';

const unquote = (s) => (s ?? '').replace(/^['"]|['"]$/g, '');
const jestPathArg = jestScript.match(/\bjest\s+(\S+)/)?.[1] ?? 'src';
const jestIgnore = unquote(
  jestScript.match(/--testPathIgnorePatterns=(?:'([^']*)'|"([^"]*)"|(\S+))/)?.slice(1).find(Boolean),
);
const vitestDir = unquote(vitestScript.match(/--dir\s+(?:'([^']*)'|"([^"]*)"|(\S+))/)?.slice(1).find(Boolean));
const vitestExclude = unquote(
  vitestScript.match(/--exclude\s+(?:'([^']*)'|"([^"]*)"|(\S+))/)?.slice(1).find(Boolean),
);

// ── 3. 向两个 runner 索取真实收集清单（不执行测试）───────────────────────────
const bin = (relPath) => {
  const candidate = join(ROOT, relPath);
  try {
    readFileSync(candidate);
    return candidate;
  } catch {
    return null;
  }
};

function jestCollected() {
  const jestBin = bin('node_modules/jest/bin/jest.js') ?? bin('apps/api/node_modules/jest/bin/jest.js');
  if (!jestBin) {
    notes.push('jest 可执行入口未找到，I1/I5 跳过（请先 bun install）');
    return null;
  }
  const out = execFileSync(
    process.execPath,
    [jestBin, jestPathArg, '--listTests', `--testPathIgnorePatterns=${jestIgnore}`],
    { cwd: join(ROOT, 'apps', 'api'), encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 },
  );
  return out
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map(rel)
    .sort();
}

function vitestCollected() {
  const vitestBin = bin('node_modules/vitest/vitest.mjs') ?? bin('apps/api/node_modules/vitest/vitest.mjs');
  if (!vitestBin) {
    notes.push('vitest 可执行入口未找到，I2 跳过（请先 bun install）');
    return null;
  }
  const args = [vitestBin, 'list', '--json'];
  if (vitestDir) args.push('--dir', vitestDir);
  if (vitestExclude) args.push('--exclude', vitestExclude);
  const out = execFileSync(process.execPath, args, {
    cwd: ROOT,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  const start = out.indexOf('[');
  const entries = JSON.parse(out.slice(start));
  return [...new Set(entries.map((e) => rel(e.file)))].sort();
}

const jestActual = jestCollected();
const vitestActual = vitestCollected();

// ── 4. 校验 ────────────────────────────────────────────────────────────────
const diff = (a, b) => a.filter((x) => !b.includes(x));

if (jestActual) {
  const missing = diff(expectedJest, jestActual);
  const extra = diff(jestActual, expectedJest);
  if (missing.length || extra.length) {
    failures.push(
      `I1 jest 收集集合与约定不符\n` +
        (missing.length ? `   未被 jest 收集（约定应属于 jest）:\n${missing.map((f) => `     - ${f}`).join('\n')}\n` : '') +
        (extra.length ? `   被 jest 收集但不属于约定:\n${extra.map((f) => `     - ${f}`).join('\n')}` : ''),
    );
  }
}

if (vitestActual) {
  const missing = diff(expectedVitest, vitestActual);
  const extra = diff(vitestActual, expectedVitest);
  if (missing.length || extra.length) {
    failures.push(
      `I2 vitest 收集集合与约定不符\n` +
        (missing.length ? `   未被 vitest 收集:\n${missing.map((f) => `     - ${f}`).join('\n')}\n` : '') +
        (extra.length ? `   被 vitest 收集但不属于约定:\n${extra.map((f) => `     - ${f}`).join('\n')}` : ''),
    );
  }
}

const jestSet = jestActual ?? expectedJest;
const vitestSet = vitestActual ?? expectedVitest;
const overlap = jestSet.filter((f) => vitestSet.includes(f));
if (overlap.length) {
  failures.push(`I3 以下文件被两个 runner 同时认领:\n${overlap.map((f) => `     - ${f}`).join('\n')}`);
}
const orphans = allTestFiles.filter((f) => !jestSet.includes(f) && !vitestSet.includes(f));
if (orphans.length) {
  failures.push(
    `I3 以下测试文件无人认领（永远不会被执行）:\n${orphans.map((f) => `     - ${f}`).join('\n')}`,
  );
}

for (const required of ['/node_modules/', '/dist/']) {
  if (!jestIgnore.includes(required)) {
    failures.push(
      `I4 jest ignore 参数缺少 ${required}（CLI 参数会覆盖 jest.config.js，漏掉会扫描依赖/产物目录）`,
    );
  }
}

if (jestActual) {
  for (const file of jestActual) {
    const src = readFileSync(join(ROOT, file), 'utf8');
    // 掉缝的两种历史形态：
    //   1) 从 'vitest' 导入  → profile-withdraw.test.ts（曾被 jest 执行）
    //   2) 从 'bun:test' 导入 → script-generator.service.spec.ts /
    //      dynamic-script-integration.spec.ts（仓库内没有 bun test 脚本收集它们，
    //      却被 jest 执行并报 Cannot find module 'bun:test'）
    const foreign = src.match(/from\s+['"](vitest|bun:test)['"]|require\(\s*['"](vitest|bun:test)['"]\s*\)/);
    if (foreign) {
      failures.push(
        `I5 ${file} 使用了 '${foreign[1] ?? foreign[2]}' 导入，但会被 jest 执行` +
          `（这正是掉缝的形态：改成 jest 风格（@jest/globals），或按约定改名让 vitest 收集）`,
      );
    }
  }
}

// ── 5. 输出 ────────────────────────────────────────────────────────────────
console.log('[test:partition] 测试文件分区校验');
console.log(`  jest   约定 ${expectedJest.length} 个${jestActual ? ` / 实际收集 ${jestActual.length} 个` : ''}`);
console.log(`  vitest 约定 ${expectedVitest.length} 个${vitestActual ? ` / 实际收集 ${vitestActual.length} 个` : ''}`);
for (const n of notes) console.log(`  ! ${n}`);

if (failures.length) {
  console.error('\n[test:partition] FAIL\n');
  for (const f of failures) console.error(`  ✗ ${f}\n`);
  process.exit(1);
}
console.log('\n[test:partition] PASS — 无重叠、无孤儿、无 vitest 文件混入 jest');
