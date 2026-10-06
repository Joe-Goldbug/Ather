#!/usr/bin/env bun
// packages/runtime-sentinel/bin/sentinel.ts
// CLI entry. Stays small — orchestration only, all logic lives in src/.

import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { runSentinel } from '../src/runner.ts';
import { loadProbes } from '../src/loader.ts';
import {
  writeReport,
  loadPreviousReport,
  printSummary,
  printRegressions,
  color,
} from '../src/reporter.ts';
import { compareReports } from '../src/diff.ts';
import { runPreflight, formatPreflightOutput } from '../src/preflight.ts';
import type { ProbeResult, SentinelReport } from '../src/types.ts';

interface Args {
  base: string;
  redisUrl?: string;
  probesPath?: string;
  options: Record<string, string | number | boolean>;
  autoDebug: boolean;
  jsonOnly: boolean;
  verbose: boolean;
  outDir: string;
  bugfixCommand: string;
  showHelp: boolean;
  skipPreflight: boolean;
}

function parseArgs(argv: string[]): Args {
  const get = (flag: string): string | undefined => {
    const idx = argv.indexOf(flag);
    return idx === -1 ? undefined : argv[idx + 1];
  };
  const has = (flag: string): boolean => argv.includes(flag);

  const base =
    get('--base') ??
    process.env.SENTINEL_BASE ??
    process.env.API_BASE ??
    process.env.VITE_API_BASE ??
    'http://localhost:3001';

  // Build a free-form options bag: every --foo bar becomes options.foo = bar.
  // Probe authors can read ctx.options.foo.
  const reserved = new Set([
    '--base', '--redis', '--probes', '--auto-debug', '--json',
    '--verbose', '-v', '--out', '--bugfix', '--help', '-h',
  ]);
  const options: Record<string, string | number | boolean> = {};
  for (let i = 0; i < argv.length; i++) {
    const tok = argv[i];
    if (!tok.startsWith('--') || reserved.has(tok)) continue;
    const key = tok.slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith('--')) {
      options[key] = true;
    } else {
      const num = Number(next);
      options[key] = Number.isFinite(num) && next.trim() !== '' ? num : next;
      i++;
    }
  }

  return {
    base,
    redisUrl: get('--redis') ?? process.env.REDIS_URL,
    probesPath: get('--probes'),
    options,
    autoDebug: has('--auto-debug'),
    jsonOnly: has('--json'),
    verbose: has('--verbose') || has('-v'),
    outDir: get('--out') ?? resolve(process.cwd(), 'reports'),
    bugfixCommand: get('--bugfix') ?? 'bun run scripts/bugfix/loop.ts --auto',
    showHelp: has('--help') || has('-h'),
    skipPreflight: has('--skip-preflight'),
  };
}

