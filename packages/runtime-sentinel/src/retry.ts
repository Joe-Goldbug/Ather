// packages/runtime-sentinel/src/retry.ts
// Retry logic with exponential backoff for transient failures.

import { classifyError, type ErrorClassification } from './error-classifier.js';

export interface RetryConfig {
  maxAttempts: number;
  backoffMs: number[];
  verbose?: boolean;
}

export interface RetryResult<T> {
  success: boolean;
  value?: T;
  error?: Error;
  classification?: ErrorClassification;
  attempts: number;
  totalDuration_ms: number;
}

/**
 * Execute a function with exponential backoff retry.
 * Only retries on transient errors.
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  config: RetryConfig
): Promise<RetryResult<T>> {
  const start = Date.now();
  let lastError: Error | undefined;
  let lastClassification: ErrorClassification | undefined;

  for (let attempt = 1; attempt <= config.maxAttempts; attempt++) {
    try {
      const value = await fn();
      return {
        success: true,
        value,
        attempts: attempt,
        totalDuration_ms: Date.now() - start,
      };
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      lastClassification = classifyError(lastError);

      if (config.verbose) {
        console.log(
          `  [retry] attempt ${attempt}/${config.maxAttempts} failed: ${lastError.message}`
        );
      }

      // Don't retry permanent or config errors
      if (lastClassification.type !== 'transient') {
        if (config.verbose) {
          console.log(`  [retry] ${lastClassification.type} error, not retrying`);
        }
        return {
          success: false,
          error: lastError,
          classification: lastClassification,
          attempts: attempt,
          totalDuration_ms: Date.now() - start,
        };
      }

      // Last attempt — don't wait
      if (attempt === config.maxAttempts) {
        return {
          success: false,
          error: lastError,
          classification: lastClassification,
          attempts: attempt,
          totalDuration_ms: Date.now() - start,
        };
      }

      // Wait before retry
      const delayMs = config.backoffMs[attempt - 1] ?? 1000;
      if (config.verbose) {
        console.log(`  [retry] waiting ${delayMs}ms before retry...`);
      }
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }

  return {
    success: false,
    error: lastError,
    classification: lastClassification,
    attempts: config.maxAttempts,
    totalDuration_ms: Date.now() - start,
  };
}

/**
 * Default retry config: 3 attempts with 100ms, 500ms, 1s backoff.
 */
export const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxAttempts: 3,
  backoffMs: [100, 500, 1000],
};

/**
 * Aggressive retry config: 5 attempts for critical paths.
 */
export const AGGRESSIVE_RETRY_CONFIG: RetryConfig = {
  maxAttempts: 5,
  backoffMs: [50, 100, 200, 500, 1000],
};

/**
 * Conservative retry config: 2 attempts for fast-fail scenarios.
 */
export const CONSERVATIVE_RETRY_CONFIG: RetryConfig = {
  maxAttempts: 2,
  backoffMs: [100],
};
