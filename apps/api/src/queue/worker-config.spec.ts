import {
  SHARED_DRAIN_DELAY_MS,
  HEAVY_WORKER_TIMING,
  LIGHT_WORKER_TIMING,
} from './worker-timing.js';

describe('worker timing presets', () => {
  it('keeps heavy workers on a longer lock window for remote LLM jobs', () => {
    expect(HEAVY_WORKER_TIMING).toEqual({
      drainDelay: SHARED_DRAIN_DELAY_MS,
      lockDuration: 120_000,
      lockRenewTime: 60_000,
      stalledInterval: 90_000,
    });
    expect(HEAVY_WORKER_TIMING.lockDuration).toBeGreaterThan(30_000);
    expect(HEAVY_WORKER_TIMING.stalledInterval).toBeGreaterThan(
      HEAVY_WORKER_TIMING.lockRenewTime,
    );
  });

  it('keeps lightweight workers shorter while preserving graceful shutdown margin', () => {
    expect(LIGHT_WORKER_TIMING).toEqual({
      drainDelay: SHARED_DRAIN_DELAY_MS,
      lockDuration: 60_000,
      lockRenewTime: 30_000,
      stalledInterval: 45_000,
    });
    expect(LIGHT_WORKER_TIMING.lockDuration).toBeLessThan(
      HEAVY_WORKER_TIMING.lockDuration,
    );
    expect(LIGHT_WORKER_TIMING.stalledInterval).toBeGreaterThan(
      LIGHT_WORKER_TIMING.lockRenewTime,
    );
  });
});
