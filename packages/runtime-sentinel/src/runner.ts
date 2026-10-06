// packages/runtime-sentinel/src/runner.ts
// Sequential probe runner with uniform error capture and timing.

import type { Probe, ProbeOutcome, ProbeResult, SentinelContext, SentinelReport } from './types.js';

export interface RunSentinelOptions {
  base: string;
  probes: Probe[];
  redisUrl?: string;
  options?: Record<string, string | number | boolean>;
  verbose?: boolean;
  /** Initial state shared across probes within a run */
  initialState?: Record<string, unknown>;
  /** Per-probe lifecycle callback (used by CLI for streaming output) */
  onProbe?: (r: ProbeResult) => void;
}

export async function runSentinel(opts: RunSentinelOptions): Promise<SentinelReport> {
  const ctx: SentinelContext = {
    base: opts.base,
    redisUrl: opts.redisUrl,
    options: opts.options ?? {},
    state: opts.initialState ?? {},
    verbose: Boolean(opts.verbose),
  };

  const results: ProbeResult[] = [];
  const start = Date.now();

  for (const probe of opts.probes) {
    const r = await runOne(probe, ctx);
    results.push(r);
    opts.onProbe?.(r);
  }

  const summary = {
    pass: results.filter((r) => r.status === 'pass').length,
    fail: results.filter((r) => r.status === 'fail').length,
    skip: results.filter((r) => r.status === 'skip').length,
    total: results.length,
  };

  return {
    generated_at: new Date().toISOString(),
    base: ctx.base,
    duration_ms: Date.now() - start,
    summary,
    probes: results,
  };
}

async function runOne(probe: Probe, ctx: SentinelContext): Promise<ProbeResult> {
  const start = Date.now();
  try {
    if (probe.skipIf && (await probe.skipIf(ctx))) {
      return {
        id: probe.id,
        label: probe.label,
        status: 'skip',
        duration_ms: Date.now() - start,
        error: 'skipIf=true',
      };
    }
    const out: ProbeOutcome = await probe.run(ctx);
    return {
      id: probe.id,
      label: probe.label,
      status: out.status ?? 'pass',
      duration_ms: Date.now() - start,
      details: out.details,
      error: out.error,
      hint: out.hint,
      source: out.source,
    };
  } catch (err) {
    return {
      id: probe.id,
      label: probe.label,
      status: 'fail',
      duration_ms: Date.now() - start,
      error: (err as Error).message,
      source: 'runtime',
    };
  }
}
