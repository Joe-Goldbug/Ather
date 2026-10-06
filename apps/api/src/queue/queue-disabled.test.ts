import { afterEach, expect, test, vi } from 'vitest';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

test('generic add rejects instead of inventing a job ID when queues are disabled', async () => {
  vi.stubEnv('DISABLE_QUEUES', '1');
  vi.resetModules();
  const { QueueService, QueueDisabledError } = await import('./queue.service.js');
  const queue = new QueueService({} as never);
  await expect(queue.add('script-generation', 'generate', { generationId: 'gen-1' }, { jobId: 'gen-1' }))
    .rejects.toBeInstanceOf(QueueDisabledError);
});
