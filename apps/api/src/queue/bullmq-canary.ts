import { randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { Queue, Worker, type Job } from 'bullmq';
import { createRedisClient } from '../common/redis-client.js';

export type BullmqCanaryResult = {
  status: 'passed';
  queue: string;
  job_id: string;
  duration_ms: number;
};

function validateRedisUrl(redisUrl: string): void {
  const parsed = new URL(redisUrl);
  if (!['redis:', 'rediss:'].includes(parsed.protocol) || !parsed.hostname) {
    throw new Error('REDIS_URL must be a redis:// or rediss:// URL with a host');
  }
}

async function withTimeout<T>(operation: Promise<T>, timeoutMs: number): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      operation,
      new Promise<never>((_, reject) => {
        timeout = setTimeout(() => reject(new Error('BullMQ canary timed out')), timeoutMs);
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

export async function runBullmqCanary(
  redisUrl: string,
  timeoutMs = 10_000,
): Promise<BullmqCanaryResult> {
  validateRedisUrl(redisUrl);
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new Error('Canary timeout must be a positive number');
  }

  const startedAt = Date.now();
  const nonce = randomUUID();
  const jobId = randomUUID();
  const queueName = `eva-release-canary-${randomUUID().replaceAll('-', '')}`;
  const producerConnection = createRedisClient(redisUrl, { connectTimeout: timeoutMs });
  const workerConnection = createRedisClient(redisUrl, { connectTimeout: timeoutMs });
  const queue = new Queue(queueName, {
    connection: producerConnection,
    defaultJobOptions: { removeOnComplete: true, removeOnFail: true },
  });
  const worker = new Worker(
    queueName,
    async (job: Job<{ nonce?: unknown }>) => {
      if (job.name !== 'roundtrip' || job.data.nonce !== nonce) {
        throw new Error('Unexpected canary payload');
      }
      return { nonce };
    },
    { connection: workerConnection, concurrency: 1 },
  );

  try {
    await withTimeout(Promise.all([queue.waitUntilReady(), worker.waitUntilReady()]), timeoutMs);
    const completed = new Promise<{ nonce?: unknown }>((resolve, reject) => {
      worker.on('completed', (job, result) => {
        if (job.id === jobId) resolve(result as { nonce?: unknown });
      });
      worker.on('failed', (job) => {
        if (job?.id === jobId) reject(new Error('BullMQ canary job failed'));
      });
      worker.on('error', () => reject(new Error('BullMQ canary worker failed')));
    });

    await withTimeout(queue.add('roundtrip', { nonce }, { jobId }), timeoutMs);
    const result = await withTimeout(completed, timeoutMs);
    if (result.nonce !== nonce) throw new Error('BullMQ canary returned an unexpected result');

    return {
      status: 'passed',
      queue: queueName,
      job_id: jobId,
      duration_ms: Date.now() - startedAt,
    };
  } finally {
    await worker.close(true).catch(() => undefined);
    await queue.obliterate({ force: true }).catch(() => undefined);
    await queue.close().catch(() => undefined);
    await producerConnection.quit().catch(() => producerConnection.disconnect());
    await workerConnection.quit().catch(() => workerConnection.disconnect());
  }
}

async function main(): Promise<void> {
  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl) {
    console.error('[bullmq-canary] REDIS_URL is required');
    process.exitCode = 1;
    return;
  }

  const timeoutMs = Number(process.env.BULLMQ_CANARY_TIMEOUT_MS || 10_000);
  try {
    console.log(JSON.stringify(await runBullmqCanary(redisUrl, timeoutMs)));
  } catch {
    console.error('[bullmq-canary] failed without reading or writing user data');
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void main();
}
