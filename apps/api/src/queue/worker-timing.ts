import type { WorkerOptions } from 'bullmq';

export const SHARED_DRAIN_DELAY_MS = 30_000;

// Heavy workers perform remote LLM calls and DB reads/writes. They need a
// longer lock window so BullMQ does not requeue a still-running job as stalled.
export const HEAVY_WORKER_TIMING: Pick<
  WorkerOptions,
  'drainDelay' | 'lockDuration' | 'lockRenewTime' | 'stalledInterval'
> = {
  drainDelay: SHARED_DRAIN_DELAY_MS,
  lockDuration: 120_000,
  lockRenewTime: 60_000,
  stalledInterval: 90_000,
};

// Lightweight workers stay local to DB/Redis. Keep them shorter while still
// allowing enough time for graceful deploy shutdown and lock renewal.
export const LIGHT_WORKER_TIMING: Pick<
  WorkerOptions,
  'drainDelay' | 'lockDuration' | 'lockRenewTime' | 'stalledInterval'
> = {
  drainDelay: SHARED_DRAIN_DELAY_MS,
  lockDuration: 60_000,
  lockRenewTime: 30_000,
  stalledInterval: 45_000,
};
