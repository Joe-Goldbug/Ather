#!/usr/bin/env bun
// packages/runtime-sentinel/bin/sentinel-quick-v2.ts
// Phase 1 改进版：集成重试、增强诊断、改进输出
// 使用方式: bun run sentinel:quick-v2 [--redis <url>] [--base <url>] [--no-retry]

import { resolve } from 'node:path';
import { runSentinel } from '../src/runner.ts';
import { loadProbes } from '../src/loader.ts';
import { runPreflight, formatPreflightOutput } from '../src/preflight.ts';
import { getAutoFixSuggestions, classifyError } from '../src/error-classifier.ts';
import { withRetry, DEFAULT_RETRY_CONFIG } from '../src/retry.ts';
import {
  writeReport,
  loadPreviousReport,
  printRegressions,
  color,
} from '../src/reporter.ts';
import { compareReports } from '../src/diff.ts';
import type { ProbeResult } from '../src/types.ts';

// ── 参数解析 ────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const get = (flag: string): string | undefined => {
  const idx = argv.indexOf(flag);
  return idx === -1 ? undefined : argv[idx + 1];
};
const has = (flag: string): boolean => argv.includes(flag);

if (has('--help') || has('-h')) {
  console.log(`
Runtime Sentinel — Quick Start (v2 with retry)

Usage:
  sentinel:quick-v2 [options]

Options:
  --base <url>       API base (default: localhost:3001 / API_BASE / VITE_API_BASE)
  --redis <url>      Redis URL for OTP helpers (default: REDIS_URL)
  --out <dir>        Report directory (default: ./reports)
  --turns <n>        Chat turns (default: 6)
  --no-retry         Disable automatic retry on transient failures
  -v, --verbose      Verbose logs
  --help             Show this help

Features:
  • Automatic environment diagnostics with retry
  • Smart error classification and fix suggestions
  • Colored output with progress indicators
  • Detailed failure analysis
`);
  process.exit(0);
}

const base =
  get('--base') ??
  process.env.SENTINEL_BASE ??
  process.env.API_BASE ??
  process.env.VITE_API_BASE ??
  'http://localhost:3001';

const redisUrl = get('--redis') ?? process.env.REDIS_URL;
const outDir = get('--out') ?? resolve(process.cwd(), 'reports');
const verbose = has('-v') || has('--verbose');
const turns = get('--turns') ? Number(get('--turns')) : 6;
const autoRetry = !has('--no-retry');

// ── 颜色和格式化工具 ────────────────────────────────────────────────────────
const icons = {
  pass: '✅',
  fail: '❌',
  skip: '⏭️ ',
  warn: '⚠️ ',
  info: 'ℹ️ ',
  rocket: '🚀',
  gear: '🔧',
  chart: '📊',
  report: '📄',
  step: '📋',
};

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function formatProbeStatus(status: string, duration: number): string {
  const icon = status === 'pass' ? icons.pass : status === 'fail' ? icons.fail : icons.skip;
  const ms = String(duration).padStart(5);
  return `${icon} ${ms}ms`;
}

