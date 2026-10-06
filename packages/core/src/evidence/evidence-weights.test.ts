import { describe, expect, test } from 'bun:test';
import {
  EVIDENCE_BASE_WEIGHT,
  resolveFrequencyWeight,
  type FrequencyContext,
} from './evidence-weights.js';

const THREE_DAYS_MS = 3 * 24 * 60 * 60 * 1000;

function makeCtx(overrides: Partial<FrequencyContext> = {}): FrequencyContext {
  return {
    isFirstBaseline: true,
    microSandboxTodayCount: 0,
    now: Date.now(),
    ...overrides,
  };
}

describe('EVIDENCE_BASE_WEIGHT constants', () => {
  test('practice weight is 0.3', () => {
    expect(EVIDENCE_BASE_WEIGHT.practice).toBe(0.3);
  });

  test('formal weight is 1.0', () => {
    expect(EVIDENCE_BASE_WEIGHT.formal).toBe(1.0);
  });

  test('calibration weight is 1.0', () => {
    expect(EVIDENCE_BASE_WEIGHT.calibration).toBe(1.0);
  });

  test('reality weight is 1.0', () => {
    expect(EVIDENCE_BASE_WEIGHT.reality).toBe(1.0);
  });

  test('decision weight is 1.2', () => {
    expect(EVIDENCE_BASE_WEIGHT.decision).toBe(1.2);
  });

  test('correction weight is 0.8', () => {
    expect(EVIDENCE_BASE_WEIGHT.correction).toBe(0.8);
  });
});

describe('resolveFrequencyWeight - calibration', () => {
  test('rejects calibration when last calibration < 3 days ago', () => {
    const now = Date.now();
    const ctx = makeCtx({
      now,
      lastCalibrationAt: now - (THREE_DAYS_MS - 1000), // 1 second short of 3 days
    });
    const result = resolveFrequencyWeight('calibration', ctx);
    expect(result).toBeNull();
  });

  test('rejects calibration when last calibration was just now', () => {
    const now = Date.now();
    const ctx = makeCtx({ now, lastCalibrationAt: now });
    const result = resolveFrequencyWeight('calibration', ctx);
    expect(result).toBeNull();
  });

  test('accepts calibration when last calibration exactly 3 days ago', () => {
    const now = Date.now();
    const ctx = makeCtx({
      now,
      lastCalibrationAt: now - THREE_DAYS_MS,
    });
    const result = resolveFrequencyWeight('calibration', ctx);
    expect(result).toEqual({ kind: 'calibration', weight: 1.0 });
  });

  test('accepts calibration when last calibration > 3 days ago', () => {
    const now = Date.now();
    const ctx = makeCtx({
      now,
      lastCalibrationAt: now - (THREE_DAYS_MS + 1000),
    });
    const result = resolveFrequencyWeight('calibration', ctx);
    expect(result).toEqual({ kind: 'calibration', weight: 1.0 });
  });

  test('accepts calibration when no previous calibration (undefined)', () => {
    const ctx = makeCtx({ lastCalibrationAt: undefined });
    const result = resolveFrequencyWeight('calibration', ctx);
    expect(result).toEqual({ kind: 'calibration', weight: 1.0 });
  });
});

describe('resolveFrequencyWeight - micro_sandbox', () => {
  test('rejects micro_sandbox when today count >= 3', () => {
    const ctx = makeCtx({ microSandboxTodayCount: 3 });
    const result = resolveFrequencyWeight('micro_sandbox', ctx);
    expect(result).toBeNull();
  });

  test('rejects micro_sandbox when today count > 3', () => {
    const ctx = makeCtx({ microSandboxTodayCount: 5 });
    const result = resolveFrequencyWeight('micro_sandbox', ctx);
    expect(result).toBeNull();
  });

  test('accepts micro_sandbox when today count < 3', () => {
    const ctx = makeCtx({ microSandboxTodayCount: 2 });
    const result = resolveFrequencyWeight('micro_sandbox', ctx);
    expect(result).toEqual({ kind: 'formal', weight: 0.8 });
  });

  test('accepts micro_sandbox when today count is 0', () => {
    const ctx = makeCtx({ microSandboxTodayCount: 0 });
    const result = resolveFrequencyWeight('micro_sandbox', ctx);
    expect(result).toEqual({ kind: 'formal', weight: 0.8 });
  });
});

describe('resolveFrequencyWeight - baseline', () => {
  test('always returns formal ×1.0', () => {
    const ctx = makeCtx();
    const result = resolveFrequencyWeight('baseline', ctx);
    expect(result).toEqual({ kind: 'formal', weight: 1.0 });
  });

  test('returns formal ×1.0 regardless of other context values', () => {
    const ctx = makeCtx({
      isFirstBaseline: false,
      microSandboxTodayCount: 100,
      lastCalibrationAt: Date.now(),
    });
    const result = resolveFrequencyWeight('baseline', ctx);
    expect(result).toEqual({ kind: 'formal', weight: 1.0 });
  });
});

describe('resolveFrequencyWeight - practice', () => {
  test('always returns practice ×0.3', () => {
    const ctx = makeCtx();
    const result = resolveFrequencyWeight('practice', ctx);
    expect(result).toEqual({ kind: 'practice', weight: 0.3 });
  });

  test('returns practice ×0.3 regardless of other context values', () => {
    const ctx = makeCtx({
      microSandboxTodayCount: 100,
      lastCalibrationAt: Date.now(),
    });
    const result = resolveFrequencyWeight('practice', ctx);
    expect(result).toEqual({ kind: 'practice', weight: 0.3 });
  });
});

describe('resolveFrequencyWeight - shift_verify', () => {
  test('returns calibration ×1.0', () => {
    const ctx = makeCtx();
    const result = resolveFrequencyWeight('shift_verify', ctx);
    expect(result).toEqual({ kind: 'calibration', weight: 1.0 });
  });

  test('returns calibration ×1.0 regardless of other context values', () => {
    const ctx = makeCtx({
      microSandboxTodayCount: 100,
      lastCalibrationAt: Date.now(),
    });
    const result = resolveFrequencyWeight('shift_verify', ctx);
    expect(result).toEqual({ kind: 'calibration', weight: 1.0 });
  });
});
