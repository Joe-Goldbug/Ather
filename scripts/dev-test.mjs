import { spawn } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const apiDir = resolve(rootDir, 'apps/api');
const apiPort = process.env.API_PORT ?? '3101';

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

async function ensureApiBuilt() {
  const proc = spawn('bun', ['run', 'build:api'], {
    cwd: rootDir,
    stdio: 'inherit',
  });
  await new Promise((resolveP, rejectP) => {
    proc.on('exit', (code) => {
      if (code === 0) resolveP();
      else rejectP(new Error(`build:api exited with code ${code}`));
    });
  });
}

async function waitForPort(port, host = '127.0.0.1', timeoutMs = 30_000) {
  const net = await import('node:net');
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const open = await new Promise((resolveP) => {
      const socket = net.createConnection({ port, host }, () => {
        socket.destroy();
        resolveP(true);
      });
      socket.on('error', () => resolveP(false));
    });
    if (open) return;
    await new Promise((r) => setTimeout(r, 400));
  }
  throw new Error(`port ${port} did not open within ${timeoutMs}ms`);
}

let shuttingDown = false;
const children = [];

async function shutdown(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const child of children) {
    if (!child.killed) child.kill('SIGINT');
  }
  await new Promise((r) => setTimeout(r, 500));
  process.exit(code);
}

process.on('SIGINT', () => void shutdown(0));
process.on('SIGTERM', () => void shutdown(0));

await ensureApiBuilt();

console.log('[dev-test] Launching dev-all (API + Web + in-memory Redis)…');
const devAll = spawnProcess('dev', 'bun', ['run', 'scripts/dev-all.mjs'], {
  cwd: rootDir,
  env: { ...process.env, API_PORT: apiPort },
});
children.push(devAll);

await waitForPort(Number(apiPort));
await waitForPort(3000);
console.log(`[dev-test] API on ${apiPort}, Web on 3000 — ready.`);

console.log('[dev-test] Launching worker (built bundle)…');
const worker = spawnProcess(
  'worker',
  'node',
  ['dist/queue/worker.js'],
  {
    cwd: apiDir,
    env: {
      ...process.env,
      EVA_LOCAL_MOCK_LLM: '1',
      MOCK_REDIS: '1',
    },
  },
);
children.push(worker);

console.log('[dev-test] All services up. Opening http://localhost:3000 …');
try {
  spawn('open', ['http://localhost:3000'], { stdio: 'ignore' });
} catch {
  // non-mac: ignore
}

console.log('[dev-test] Press Ctrl+C to stop everything.');
