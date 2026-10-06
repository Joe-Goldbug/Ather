// packages/core/src/dialogue/calibration-engine.test.ts
// Unit tests for the calibration engine (S1)

import { describe, test, expect } from 'bun:test';
import {
  buildCalibrationRound,
  advanceCalibrationRound,
  isCalibrationComplete,
  MAX_CALIBRATION_FOLLOWUPS,
  MIN_CALIBRATION_FOLLOWUPS,
  type CalibrationRound,
} from './calibration-engine.js';

// ─────────────────────────────────────────────────────────────
// buildCalibrationRound
// ─────────────────────────────────────────────────────────────

describe('buildCalibrationRound', () => {
  test('creates a round with default 1 followup', () => {
    const round = buildCalibrationRound('attachment', 'low source coverage');
    expect(round.anchorDimension).toBe('attachment');
    expect(round.evidenceGap).toBe('low source coverage');
    expect(round.followups).toHaveLength(1);
    expect(round.maxFollowups).toBe(3);
    expect(round.terminated).toBe(false);
    expect(round.currentTurn).toBe(0);
  });

  test('creates a round with specified followup count (2)', () => {
    const round = buildCalibrationRound('trustBoundaries', 'inconsistent evidence', {
      initialFollowupCount: 2,
    });
    expect(round.followups).toHaveLength(2);
    expect(round.followups[0].turnIndex).toBe(0);
    expect(round.followups[1].turnIndex).toBe(1);
  });

  test('creates a round with max followup count (3)', () => {
    const round = buildCalibrationRound('emotionRegulation', 'no reality evidence', {
      initialFollowupCount: 3,
    });
    expect(round.followups).toHaveLength(3);
    expect(round.followups[0].dimension).toBe('emotionRegulation');
    expect(round.followups[2].turnIndex).toBe(2);
  });

  test('followups have empty question placeholder and correct dimension', () => {
    const round = buildCalibrationRound('stressResponse', 'gap', { initialFollowupCount: 2 });
    for (const f of round.followups) {
      expect(f.question).toBe('');
      expect(f.dimension).toBe('stressResponse');
    }
  });

  test('throws on empty anchorDimension', () => {
    expect(() => buildCalibrationRound('', 'some gap')).toThrow('anchorDimension must be a non-empty string');
  });

  test('throws on whitespace-only anchorDimension', () => {
    expect(() => buildCalibrationRound('   ', 'some gap')).toThrow('anchorDimension must be a non-empty string');
  });

  test('throws on empty evidenceGap', () => {
    expect(() => buildCalibrationRound('attachment', '')).toThrow('evidenceGap must be a non-empty string');
  });

  test('throws on whitespace-only evidenceGap', () => {
    expect(() => buildCalibrationRound('attachment', '  ')).toThrow('evidenceGap must be a non-empty string');
  });

  test('throws when initialFollowupCount < 1', () => {
    expect(() => buildCalibrationRound('attachment', 'gap', { initialFollowupCount: 0 })).toThrow(
      /initialFollowupCount must be between/,
    );
  });

  test('throws when initialFollowupCount > 3', () => {
    expect(() => buildCalibrationRound('attachment', 'gap', { initialFollowupCount: 4 })).toThrow(
      /initialFollowupCount must be between/,
    );
  });

  test('maxFollowups is always 3 regardless of options', () => {
    const r1 = buildCalibrationRound('dim', 'gap', { initialFollowupCount: 1 });
    const r2 = buildCalibrationRound('dim', 'gap', { initialFollowupCount: 3 });
    expect(r1.maxFollowups).toBe(3);
    expect(r2.maxFollowups).toBe(3);
  });
});

// ─────────────────────────────────────────────────────────────
// advanceCalibrationRound
// ─────────────────────────────────────────────────────────────

