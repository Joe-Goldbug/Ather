import { beforeEach, describe, expect, it, vi } from 'vitest';

const { completeMock } = vi.hoisted(() => ({
  completeMock: vi.fn(),
}));

vi.mock('./api', () => ({
  assessmentApi: {
    complete: completeMock,
  },
}));

import {
  GUEST_SESSION_KEY,
  loadGuestSession,
  migrateGuestAssessment,
  saveGuestSession,
} from './guest-assessment';

describe('migrateGuestAssessment', () => {
  beforeEach(() => {
    sessionStorage.clear();
    completeMock.mockReset();
  });

  it('retires completed legacy guest state without writing it into the old assessment API', async () => {
    sessionStorage.setItem(
      'eva_assessment_state',
      JSON.stringify({
        phase: 'complete',
        answers: [
          { kind: 'choice', scenarioId: 'trust', choice: 'B', timestamp: 111 },
          { kind: 'input', scenarioId: 'stress', text: '真实原因', timestamp: 222 },
        ],
        startedAt: 123456,
      })
    );

    const migrated = await migrateGuestAssessment('zh-CN');

    expect(migrated).toBe(false);
    expect(completeMock).not.toHaveBeenCalled();
    expect(sessionStorage.getItem('eva_guest_assessment_migrated_v1')).toBe('1');
    expect(sessionStorage.getItem('eva_assessment_state')).toBeNull();
  });

  it('cleans up legacy storage when phase is not complete (no migration, no API call)', async () => {
    sessionStorage.setItem(
      'eva_assessment_state',
      JSON.stringify({
        phase: 'scenario',
        currentIndex: 4,
        answers: [{ kind: 'choice', scenarioId: 'trust', choice: 'B', timestamp: 111 }],
        startedAt: 123456,
      })
    );

    const migrated = await migrateGuestAssessment('zh-CN');

    expect(migrated).toBe(false);
    expect(completeMock).not.toHaveBeenCalled();
    expect(sessionStorage.getItem('eva_assessment_state')).toBeNull();
    expect(sessionStorage.getItem('eva_guest_assessment_migrated_v1')).toBe('1');
  });

  it('short-circuits when there is no legacy storage', async () => {
    const migrated = await migrateGuestAssessment('zh-CN');

    expect(migrated).toBe(false);
    expect(completeMock).not.toHaveBeenCalled();
  });

  it('short-circuits when migration was already attempted', async () => {
    sessionStorage.setItem('eva_guest_assessment_migrated_v1', '1');
    sessionStorage.setItem(
      'eva_assessment_state',
      JSON.stringify({
        phase: 'complete',
        answers: [{ kind: 'choice', scenarioId: 'trust', choice: 'B', timestamp: 111 }],
        startedAt: 123456,
      })
    );

    const migrated = await migrateGuestAssessment('zh-CN');

    expect(migrated).toBe(false);
    expect(completeMock).not.toHaveBeenCalled();
    expect(sessionStorage.getItem('eva_assessment_state')).not.toBeNull();
  });

  it('round-trips a versioned guest chapter and its pending consequence', () => {
    const session = {
      adult_confirmed: true as const,
      opening: {
        guest_run_id: '8f5691be-f7d0-4d9f-b21a-52fc40b17c1e',
        episode_id: 'rain-before-stop',
        episode_version: 'v1',
        question_bank_version: 'guest-rain-before-stop-v1',
        copy_version: 'zh-CN-v1',
        expires_at: '2099-01-01T00:00:00.000Z',
        nodes: [],
      },
      answers: [{ node_id: 'node-1', choice_id: 'A' as const }],
      pending_consequence: '局部后果',
    };

    saveGuestSession(session);

    expect(loadGuestSession()).toEqual(session);
  });

  it('removes malformed guest state instead of trusting it', () => {
    sessionStorage.setItem(GUEST_SESSION_KEY, JSON.stringify({ adult_confirmed: true }));

    expect(loadGuestSession()).toBeNull();
    expect(sessionStorage.getItem(GUEST_SESSION_KEY)).toBeNull();
  });
});
