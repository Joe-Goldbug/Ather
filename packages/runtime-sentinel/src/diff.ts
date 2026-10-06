// packages/runtime-sentinel/src/diff.ts
// Compare current SentinelReport against a previous one.
// Generic — knows nothing about the project's domain.
// Project-specific drift can still be expressed via probe `details` (see EVA).

import type { ProbeStatus, SentinelReport } from './types.js';

export interface RegressionFinding {
  id: string;
  label: string;
  kind: 'status' | 'latency' | 'detail';
  before?: ProbeStatus;
  after: ProbeStatus;
  before_ms?: number;
  after_ms?: number;
  note: string;
}

const LATENCY_GROW_PCT = 0.5; // > 50% slower than last run
const LATENCY_MIN_MS = 200;   // ignore noise below this

export function compareReports(prev: SentinelReport, curr: SentinelReport): RegressionFinding[] {
  const findings: RegressionFinding[] = [];
  const prevById = new Map(prev.probes.map((p) => [p.id, p] as const));

  for (const after of curr.probes) {
    const before = prevById.get(after.id);
    if (!before) continue;

    if (before.status === 'pass' && after.status === 'fail') {
      findings.push({
        id: after.id, label: after.label, kind: 'status',
        before: before.status, after: after.status,
        note: '上次通过，本次失败',
      });
    } else if (before.status === 'skip' && after.status === 'fail') {
      findings.push({
        id: after.id, label: after.label, kind: 'status',
        before: before.status, after: after.status,
        note: '上次跳过，本次失败（端点开始报错）',
      });
    } else if (before.status === 'pass' && after.status === 'skip') {
      findings.push({
        id: after.id, label: after.label, kind: 'status',
        before: before.status, after: after.status,
        note: '上次通过，本次跳过（端点疑似下线/未实现）',
      });
    }

    if (before.status === 'pass' && after.status === 'pass'
        && before.duration_ms >= LATENCY_MIN_MS) {
      const grow = (after.duration_ms - before.duration_ms) / before.duration_ms;
      if (grow > LATENCY_GROW_PCT) {
        findings.push({
          id: after.id, label: after.label, kind: 'latency',
          before: before.status, after: after.status,
          before_ms: before.duration_ms, after_ms: after.duration_ms,
          note: `时延 ${before.duration_ms}ms → ${after.duration_ms}ms (+${(grow * 100).toFixed(0)}%)`,
        });
      }
    }

    // Generic detail-counts diff: any probe whose details has a `counts` map of numbers
    // gets per-key drop detection. Project-specific without project-specific code.
    if (before.status === 'pass' && after.status === 'pass'
        && before.details && after.details) {
      const beforeCounts = before.details.counts as Record<string, number> | undefined;
      const afterCounts = after.details.counts as Record<string, number> | undefined;
      if (beforeCounts && afterCounts) {
        for (const k of Object.keys(beforeCounts)) {
          const b = beforeCounts[k] ?? 0;
          const a = afterCounts[k] ?? 0;
          if (a < b) {
            findings.push({
              id: `${after.id}::${k}`,
              label: `${after.label} → ${k}`,
              kind: 'detail',
              before: before.status, after: after.status,
              note: `计数下降 ${b} → ${a}`,
            });
          }
        }
      }
    }
  }

  return findings;
}