// ── 主程序 ──────────────────────────────────────────────────────────────────
async function main(): Promise<void> {
  // Banner
  console.log('');
  console.log(color.cyan(`${icons.rocket} Runtime Sentinel — Quick Start (v2)`));
  console.log(color.gray(`   base  = ${base}`));
  if (redisUrl) console.log(color.gray(`   redis = ${redisUrl}`));
  if (autoRetry) console.log(color.gray(`   retry = enabled`));
  console.log('');

  // ── Step 1: 环境诊断（带重试）────────────────────────────────────────────
  console.log(color.cyan(`${icons.step} Step 1/3  Environment Diagnostics`));
  console.log('');

  let preflight;
  if (autoRetry) {
    const result = await withRetry(
      () => runPreflight({ base, redisUrl, outDir, verbose }),
      { ...DEFAULT_RETRY_CONFIG, verbose }
    );

    if (!result.success) {
      console.log(color.red(`${icons.fail} Preflight failed after ${result.attempts} attempts`));
      console.log(color.gray(`   Error: ${result.error?.message}`));
      console.log('');

      // 显示修复建议
      if (result.classification) {
        const fixes = getAutoFixSuggestions(result.classification);
        if (fixes.length > 0) {
          console.log(color.yellow(`${icons.gear} Auto-fix suggestions:\n`));
          for (const fix of fixes) {
            const riskIcon = fix.riskLevel === 'low' ? '✅' : fix.riskLevel === 'medium' ? '⚠️ ' : '🔴';
            console.log(color.gray(`  ${riskIcon} ${fix.description}`));
            console.log(color.gray(`     $ ${fix.command}`));
          }
          console.log('');
        }
      }

      process.exit(1);
    }

    preflight = result.value!;
  } else {
    preflight = await runPreflight({ base, redisUrl, outDir, verbose });
  }

  console.log(formatPreflightOutput(preflight, verbose));

  if (!preflight.ready) {
    console.log(color.red(`${icons.fail} Environment not ready. Fix issues above and retry.\n`));
    process.exit(1);
  }

  // ── Step 2: 加载探针 ────────────────────────────────────────────────────
  console.log(color.cyan(`${icons.step} Step 2/3  Loading Probes`));
  console.log('');

  let probes;
  let probesSource: string | undefined;
  try {
    const result = await loadProbes({});
    probes = result.probes;
    probesSource = result.source;
    console.log(color.green(`  ${icons.pass} ${probes.length} probes loaded`));
    console.log(color.gray(`     from: ${probesSource ?? '(default)'}`));
    console.log('');
  } catch (err) {
    console.log(color.red(`  ${icons.fail} Failed to load probes: ${(err as Error).message}`));
    console.log('');
    process.exit(1);
  }

  // ── Step 3: 运行探针 ────────────────────────────────────────────────────
  console.log(color.cyan(`${icons.step} Step 3/3  Running Probes`));
  console.log('');

  const failedProbes: ProbeResult[] = [];
  const startTime = Date.now();

  const onProbe = (r: ProbeResult): void => {
    const status = formatProbeStatus(r.status, r.duration_ms);
    console.log(`${status}  ${r.label}`);

    if (r.status === 'fail') {
      failedProbes.push(r);
      if (r.error) console.log(color.red(`         ↳ ${r.error}`));
      if (r.hint) console.log(color.cyan(`         ↳ hint: ${r.hint}`));
    }
  };

  const report = await runSentinel({
    base,
    redisUrl,
    probes,
    options: { turns },
    verbose,
    onProbe,
  });

  const totalTime = Date.now() - startTime;

  // ── 对比上一次报告 ──────────────────────────────────────────────────────
  const prev = loadPreviousReport(outDir);
  report.regressions = prev && prev.base === report.base
    ? compareReports(prev, report)
    : [];

  // ── 保存报告 ────────────────────────────────────────────────────────────
  const { jsonPath } = writeReport(report, { outDir });

  console.log('');

  // ── 摘要 ────────────────────────────────────────────────────────────────
  const { pass, fail, skip, total } = report.summary;
  const summaryLine = [
    color.green(`Pass ${pass}`),
    fail > 0 ? color.red(`Fail ${fail}`) : color.gray(`Fail ${fail}`),
    color.yellow(`Skip ${skip}`),
    color.gray(`Total ${total}`),
    color.gray(`(${formatDuration(totalTime)})`),
  ].join('  ');
  console.log(`  ${summaryLine}`);

  // ── 漂移检测 ────────────────────────────────────────────────────────────
  if (report.regressions && report.regressions.length > 0) {
    printRegressions(report.regressions);
  }

  // ── 失败分析和修复建议 ──────────────────────────────────────────────────
  if (failedProbes.length > 0) {
    console.log('');
    console.log(color.yellow(`${icons.gear} Fix suggestions:\n`));

    for (const probe of failedProbes) {
      if (!probe.error) continue;

      const classification = classifyError(probe.error);
      const fixes = getAutoFixSuggestions(classification);

      console.log(color.bold(`  ${probe.id}`));
      console.log(color.gray(`    Category: ${classification.category}`));

      if (probe.hint) {
        console.log(color.cyan(`    💡 ${probe.hint}`));
      }

      console.log(color.gray(`    → ${classification.suggestion}`));

      if (fixes.length > 0) {
        console.log(color.gray(`    Suggested fixes:`));
        for (const fix of fixes) {
          const riskIcon = fix.riskLevel === 'low' ? '✅' : fix.riskLevel === 'medium' ? '⚠️ ' : '🔴';
          console.log(color.gray(`      ${riskIcon} ${fix.description}`));
          console.log(color.gray(`         $ ${fix.command}`));
        }
      }

      console.log('');
    }
  }

  // ── 报告位置 ────────────────────────────────────────────────────────────
  console.log(color.gray(`${icons.report} Report saved to: ${jsonPath}`));
  console.log('');

  process.exit(report.summary.fail === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(color.red(`${icons.fail} Fatal error: ${err.message}`));
  if (verbose) {
    console.error(err);
  }
  process.exit(2);
});