describe('advanceCalibrationRound', () => {
  test('increments currentTurn by 1', () => {
    const round = buildCalibrationRound('attachment', 'gap');
    const advanced = advanceCalibrationRound(round);
    expect(advanced.currentTurn).toBe(1);
    expect(advanced.terminated).toBe(false);
  });

  test('does not mutate the original round (immutability)', () => {
    const round = buildCalibrationRound('attachment', 'gap');
    const advanced = advanceCalibrationRound(round);
    expect(round.currentTurn).toBe(0);
    expect(round.terminated).toBe(false);
    expect(advanced.currentTurn).toBe(1);
  });

  test('terminates when currentTurn reaches maxFollowups (3)', () => {
    let round = buildCalibrationRound('attachment', 'gap');
    round = advanceCalibrationRound(round); // turn 1
    expect(round.terminated).toBe(false);
    round = advanceCalibrationRound(round); // turn 2
    expect(round.terminated).toBe(false);
    round = advanceCalibrationRound(round); // turn 3 = maxFollowups
    expect(round.terminated).toBe(true);
    expect(round.currentTurn).toBe(3);
  });

  test('returns same object when already terminated', () => {
    let round = buildCalibrationRound('attachment', 'gap');
    round = advanceCalibrationRound(round);
    round = advanceCalibrationRound(round);
    round = advanceCalibrationRound(round); // terminated
    const again = advanceCalibrationRound(round);
    expect(again).toBe(round); // same reference — no mutation
    expect(again.currentTurn).toBe(3);
  });

  test('progression from 0 to 3 with termination at exactly 3', () => {
    const turns: number[] = [];
    let round = buildCalibrationRound('conflictResponse', 'missing calibration');
    for (let i = 0; i < 5; i++) {
      round = advanceCalibrationRound(round);
      turns.push(round.currentTurn);
    }
    // After 3 advances it terminates, subsequent calls are no-ops
    expect(turns).toEqual([1, 2, 3, 3, 3]);
  });
});

// ─────────────────────────────────────────────────────────────
// isCalibrationComplete
// ─────────────────────────────────────────────────────────────

describe('isCalibrationComplete', () => {
  test('returns false for a fresh round', () => {
    const round = buildCalibrationRound('attachment', 'gap');
    expect(isCalibrationComplete(round)).toBe(false);
  });

  test('returns false after 1 advance', () => {
    let round = buildCalibrationRound('attachment', 'gap');
    round = advanceCalibrationRound(round);
    expect(isCalibrationComplete(round)).toBe(false);
  });

  test('returns false after 2 advances', () => {
    let round = buildCalibrationRound('attachment', 'gap');
    round = advanceCalibrationRound(round);
    round = advanceCalibrationRound(round);
    expect(isCalibrationComplete(round)).toBe(false);
  });

  test('returns true after 3 advances (maxFollowups reached)', () => {
    let round = buildCalibrationRound('attachment', 'gap');
    round = advanceCalibrationRound(round);
    round = advanceCalibrationRound(round);
    round = advanceCalibrationRound(round);
    expect(isCalibrationComplete(round)).toBe(true);
  });

  test('returns true when explicitly terminated (even if currentTurn < maxFollowups)', () => {
    const round: CalibrationRound = {
      anchorDimension: 'attachment',
      evidenceGap: 'gap',
      followups: [],
      maxFollowups: 3,
      terminated: true,
      currentTurn: 1,
    };
    expect(isCalibrationComplete(round)).toBe(true);
  });

  test('returns true when currentTurn >= maxFollowups even if terminated is false', () => {
    const round: CalibrationRound = {
      anchorDimension: 'attachment',
      evidenceGap: 'gap',
      followups: [],
      maxFollowups: 3,
      terminated: false,
      currentTurn: 3,
    };
    expect(isCalibrationComplete(round)).toBe(true);
  });

  test('returns true when currentTurn exceeds maxFollowups', () => {
    const round: CalibrationRound = {
      anchorDimension: 'attachment',
      evidenceGap: 'gap',
      followups: [],
      maxFollowups: 3,
      terminated: false,
      currentTurn: 5,
    };
    expect(isCalibrationComplete(round)).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────
// Constants export verification
// ─────────────────────────────────────────────────────────────

describe('constants', () => {
  test('MAX_CALIBRATION_FOLLOWUPS is 3', () => {
    expect(MAX_CALIBRATION_FOLLOWUPS).toBe(3);
  });

  test('MIN_CALIBRATION_FOLLOWUPS is 1', () => {
    expect(MIN_CALIBRATION_FOLLOWUPS).toBe(1);
  });
});
