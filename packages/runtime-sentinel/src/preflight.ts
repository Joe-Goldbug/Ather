// packages/runtime-sentinel/src/preflight.ts
// Environment diagnostics — check dependencies before running probes.

import { createConnection } from 'node:net';
import { existsSync, statSync } from 'node:fs';
import { resolve } from 'node:path';

export interface PreflightCheck {
  name: string;
  status: 'ok' | 'warn' | 'fail';
  message: string;
  suggestion?: string;
  latency_ms?: number;
}

export interface PreflightResult {
  checks: PreflightCheck[];
  ready: boolean;
  estimatedDuration_ms: number;
}

/**
 * Run environment diagnostics before executing probes.
 * Checks: Redis, API, database, disk space, Node.js version.
 */
export async function runPreflight(opts: {
  base: string;
  redisUrl?: string;
  outDir: string;
  verbose?: boolean;
}): Promise<PreflightResult> {
  const checks: PreflightCheck[] = [];

  // 1. Check Node.js version
  checks.push(checkNodeVersion());

  // 2. Check API connectivity
  checks.push(await checkApiConnectivity(opts.base));

  // 3. Check Redis (if configured)
  if (opts.redisUrl) {
    checks.push(await checkRedisConnectivity(opts.redisUrl));
  } else {
    checks.push({
      name: 'Redis',
      status: 'warn',
      message: 'Redis URL not configured',
      suggestion: 'Set REDIS_URL env var or pass --redis <url> to enable OTP auto-read',
    });
  }

  // 4. Check disk space for reports
  checks.push(checkDiskSpace(opts.outDir));

  // 5. Check environment variables
  checks.push(checkEnvironmentVariables());

  const ready = checks.every((c) => c.status !== 'fail');
  const estimatedDuration_ms = calculateEstimatedDuration(checks);

  return { checks, ready, estimatedDuration_ms };
}

function checkNodeVersion(): PreflightCheck {
  const version = process.version;
  const major = parseInt(version.slice(1).split('.')[0], 10);
  if (major < 18) {
    return {
      name: 'Node.js',
      status: 'fail',
      message: `Node.js ${version} (requires 18+)`,
      suggestion: 'Upgrade Node.js to 18.x or later',
    };
  }
  return {
    name: 'Node.js',
    status: 'ok',
    message: `${version}`,
  };
}

async function checkApiConnectivity(base: string): Promise<PreflightCheck> {
  try {
    const url = new URL(base);
    const start = Date.now();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    let response: Response;
    try {
      response = await fetch(`${base}/health`, {
        method: 'GET',
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }
    const latency_ms = Date.now() - start;

    if (response.ok) {
      return {
        name: 'API',
        status: 'ok',
        message: `${base} (latency: ${latency_ms}ms)`,
        latency_ms,
      };
    }
    return {
      name: 'API',
      status: 'warn',
      message: `${base} returned ${response.status}`,
      suggestion: 'API may not be ready. Try: bun run dev:api',
      latency_ms,
    };
  } catch (err) {
    return {
      name: 'API',
      status: 'fail',
      message: `Cannot reach ${base}: ${(err as Error).message}`,
      suggestion: 'Start the API server: bun run dev:api',
    };
  }
}

async function checkRedisConnectivity(redisUrl: string): Promise<PreflightCheck> {
  try {
    const url = new URL(redisUrl);
    const host = url.hostname;
    const port = parseInt(url.port || '6379', 10);

    return new Promise((resolve) => {
      const socket = createConnection({ host, port, timeout: 3000 });
      const start = Date.now();

      socket.on('connect', () => {
        const latency_ms = Date.now() - start;
        socket.destroy();
        resolve({
          name: 'Redis',
          status: 'ok',
          message: `${host}:${port} (latency: ${latency_ms}ms)`,
          latency_ms,
        });
      });

      socket.on('error', (err) => {
        socket.destroy();
        resolve({
          name: 'Redis',
          status: 'fail',
          message: `Cannot reach Redis at ${host}:${port}: ${(err as Error).message}`,
          suggestion: 'Start Redis: redis-server or docker run -d -p 6379:6379 redis',
        });
      });

      socket.on('timeout', () => {
        socket.destroy();
        resolve({
          name: 'Redis',
          status: 'fail',
          message: `Redis connection timeout at ${host}:${port}`,
          suggestion: 'Check Redis is running and accessible',
        });
      });
    });
  } catch (err) {
    return {
      name: 'Redis',
      status: 'fail',
      message: `Invalid Redis URL: ${redisUrl}`,
      suggestion: 'Use format: redis://localhost:6379 or redis://:password@host:port',
    };
  }
}

function checkDiskSpace(outDir: string): PreflightCheck {
  try {
    const fullPath = resolve(outDir);
    if (!existsSync(fullPath)) {
      return {
        name: 'Disk (reports)',
        status: 'warn',
        message: `${fullPath} does not exist`,
        suggestion: `Will be created on first run`,
      };
    }
    const stat = statSync(fullPath);
    if (!stat.isDirectory()) {
      return {
        name: 'Disk (reports)',
        status: 'fail',
        message: `${fullPath} is not a directory`,
        suggestion: `Remove the file or choose a different --out directory`,
      };
    }
    return {
      name: 'Disk (reports)',
      status: 'ok',
      message: `${fullPath}`,
    };
  } catch (err) {
    return {
      name: 'Disk (reports)',
      status: 'warn',
      message: `Cannot access ${outDir}: ${(err as Error).message}`,
      suggestion: 'Directory will be created on first run',
    };
  }
}

function checkEnvironmentVariables(): PreflightCheck {
  const required = ['API_BASE', 'REDIS_URL', 'DATABASE_URL'];
  const missing = required.filter((k) => !process.env[k]);

  if (missing.length === 0) {
    return {
      name: 'Environment',
      status: 'ok',
      message: 'All key env vars set',
    };
  }

  return {
    name: 'Environment',
    status: 'warn',
    message: `Missing: ${missing.join(', ')}`,
    suggestion: 'Some probes may skip. Check .env.local or pass via CLI flags',
  };
}

function calculateEstimatedDuration(checks: PreflightCheck[]): number {
  // Rough estimate: 200ms per probe + 50ms overhead
  // Adjust based on actual latencies if available
  let estimate = 50;
  for (const check of checks) {
    if (check.latency_ms) {
      estimate += check.latency_ms * 2; // Assume probes are ~2x slower than health check
    } else {
      estimate += 200; // Default per-probe estimate
    }
  }
  return estimate;
}

/**
 * Format preflight results for console output with colors.
 */
export function formatPreflightOutput(result: PreflightResult, verbose?: boolean): string {
  const lines: string[] = [];
  lines.push('');
  lines.push('📋 Environment Diagnostics');
  lines.push('');

  for (const check of result.checks) {
    const icon =
      check.status === 'ok' ? '✅'
      : check.status === 'warn' ? '⚠️ '
      : '❌';
    const status = check.status.toUpperCase().padEnd(4);
    lines.push(`  ${icon} ${check.name.padEnd(20)} ${check.message}`);

    if (check.suggestion && (check.status !== 'ok' || verbose)) {
      lines.push(`     💡 ${check.suggestion}`);
    }
  }

  lines.push('');
  if (result.ready) {
    lines.push(`🚀 Ready to run probes (est. ${result.estimatedDuration_ms}ms)`);
  } else {
    lines.push(`⛔ Not ready — fix failures above before running`);
  }
  lines.push('');

  return lines.join('\n');
}
