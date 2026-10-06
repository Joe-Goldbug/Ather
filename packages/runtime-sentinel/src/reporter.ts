// packages/runtime-sentinel/src/reporter.ts
// Console + JSON output for SentinelReport.

import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import type { SentinelReport } from './types.js';
import type { RegressionFinding } from './diff.js';

// ── ANSI ─────────────────────────────────────────────────────────────────────
const isTTY = Boolean(process.stdout.isTTY) && !process.env.NO_COLOR;
const c = (code: string, s: string): string => (isTTY ? `\x1b[${code}m${s}\x1b[0m` : s);
export const color = {
  green: (s: string) => c('32', s),
  red:   (s: string) => c('31', s),
  yellow:(s: string) => c('33', s),
  cyan:  (s: string) => c('36', s),
  gray:  (s: string) => c('90', s),
  bold:  (s: string) => c('1', s),
};

// ── Disk ─────────────────────────────────────────────────────────────────────
export interface WriteReportOptions {
  /** Output directory; created if missing. Default: <cwd>/reports */
  outDir?: string;
  /** Also write `<outDir>/sentinel-latest.json`. Default true. */
  writeLatest?: boolean;
}

export function writeReport(
  report: SentinelReport,
  opts: WriteReportOptions = {},
): { jsonPath: string; latestPath?: string } {
  const outDir = opts.outDir ?? resolve(process.cwd(), 'reports');
  if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });
  const stamp = report.generated_at.replace(/[:.]/g, '-');
  const jsonPath = join(outDir, `sentinel-snapshot-${stamp}.json`);
  const payload = JSON.stringify(report, null, 2);
  writeFileSync(jsonPath, payload);
  let latestPath: string | undefined;
  if (opts.writeLatest !== false) {
    latestPath = join(outDir, 'sentinel-latest.json');
    writeFileSync(latestPath, payload);
  }
  return { jsonPath, latestPath };
}

export function loadPreviousReport(outDir?: string): SentinelReport | null {
  const dir = outDir ?? resolve(process.cwd(), 'reports');
  const p = join(dir, 'sentinel-latest.json');
  if (!existsSync(p)) return null;
  try {
    return JSON.parse(readFileSync(p, 'utf-8')) as SentinelReport;
  } catch {
    return null;
  }
}

// ── Console ──────────────────────────────────────────────────────────────────
export function printSummary(report: SentinelReport): void {
  const { pass, fail, skip, total } = report.summary;
  console.log('');
  for (const p of report.probes) {
    const tag =
      p.status === 'pass' ? color.green('PASS')
      : p.status === 'fail' ? color.red('FAIL')
      : color.yellow('SKIP');
    const ms = color.gray(`${String(p.duration_ms).padStart(5)}ms`);
    console.log(`  ${tag}  ${ms}  ${p.label}`);
    if (p.status === 'fail' && p.error) {
      console.log(color.red(`         ↳ ${p.error}`));
      if (p.hint) console.log(color.cyan(`         ↳ hint: ${p.hint}`));
    } else if (p.status === 'skip' && p.error) {
      console.log(color.yellow(`         ↳ ${p.error}`));
    }
  }
  const line = [
    color.green(`Pass ${pass}`),
    color.red(`Fail ${fail}`),
    color.yellow(`Skip ${skip}`),
    color.gray(`Total ${total}`),
    color.gray(`(${report.duration_ms}ms)`),
  ].join('  ');
  console.log(`\n  ${line}\n`);
}

export function printRegressions(findings: RegressionFinding[]): void {
  if (findings.length === 0) {
    console.log(color.gray('  (无 vs 上一次的退化点)\n'));
    return;
  }
  console.log(color.bold(color.yellow('  ⚠ 发现退化:')));
  for (const f of findings) {
    const tag =
      f.kind === 'status'  ? color.red('STATUS ')
      : f.kind === 'latency' ? color.yellow('LATENCY')
      : color.cyan('DETAIL ');
    console.log(`  ${tag}  ${f.label}`);
    console.log(color.gray(`           ${f.note}`));
  }
  console.log('');
}
