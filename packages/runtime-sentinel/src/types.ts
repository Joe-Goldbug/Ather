// packages/runtime-sentinel/src/types.ts
// Public types shared between the engine and project probe files.

export type ProbeStatus = 'pass' | 'fail' | 'skip';

/** Output of a probe function — keep small, stable, JSON-serialisable. */
export interface ProbeOutcome {
  status?: ProbeStatus;
  details?: Record<string, unknown>;
  error?: string;
  hint?: string;
  /** Source classification used by downstream auto-debug bridges */
  source?: 'runtime' | 'env' | 'contract';
}

/** Final probe entry written to the report. */
export interface ProbeResult {
  id: string;
  label: string;
  status: ProbeStatus;
  duration_ms: number;
  details?: Record<string, unknown>;
  error?: string;
  hint?: string;
  source?: 'runtime' | 'env' | 'contract';
}

/** Context passed to every probe. Probes may stash state on `state` for later probes. */
export interface SentinelContext {
  /** Base API URL */
  base: string;
  /** Optional Redis URL for helpers like readOtpFromRedis */
  redisUrl?: string;
  /** CLI-resolved options surfaced for probe authors. */
  options: Record<string, string | number | boolean>;
  /** Free-form scratch space across probes within the same run. */
  state: Record<string, unknown>;
  /** Console log toggle */
  verbose: boolean;
}

/** Probe author API. Returned by `defineProbe`. */
export interface Probe {
  id: string;
  label: string;
  /** Hide this probe from the plan when its preconditions are not met. */
  skipIf?: (ctx: SentinelContext) => boolean | Promise<boolean>;
  run: (ctx: SentinelContext) => Promise<ProbeOutcome>;
}

export interface SentinelReport {
  generated_at: string;
  base: string;
  duration_ms: number;
  summary: {
    pass: number;
    fail: number;
    skip: number;
    total: number;
  };
  probes: ProbeResult[];
  git_sha?: string;
  /** Diff vs previous report (filled in run.ts) */
  regressions?: import('./diff.js').RegressionFinding[];
}
