import { randomUUID } from 'node:crypto';
import { Queue, Worker } from 'bullmq';
import { expect, test } from 'vitest';
import { Pool } from 'pg';
import { QueueService } from './queue.service.js';
import { QUEUE_NAMES } from './queue.js';
import { closeRedis } from './redis.js';

test('real Redis keeps another user and reports an active deletion job as pending', async ({ skip }) => {
  if (!process.env.EVA_TEST_DATABASE_URL || !process.env.EVA_TEST_REDIS_URL) skip();
  const pool = new Pool({ connectionString: process.env.EVA_TEST_DATABASE_URL });
  const service = new QueueService({ pool } as never);
  const redisUrl = new URL(process.env.EVA_TEST_REDIS_URL);
  const connection = { host: redisUrl.hostname, port: Number(redisUrl.port) };
  const scriptQueue = new Queue(QUEUE_NAMES.SCRIPT_GENERATION, { connection });
  const memoryQueue = new Queue(QUEUE_NAMES.MEMORY_AGGREGATE, { connection });
  const userId = randomUUID();
  const otherUserId = randomUUID();
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const worker = new Worker(QUEUE_NAMES.SCRIPT_GENERATION, async () => gate, { connection, concurrency: 1 });
  try {
    await pool.query('INSERT INTO users (id, email) VALUES ($1, $2), ($3, $4)', [
      userId, `${userId}@example.invalid`, otherUserId, `${otherUserId}@example.invalid`,
    ]);
    const activeJobId = `delete-active-${userId}`;
    await service.add(QUEUE_NAMES.SCRIPT_GENERATION, 'generate', { userId }, { jobId: activeJobId });
    await service.enqueueMemoryAggregate({ userId: otherUserId } as never);
    const otherJobs = await memoryQueue.getJobs(['wait', 'delayed'], 0, -1, true);
    const otherJob = otherJobs.find((job) => job.data.userId === otherUserId);
    expect(otherJob).toBeTruthy();

    const activeJob = await scriptQueue.getJob(activeJobId);
    for (let attempt = 0; attempt < 50 && await activeJob?.getState() !== 'active'; attempt++) {
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    await expect(service.removeUserJobs(userId)).resolves.toMatchObject({ status: 'pending', active: 1 });
    expect(await otherJob?.getState()).not.toBe('unknown');

    release();
    for (let attempt = 0; attempt < 100 && await activeJob?.getState() === 'active'; attempt++) {
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    await expect(service.removeUserJobs(userId)).resolves.toMatchObject({ status: 'completed', active: 0 });
  } finally {
    release();
    await worker.close(true);
    await scriptQueue.drain(true);
    await memoryQueue.drain(true);
    await Promise.all([scriptQueue.close(), memoryQueue.close(), service.onModuleDestroy(), closeRedis()]);
    await pool.query('DELETE FROM users WHERE id = ANY($1::uuid[])', [[userId, otherUserId]]);
    await pool.end();
  }
});
