import { describe, expect, it, vi } from 'vitest';
import { QUEUE_NAMES } from './queue.js';
import { QueueService } from './queue.service.js';

type FakeJob = {
  data: { userId: string };
  getState: ReturnType<typeof vi.fn>;
  remove: ReturnType<typeof vi.fn>;
};

function job(userId: string, state: string, removeError?: Error): FakeJob {
  return {
    data: { userId },
    getState: vi.fn(async () => state),
    remove: removeError
      ? vi.fn(async () => { throw removeError; })
      : vi.fn(async () => undefined),
  };
}

function fixture(jobs: FakeJob[]) {
  const db = { pool: { connect: vi.fn() } };
  const service = new QueueService(db as never);
  const queues = new Map<string, { getJobs: ReturnType<typeof vi.fn> }>();
  for (const name of Object.values(QUEUE_NAMES)) {
    queues.set(name, { getJobs: vi.fn(async () => name === QUEUE_NAMES.REPORT ? jobs : []) });
  }
  (service as unknown as { queues: typeof queues }).queues = queues;
  return { service, queues };
}

describe('user-owned BullMQ cleanup', () => {
  it('removes removable jobs in every terminal or waiting state and leaves another user untouched', async () => {
    const removable = ['waiting', 'delayed', 'completed', 'failed'].map((state) => job('user-1', state));
    const other = job('user-2', 'waiting');
    const { service, queues } = fixture([...removable, other]);

    await expect(service.removeUserJobs('user-1')).resolves.toEqual({
      status: 'completed',
      removed: 4,
      active: 0,
    });
    for (const item of removable) expect(item.remove).toHaveBeenCalledOnce();
    expect(other.remove).not.toHaveBeenCalled();
    for (const queue of queues.values()) expect(queue.getJobs).toHaveBeenCalledOnce();
  });

  it('returns pending for active jobs and for a job that becomes locked during removal', async () => {
    const active = job('user-1', 'active');
    const raced = job('user-1', 'waiting', new Error('Job is locked by another worker'));
    raced.getState.mockResolvedValueOnce('waiting').mockResolvedValueOnce('active');
    const { service } = fixture([active, raced]);

    await expect(service.removeUserJobs('user-1')).resolves.toEqual({
      status: 'pending',
      removed: 0,
      active: 2,
    });
    expect(active.remove).not.toHaveBeenCalled();
    expect(raced.remove).toHaveBeenCalledOnce();
  });
});
