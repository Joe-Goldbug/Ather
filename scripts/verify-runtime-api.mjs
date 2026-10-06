import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const apiDir = resolve(rootDir, 'apps/api');
const apiPort = process.env.VERIFY_API_PORT ?? '3101';
const apiBase = `http://127.0.0.1:${apiPort}`;
const localMockLlmBase = `${apiBase}/mock-llm`;

function prefixWriter(prefix, stream) {
  let buffer = '';
  return (chunk) => {
    buffer += chunk.toString();
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() ?? '';
    for (const line of lines) {
      if (line) stream.write(`[${prefix}] ${line}\n`);
    }
  };
}

function spawnProcess(name, command, args, options = {}) {
  const child = spawn(command, args, {
    stdio: ['ignore', 'pipe', 'pipe'],
    ...options,
  });

  child.stdout?.on('data', prefixWriter(name, process.stdout));
  child.stderr?.on('data', prefixWriter(name, process.stderr));

  return child;
}

async function waitForHealth(baseUrl, timeoutMs = 20_000) {
  const startedAt = Date.now();
  let lastError = 'unknown';

  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(`${baseUrl}/health`);
      if (response.ok) {
        return;
      }
      lastError = `HTTP ${response.status}`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
    await delay(500);
  }

  throw new Error(`API health did not become ready at ${baseUrl}/health within ${timeoutMs}ms (${lastError})`);
}

async function main() {
  const api = spawnProcess('api', 'bun', ['run', 'start:prod'], {
    cwd: apiDir,
    env: {
      ...process.env,
      PORT: apiPort,
      EVA_LISTEN_HOST: '127.0.0.1',
      EVA_LOCAL_MOCK_LLM: '1',
      OPENAI_BASE_URL: localMockLlmBase,
      LLM_BASE_URL: localMockLlmBase,
    },
  });

  let apiExited = false;
  api.on('exit', (code, signal) => {
    apiExited = true;
    if (code !== null && code !== 0) {
      process.stderr.write(`[api] exited early with code ${code}\n`);
    } else if (signal) {
      process.stderr.write(`[api] exited early with signal ${signal}\n`);
    }
  });

  const cleanup = () => {
    if (!apiExited && !api.killed) {
      api.kill('SIGINT');
    }
  };

  process.on('exit', cleanup);
  process.on('SIGINT', () => {
    cleanup();
    process.exit(130);
  });
  process.on('SIGTERM', () => {
    cleanup();
    process.exit(143);
  });

  try {
    await waitForHealth(apiBase);

    await new Promise((resolvePromise, rejectPromise) => {
      const smoke = spawnProcess('smoke', 'bun', ['run', 'scripts/smoke-test.ts'], {
        cwd: rootDir,
        env: {
          ...process.env,
          API_BASE: apiBase,
          EVA_LOCAL_MOCK_LLM: '1',
          SMOKE_VERIFY_DB: '1',
        },
      });

      smoke.on('exit', (code, signal) => {
        if (code === 0) {
          resolvePromise();
          return;
        }
        rejectPromise(
          new Error(
            signal
              ? `smoke exited with signal ${signal}`
              : `smoke exited with code ${code ?? 1}`,
          ),
        );
      });
    });
  } finally {
    cleanup();
    await delay(500);
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[verify-runtime-api] ${message}`);
  process.exit(1);
});
