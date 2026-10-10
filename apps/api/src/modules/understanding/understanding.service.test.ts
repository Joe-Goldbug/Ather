import { describe, expect, it, vi } from 'vitest';
import { UnderstandingService } from './understanding.service.js';

const userId = '11111111-1111-4111-8111-111111111111';
const sessionId = '22222222-2222-4222-8222-222222222222';
const operationId = '33333333-3333-4333-8333-333333333333';
const sourceRef = {
  kind: 'theme_result' as const,
  round_id: '44444444-4444-4444-8444-444444444444',
  result_revision_id: '55555555-5555-4555-8555-555555555555',
  observation_id: 'q1', feedback_ids: [],
};
const resolved = {
  sourceRef,
  snapshot: { source_kind: 'theme_result' as const, observation_text: '你先确认信息再回应。', observation_focus: '面对不确定信息' },
  evidence: [{ id: 'theme:r:q:choice', kind: 'simulation_choice' as const, text: '先确认信息。' }],
};

describe('UnderstandingService session persistence', () => {
  it('creates a source-bound session without calling a model', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [{
      id: sessionId, version: 1, state: 'open', saved_turn_id: null,
      expires_at: '2026-10-11T00:00:00.000Z', created_at: '2026-10-10T00:00:00.000Z',
    }] });
    const resolve = vi.fn().mockResolvedValue(resolved);
    const service = new UnderstandingService({ pool: { query } } as never, { resolve } as never);

    const session = await service.create(userId, {
      operation_id: operationId, source_ref: sourceRef, locale: 'zh-CN', processing_consent: true,
    });

    expect(session.id).toBe(sessionId);
    expect(resolve).toHaveBeenCalledWith(userId, sourceRef);
    expect(query.mock.calls[0][1]).toEqual(expect.arrayContaining([userId, operationId]));
    expect(String(query.mock.calls[0][0])).toContain('INSERT INTO understanding_sessions');
  });

  it('rejects creation before storing anything when the user has not consented to this session', async () => {
    const query = vi.fn();
    const resolve = vi.fn();
    const service = new UnderstandingService({ pool: { query } } as never, { resolve } as never);

    await expect(service.create(userId, {
      operation_id: operationId, source_ref: sourceRef, locale: 'zh-CN', processing_consent: false,
    })).rejects.toMatchObject({ response: expect.objectContaining({ code: 'processing_consent_required' }) });
    expect(resolve).not.toHaveBeenCalled();
    expect(query).not.toHaveBeenCalled();
  });

  it('stores a correction before any generation happens and advances the session version', async () => {
    const clientQuery = vi.fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: sessionId, user_id: userId, version: 1, state: 'open', revoked_at: null, expires_at: null, active_turn_id: null, source_ref: sourceRef, source_snapshot: resolved.snapshot }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ seq: 1 }] })
      .mockResolvedValueOnce({ rows: [{ id: '77777777-7777-4777-8777-777777777777' }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: '66666666-6666-4666-8666-666666666666', seq: 1, action: 'correction', text: '我只是觉得没有必要争。', status: 'pending', output: null, created_at: '2026-10-10T00:00:00.000Z' }] })
      .mockResolvedValue({ rows: [] });
    const client = { query: clientQuery, release: vi.fn() };
    const service = new UnderstandingService({ pool: { connect: vi.fn().mockResolvedValue(client) } } as never, {} as never);

    const turn = await service.appendTurn(userId, sessionId, {
      operation_id: operationId, expected_version: 1, action: 'correction', text: '我只是觉得没有必要争。',
      parent_turn_id: '77777777-7777-4777-8777-777777777777',
    });

    expect(turn.status).toBe('pending');
    expect(clientQuery.mock.calls.some(([sql]) => String(sql).includes('UPDATE understanding_sessions SET version = version + 1'))).toBe(true);
    expect(clientQuery.mock.calls.some(([sql]) => String(sql).includes('INSERT INTO understanding_turns'))).toBe(true);
  });
});
