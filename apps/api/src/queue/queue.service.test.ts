import { ServiceUnavailableException } from '@nestjs/common';
import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe('report queue availability', () => {
  it('does not claim a report was enqueued when queues are disabled', async () => {
    vi.stubEnv('DISABLE_QUEUES', '1');
    vi.resetModules();
    const { QueueService } = await import('./queue.service.js');
    const queue = new QueueService({} as never);
    await expect(queue.enqueueReport({
      reportId: 'report-1', conversationId: 'conversation-1', userId: 'user-1',
    })).rejects.toThrow(ServiceUnavailableException);
  });
});