function printHelp(): void {
  console.log(`
Runtime Sentinel — project-agnostic runtime smoke + drift detector

Usage:
  sentinel [options]                Run probes from <project>/.sentinel/probes.ts
  sentinel --probes <file>          Load probes from a specific file
  sentinel --base <url>             Target API base URL (default: localhost:3001)
  sentinel --redis <url>            Redis URL for helpers (default: REDIS_URL env)
  sentinel --auto-debug             On failure, hand off to project bugfix command
  sentinel --bugfix '<cmd>'         Bugfix command to spawn (default: bugfix/loop --auto)
  sentinel --json                   Emit JSON report to stdout (CI mode)
  sentinel --out <dir>              Report output directory (default: ./reports)
  sentinel --skip-preflight         Skip environment diagnostics
  sentinel -v, --verbose            Verbose probe logs
  sentinel --help                   Show this help

Pass-through flags:
  Any other --key value pair becomes ctx.options.<key> for probes to consume.
  e.g.  sentinel --turns 8         →  ctx.options.turns === 8

Exit codes:
  0  All green (or only skips)
  1  At least one probe failed
  2  Runner crashed (probe file invalid, etc.)
`);
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const args = parseArgs(argv);

  if (args.showHelp) {
    printHelp();
    process.exit(0);
  }

  let probes;
  let probesSource: string | undefined;
  try {
    const result = await loadProbes({ explicitPath: args.probesPath });
    probes = result.probes;
    probesSource = result.source;
  } catch (err) {
    console.error(color.red(`[sentinel] failed to load probes: ${(err as Error).message}`));
    process.exit(2);
  }

  if (!args.jsonOnly) {
    console.log(color.cyan('\n🛰  Runtime Sentinel'));
    console.log(color.gray(`    base    = ${args.base}`));
    if (args.redisUrl) console.log(color.gray(`    redis   = ${args.redisUrl}`));
    console.log(color.gray(`    probes  = ${probesSource ?? '(default — health only)'}`));
    console.log(color.gray(`    plan    = ${probes.length} probes`));
    if (args.autoDebug) console.log(color.yellow('    auto-debug = ON'));
    console.log('');
  }

  // ── Preflight diagnostics ────────────────────────────────────────────────
  if (!args.skipPreflight && !args.jsonOnly) {
    const preflight = await runPreflight({
      base: args.base,
      redisUrl: args.redisUrl,
      outDir: args.outDir,
      verbose: args.verbose,
    });
    console.log(formatPreflightOutput(preflight, args.verbose));

    if (!preflight.ready) {
      console.error(color.red('[sentinel] environment not ready — fix failures above or use --skip-preflight'));
      process.exit(2);
    }

    // Warn about Redis missing (won't block, but OTP probes will fail)
    const redisCheck = preflight.checks.find((c) => c.name === 'Redis');
    if (redisCheck?.status === 'warn' && !args.redisUrl) {
      console.log(color.yellow('  ⚠  Redis not configured — OTP probes will fail'));
      console.log(color.gray('     Pass --redis <url> or set REDIS_URL to enable\n'));
    }
  }

  const onProbe = (r: ProbeResult): void => {
    if (args.jsonOnly) return;
    const tag =
      r.status === 'pass' ? color.green('  PASS')
      : r.status === 'fail' ? color.red('  FAIL')
      : color.yellow('  SKIP');
    const ms = color.gray(`${String(r.duration_ms).padStart(5)}ms`);
    console.log(`${tag} ${ms}  ${r.label}`);
    if (r.status === 'fail' && r.error) {
      console.log(color.red(`         ↳ ${r.error}`));
      if (r.hint) console.log(color.cyan(`         ↳ hint: ${r.hint}`));
    }
  };

  let report: SentinelReport;
  try {
    report = await runSentinel({
      base: args.base,
      redisUrl: args.redisUrl,
      probes,
      options: args.options,
      verbose: args.verbose,
      onProbe,
    });
  } catch (err) {
    console.error(color.red(`\n[sentinel] runner crashed: ${(err as Error).message}`));
    process.exit(2);
  }

  // Diff vs previous report (same outDir) before we overwrite latest.
  const prev = loadPreviousReport(args.outDir);
  report.regressions = prev && prev.base === report.base
    ? compareReports(prev, report)
    : [];

  const { jsonPath, latestPath } = writeReport(report, { outDir: args.outDir });

  if (args.jsonOnly) {
    process.stdout.write(JSON.stringify(report, null, 2) + '\n');
  } else {
    printSummary(report);
    printRegressions(report.regressions ?? []);
    console.log(color.gray(`  report: ${jsonPath}`));
    if (latestPath) console.log(color.gray(`  latest: ${latestPath}\n`));
  }

  // Auto-debug bridge — fail-only, opt-in.
  if (report.summary.fail > 0 && args.autoDebug) {
    if (!args.jsonOnly) {
      console.log(color.yellow(`\n⚙  Forwarding to bugfix: ${args.bugfixCommand}\n`));
    }
    const [bin, ...rest] = args.bugfixCommand.split(' ');
    const r = spawnSync(bin, rest, { cwd: process.cwd(), stdio: 'inherit', timeout: 600_000 });
    process.exit(r.status ?? 1);
  }

  process.exit(report.summary.fail === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(color.red(`\n[sentinel] fatal: ${(err as Error).message}`));
  process.exit(2);
});
