import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import dotenv from 'dotenv';
import { RedisMemoryServer } from 'redis-memory-server';

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const apiDir = resolve(rootDir, 'apps/api');
const webDir = resolve(rootDir, 'apps/web');
const backendEnvPath = resolve(rootDir, 'backend/.env');

function readEnvFile(filePath) {
  if (!existsSync(filePath)) return {};
  return dotenv.parse(readFileSync(filePath));
}

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

function spawnProcess(name, command, args, cwd, env) {
  const child = spawn(command, args, {
    cwd,
    env,
    stdio: ['inherit', 'pipe', 'pipe'],
  });

  child.stdout?.on('data', prefixWriter(name, process.stdout));
  child.stderr?.on('data', prefixWriter(name, process.stderr));

  child.on('exit', (code, signal) => {
    const status = signal ? `signal ${signal}` : `code ${code ?? 0}`;
    console.log(`[dev] ${name} exited with ${status}`);
    if (!shuttingDown) {
      void shutdown(code ?? 0);
    }
  });

  return child;
}

let shuttingDown = false;
const children = [];
let redisServer = null;

async function startRedisMemoryServer() {
  try {
    redisServer = new RedisMemoryServer({
      instance: { port: 6379 },
    });
    await redisServer.start();
    console.log('[dev] Redis memory server started on redis://127.0.0.1:6379');
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`[dev] Redis memory server could not start, assuming Redis already exists: ${message}`);
  }
}

async function shutdown(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;

  for (const child of children) {
    if (!child.killed) child.kill('SIGINT');
  }

  try {
    await redisServer?.stop();
  } catch {
    // best effort
  }

  process.exit(code);
}

process.on('SIGINT', () => {
  void shutdown(0);
});
process.on('SIGTERM', () => {
  void shutdown(0);
});

await startRedisMemoryServer();

const appApiEnvPath = resolve(rootDir, 'apps/api/.env');
const backendEnv = readEnvFile(backendEnvPath);
const appApiEnv = readEnvFile(appApiEnvPath);
const apiPort = process.env.API_PORT ?? backendEnv.PORT ?? '3101';

const apiEnv = {
  ...process.env,
  ...backendEnv,
  ...appApiEnv,
  NODE_ENV: process.env.NODE_ENV ?? 'development',
  PORT: apiPort,
  REDIS_URL: process.env.REDIS_URL ?? backendEnv.REDIS_URL ?? 'redis://127.0.0.1:6379',
};

const webEnv = {
  ...process.env,
  NODE_ENV: process.env.NODE_ENV ?? 'development',
  EVA_LOCAL_PRODUCT_PREVIEW: process.env.EVA_LOCAL_PRODUCT_PREVIEW ?? '1',
  NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL ?? `http://127.0.0.1:${apiPort}`,
};

console.log(`[dev] Starting API on http://127.0.0.1:${apiPort}`);
children.push(spawnProcess('api', 'bun', ['run', 'dev'], apiDir, apiEnv));

console.log('[dev] Starting Web on http://127.0.0.1:3000');
children.push(spawnProcess('web', 'bun', ['run', 'dev'], webDir, webEnv));
