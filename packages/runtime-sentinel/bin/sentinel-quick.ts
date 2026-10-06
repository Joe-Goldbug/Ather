#!/usr/bin/env bun
// packages/runtime-sentinel/bin/sentinel-quick.ts
// Quick-start: diagnose environment, then run probes with smart defaults.
// Usage: bun run sentinel:quick [--redis <url>] [--base <url>]

import { resolve } from 'node:path';
import { runSentinel } from '../src/runner.ts';
import { loadProbes } from '../src/loader.ts';
import { runPreflight, formatPreflightOutput } from '../src/preflight.ts';
import { getAutoFixSuggestions, classifyError } from '../src/error-classifier.ts';
import {
  writeReport,
  loadPreviousReport,
  printRegressions,
  color,
} from '../src/reporter.ts';
import { compareReports } from '../src/diff.ts';
import type { ProbeResult } from '../src/types.ts';

// ── Parse minimal args ───────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const get = (flag: string): string | undefined => {
  const idx = argv.indexOf(flag);
  return idx === -1 ? undefined : argv[idx + 1];
};
const has = (flag: string): boolean => argv.includes(flag);
const showHelp = has('--help') || has('-h');

if (showHelp) {
  console.log(`
Runtime Sentinel — Quick Start

Usage:
  sentinel:quick [options]

Options:
  --base <url>       API base (default: localhost:3001 / API_BASE / VITE_API_BASE)
  --redis <url>      Redis URL for OTP helpers (default: REDIS_URL)
  --out <dir>        Report directory (default: ./reports)
  --turns <n>        Override probe turns passed through as ctx.options.turns
  -v, --verbose      Verbose logs
  --help             Show this help

Behavior:
  1. Run environment diagnostics
  2. Load probes from .sentinel/probes.ts or fallback health probe
  3. Run probes and write reports/sentinel-latest.json
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

// ── Banner ───────────────────────────────────────────────────────────────────
console.log(color.cyan('\n🛰  Runtime Sentinel — Quick Start'));
console.log(color.gray(`   base  = ${base}`));
if (redisUrl) console.log(color.gray(`   redis = ${redisUrl}`));
console.log('');

// ── Step 1: Preflight ────────────────────────────────────────────────────────
console.log(color.cyan('Step 1/3  Environment Diagnostics'));
const preflight = await runPreflight({ base, redisUrl, outDir, verbose });
console.log(formatPreflightOutput(preflight, verbose));

if (!preflight.ready) {
  // Show auto-fix suggestions for each failed check
  const failedChecks = preflight.checks.filter((c) => c.status === 'fail');
  if (failedChecks.length > 0) {
    console.log(color.yellow('🔧 Auto-fix suggestions:\n'));
    for (const check of failedChecks) {
      const classification = classifyError(check.message);
      const fixes = getAutoFixSuggestions(classification);
      if (fixes.length > 0) {
        console.log(color.bold(`  ${check.name}:`));
        for (const fix of fixes) {
          console.log(color.gray(`    $ ${fix.command}`));
          console.log(color.gray(`      ${fix.description}`));
        }
        console.log('');
      }
    }
  }
  console.log(color.red('⛔ Cannot run probes — fix environment issues above\n'));
  process.exit(2);
}

// ── Step 2: Load probes ──────────────────────────────────────────────────────
console.log(color.cyan('Step 2/3  Loading Probes'));
let probes;
let probesSource: string | undefined;
try {
  const result = await loadProbes({});
  probes = result.probes;
  probesSource = result.source;
  console.log(color.green(`  ✅ ${probes.length} probes loaded`));
  console.log(color.gray(`     from: ${probesSource ?? '(default)'}\n`));
} catch (err) {
  console.error(color.red(`  ❌ Failed to load probes: ${(err as Error).message}\n`));
  process.exit(2);
}

// ── Step 3: Run probes ───────────────────────────────────────────────────────
console.log(color.cyan('Step 3/3  Running Probes\n'));

const failedProbes: ProbeResult[] = [];

const onProbe = (r: ProbeResult): void => {
  const tag =
    r.status === 'pass' ? color.green('  PASS')
    : r.status === 'fail' ? color.red('  FAIL')
    : color.yellow('  SKIP');
  const ms = color.gray(`${String(r.duration_ms).padStart(5)}ms`);
  console.log(`${tag} ${ms}  ${r.label}`);

  if (r.status === 'fail') {
    failedProbes.push(r);
    if (r.error) console.log(color.red(`         ↳ ${r.error}`));
    if (r.hint)  console.log(color.cyan(`         ↳ hint: ${r.hint}`));
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

// Diff vs previous
const prev = loadPreviousReport(outDir);
report.regressions = prev && prev.base === report.base
  ? compareReports(prev, report)
  : [];

const { jsonPath } = writeReport(report, { outDir });

console.log('');
// Print compact summary line (not full probe list — already printed via onProbe)
const { pass, fail, skip, total } = report.summary;
const line = [
  color.green(`Pass ${pass}`),
  color.red(`Fail ${fail}`),
  color.yellow(`Skip ${skip}`),
  color.gray(`Total ${total}`),
  color.gray(`(${report.duration_ms}ms)`),
].join('  ');
console.log(`\n  ${line}`);
printRegressions(report.regressions ?? []);

// ── Auto-fix suggestions for failures ────────────────────────────────────────
if (failedProbes.length > 0) {
  console.log(color.yellow('\n🔧 Fix suggestions:\n'));
  for (const probe of failedProbes) {
    if (!probe.error) continue;
    const classification = classifyError(probe.error);
    const fixes = getAutoFixSuggestions(classification);
    console.log(color.bold(`  ${probe.id} (${classification.category}):`));
    if (probe.hint) {
      console.log(color.cyan(`    💡 ${probe.hint}`));
    }
    console.log(color.gray(`    → ${classification.suggestion}`));
    for (const fix of fixes) {
      console.log(color.gray(`    $ ${fix.command}`));
    }
    console.log('');
  }
}

console.log(color.gray(`  report: ${jsonPath}\n`));

process.exit(report.summary.fail === 0 ? 0 : 1);
