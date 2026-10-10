import { describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { UnderstandingSourceService } from './understanding-source.js';

const userId = '11111111-1111-4111-8111-111111111111';
const roundId = '22222222-2222-4222-8222-222222222222';
const revisionId = '33333333-3333-4333-8333-333333333333';

const result = {
  observations: [{ focus: '面对不确定信息', text: '你会先确认信息再回应。', evidence_question_id: 'q1' }],
  evidence: [{ question_id: 'q1', focus_label: '面对不确定信息', context_label: '同事催促回应', choice_text: '先确认现场信息，再决定是否回应。' }],
};

describe('UnderstandingSourceService', () => {
  it('resolves only the selected observation and its owned evidence', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [{ result }] });
    const source = new UnderstandingSourceService({ pool: { query } } as never);

    const resolved = await source.resolve(userId, {
      kind: 'theme_result', round_id: roundId, result_revision_id: revisionId,
      observation_id: 'q1', feedback_ids: [],
    });

    expect(resolved.snapshot.observation_text).toBe('你会先确认信息再回应。');
    expect(resolved.evidence).toEqual([
      expect.objectContaining({ kind: 'simulation_context', text: '同事催促回应' }),
      expect.objectContaining({ kind: 'simulation_choice', text: '先确认现场信息，再决定是否回应。' }),
    ]);
    expect(query.mock.calls[0][1]).toEqual([roundId, revisionId, userId]);
  });

  it('rejects a fabricated observation before any model can receive text', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [{ result }] });
    const source = new UnderstandingSourceService({ pool: { query } } as never);

    await expect(source.resolve(userId, {
      kind: 'theme_result', round_id: roundId, result_revision_id: revisionId,
      observation_id: 'not-in-result', feedback_ids: [],
    })).rejects.toMatchObject({ response: expect.objectContaining({ code: 'source_not_found' }) });
  });

  it('does not trust feedback identifiers until they belong to the selected observation', async () => {
    const query = vi.fn()
      .mockResolvedValueOnce({ rows: [{ result }] })
      .mockResolvedValueOnce({ rows: [] });
    const source = new UnderstandingSourceService({ pool: { query } } as never);

    await expect(source.resolve(userId, {
      kind: 'theme_result', round_id: roundId, result_revision_id: revisionId,
      observation_id: 'q1', feedback_ids: ['44444444-4444-4444-8444-444444444444'],
    })).rejects.toMatchObject({ response: expect.objectContaining({ code: 'source_not_found' }) });
  });

  it('accepts a dynamic observation only when its completed playback hash matches', async () => {
    const playedPath = [{ scene_id: 'scene-1', choice_id: 'a' }];
    const query = vi.fn().mockResolvedValue({ rows: [{
      played_path: playedPath,
      scenes: [{ scene_id: 'scene-1', scene_number: 1, narrative: '同事临时改变安排。', choices: [{ choice_id: 'a', text: '先问清楚变化。' }] }],
    }] });
    const source = new UnderstandingSourceService({ pool: { query } } as never);
    const playbackHash = createHash('sha256').update(JSON.stringify(playedPath)).digest('hex');
    const resolved = await source.resolve(userId, {
      kind: 'dynamic_result', generation_id: 'gen-1', script_id: 'script-1', observation_id: 'scene-1:a', playback_hash: playbackHash,
    });
    expect(resolved.evidence).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'simulation_choice', text: '先问清楚变化。' }),
    ]));
  });
});
