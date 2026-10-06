// packages/runtime-sentinel/src/index.ts
// Public API. Importable from project probe files.

export { defineProbe } from './probe.js';
export { runSentinel } from './runner.js';
export { httpJson, extractCookieValue } from './http.js';
export {
  writeReport,
  loadPreviousReport,
  printSummary,
  printRegressions,
  color,
} from './reporter.js';
export { compareReports } from './diff.js';
export { loadProbes, findSentinelDir } from './loader.js';
export { defaultProbes } from './default-probes.js';
export { readOtpFromRedis } from './helpers/redis-otp.js';
export { runPreflight, formatPreflightOutput } from './preflight.js';
export { classifyError, getAutoFixSuggestions } from './error-classifier.js';
export { withRetry, DEFAULT_RETRY_CONFIG, AGGRESSIVE_RETRY_CONFIG, CONSERVATIVE_RETRY_CONFIG } from './retry.js';

export type {
  Probe,
  ProbeOutcome,
  ProbeResult,
  ProbeStatus,
  SentinelContext,
  SentinelReport,
} from './types.js';
export type { RegressionFinding } from './diff.js';
export type { HttpResult, HttpOptions } from './http.js';
export type { PreflightCheck, PreflightResult } from './preflight.js';
export type { ErrorClassification, ErrorType } from './error-classifier.js';
export type { RetryConfig, RetryResult } from './retry.js';
