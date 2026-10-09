import { ThemeAssessmentService } from './theme-assessment.service.js';
import { selectThemeRoundCore } from '@eva/core';

describe('ThemeAssessmentService result feedback', () => {
  it('keeps completed scene observations inside the theme result', async () => {
    const questions = selectThemeRoundCore('emotion', 0);
    const query = jest.fn().mockResolvedValue({ rows: [{ id: 'revision-1' }] });
    const service = new ThemeAssessmentService({ pool: { query } } as never, {} as never);
    jest.spyOn(service as unknown as { getRound: () => Promise<unknown> }, 'getRound').mockResolvedValue({
      id: 'round-1', theme_lens: 'emotion', locale: 'zh-CN', status: 'ready_to_complete',
      question_bank_version: 'test-v1', completed_at: null,
    });
    jest.spyOn(service, 'next').mockResolvedValue({ state: 'ready_to_complete' } as never);
    jest.spyOn(service as unknown as { loadRoundState: () => Promise<unknown> }, 'loadRoundState').mockResolvedValue({
      items: questions.map((definition, index) => ({ id: `item-${index}`, definition })),
      answers: questions.map((_, index) => ({
        item_id: `item-${index}`, choice_id: 'A', free_text: null,
        answered_at: '2026-09-26T00:00:00.000Z',
      })),
    });
    jest.spyOn(service, 'getResult').mockResolvedValue({ round_id: 'round-1' } as never);

    await service.complete('user-1', 'round-1');

    expect(query.mock.calls.map(([sql]) => sql)).toEqual([
      expect.stringContaining('INSERT INTO theme_assessment_result_revisions'),
      expect.stringContaining("UPDATE theme_assessment_rounds SET status = 'completed'"),
    ]);
  });

  it('uses partial theme-result feedback to select the next round', async () => {
    const query = jest.fn().mockResolvedValue({ rows: [{
      theme_lens: 'emotion', response_id: 'response-1', result_revision_id: 'revision-1',
      evidence_question_id: 'emotion.trigger.daily.v1', action: 'partial',
    }] });
    const service = new ThemeAssessmentService({ pool: { query } } as never, {} as never);

    await expect(service.recommendNextRound('user-1')).resolves.toMatchObject({
      theme_lens: 'emotion', reason: 'clarify_partial',
      target: {
        response_id: 'response-1', result_revision_id: 'revision-1',
        observation_question_id: 'emotion.trigger.daily.v1', action: 'partial',
      },
    });
    expect(query).toHaveBeenCalledTimes(1);
    expect(query.mock.calls[0][0]).toContain('FROM theme_assessment_result_responses');
    expect(query.mock.calls[0][0]).toContain('DISTINCT ON (response.result_revision_id, response.evidence_question_id)');
    expect(query.mock.calls[0][0]).toContain('ORDER BY response.created_at DESC, response.id DESC');
    expect(query.mock.calls[0][0]).toContain("response.action IN ('refute', 'partial', 'clarify')");
    expect(query.mock.calls[0][0]).toContain('WHERE invalidated_at IS NULL');
    expect(query.mock.calls[0][0]).not.toContain("response.created_at > NOW() - INTERVAL '7 days'");
  });

  it('does not label an arbitrary low-coverage theme as a contradiction check', async () => {
    const query = jest.fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ n: '3' }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ theme_lens: 'emotion', total: '0', last_completed_at: null }] });
    const service = new ThemeAssessmentService({ pool: { query } } as never, {} as never);

    await expect(service.recommendNextRound('user-1')).resolves.toMatchObject({
      reason: 'explore_domain', target: null,
    });
    expect(query.mock.calls[0][0]).not.toContain('resolve_contradiction');
  });

  it.each([
    ['refute', 'verify_disagreement', '不符合实际'],
    ['clarify', 'use_added_context', '补充了这条观察的背景'],
  ] as const)('preserves %s feedback meaning in the recommendation', async (action, reason, copy) => {
    const query = jest.fn().mockResolvedValue({ rows: [{
      theme_lens: 'emotion', response_id: 'response-1', result_revision_id: 'revision-1',
      evidence_question_id: 'emotion.trigger.daily.v1', action,
    }] });
    const service = new ThemeAssessmentService({ pool: { query } } as never, {} as never);

    const recommendation = await service.recommendNextRound('user-1');
    expect(recommendation).toMatchObject({ reason });
    expect(recommendation.reason_zh).toContain(copy);
  });

  it('returns the feedback-aware recommendation from the public coverage endpoint', async () => {
    const query = jest.fn()
      .mockResolvedValueOnce({ rows: [{ theme_lens: 'emotion', total: '3', last_completed_at: null }] })
      .mockResolvedValueOnce({ rows: [{
        theme_lens: 'emotion', response_id: 'response-1', result_revision_id: 'revision-1',
        evidence_question_id: null, action: 'refute',
      }] });
    const service = new ThemeAssessmentService({ pool: { query } } as never, {} as never);

    await expect(service.coverage('user-1')).resolves.toMatchObject({
      recommended_theme: 'emotion',
      recommendation_reason: 'verify_disagreement',
      recommendation_target: {
        response_id: 'response-1', result_revision_id: 'revision-1', action: 'refute',
        observation_question_id: null,
      },
    });
  });

  it('starts the next default round using the feedback-aware theme', async () => {
    const query = jest.fn().mockResolvedValue({ rows: [{ total: '0' }] });
    const clientQuery = jest.fn()
      .mockResolvedValue({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{
        id: 'round-next', theme_lens: 'workplace', locale: 'zh-CN', status: 'in_progress',
        question_bank_version: 'test-v1', completed_at: null,
      }] });
    const client = { query: clientQuery, release: jest.fn() };
    const service = new ThemeAssessmentService({ pool: { query, connect: jest.fn().mockResolvedValue(client) } } as never, {} as never);
    jest.spyOn(service, 'recommendNextRound').mockResolvedValue({
      theme_lens: 'workplace', reason: 'verify_disagreement', reason_zh: '换个情境核对。', target: null,
    });
    jest.spyOn(service, 'next').mockResolvedValue({ state: 'question' } as never);

    const started = await service.start('user-1', {});

    expect(started.round.theme_lens).toBe('workplace');
    expect(clientQuery.mock.calls.find(([sql]) => String(sql).includes('INSERT INTO theme_assessment_rounds'))?.[1]?.[1]).toBe('workplace');
  });

  it('asks a different context for the latest partial observation and persists the actual target', async () => {
    const disputed = selectThemeRoundCore('emotion', 0)[2]!;
    const query = jest.fn()
      .mockResolvedValueOnce({ rows: [{ total: '1' }] });
    const clientQuery = jest.fn()
      .mockResolvedValue({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: 'round-next', theme_lens: 'emotion', status: 'in_progress' }] });
    const client = { query: clientQuery, release: jest.fn() };
    const service = new ThemeAssessmentService({ pool: { query, connect: jest.fn().mockResolvedValue(client) } } as never, {} as never);
    jest.spyOn(service, 'recommendNextRound').mockResolvedValue({
      theme_lens: 'emotion', reason: 'clarify_partial', reason_zh: '你认为这条观察只符合一部分，换个情境继续核对。',
      target: {
        response_id: 'response-1', result_revision_id: 'revision-1',
        observation_question_id: disputed.question_id, action: 'partial',
      },
    });
    jest.spyOn(service, 'next').mockResolvedValue({ state: 'question' } as never);

    const started = await service.start('user-1', { theme: 'emotion' });

    const firstItem = clientQuery.mock.calls.find(([sql]) => String(sql).includes('INSERT INTO theme_assessment_round_items'));
    const selected = JSON.parse(firstItem?.[1]?.[5] as string);
    expect(selected.focus_key).toBe(disputed.focus_key);
    expect(selected.context).not.toBe(disputed.context);
    expect(started.selection).toMatchObject({
      reason: 'clarify_partial', target: { response_id: 'response-1', action: 'partial' },
      selected_question_id: selected.question_id,
    });
    const insertRound = clientQuery.mock.calls.find(([sql]) => String(sql).includes('INSERT INTO theme_assessment_rounds'));
    expect(insertRound?.[0]).toContain('selection_decision');
    expect(JSON.parse(insertRound?.[1]?.[4] as string)).toMatchObject({
      target: { response_id: 'response-1', action: 'partial' }, selected_question_id: selected.question_id,
    });
  });

  it('keeps the theme-level explanation for whole-result feedback', async () => {
    const query = jest.fn().mockResolvedValue({ rows: [{ total: '1' }] });
    const clientQuery = jest.fn().mockResolvedValue({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: 'round-next', theme_lens: 'emotion', status: 'in_progress' }] });
    const client = { query: clientQuery, release: jest.fn() };
    const service = new ThemeAssessmentService({ pool: { query, connect: jest.fn().mockResolvedValue(client) } } as never, {} as never);
    jest.spyOn(service, 'recommendNextRound').mockResolvedValue({
      theme_lens: 'emotion', reason: 'verify_disagreement',
      reason_zh: '你认为上一轮整体观察不符合实际；本轮从同一主题继续观察。',
      target: {
        response_id: 'response-1', result_revision_id: 'revision-1',
        observation_question_id: null, action: 'refute',
      },
    });
    jest.spyOn(service, 'next').mockResolvedValue({ state: 'question' } as never);

    const started = await service.start('user-1', { theme: 'emotion' });

    expect(started.selection).toMatchObject({
      status: 'theme_followup',
      reason_zh: '你认为上一轮整体观察不符合实际；本轮从同一主题继续观察。',
    });
  });

  it('respects a manually selected different theme without attaching another theme feedback target', async () => {
    const query = jest.fn().mockResolvedValue({ rows: [{ total: '0' }] });
    const clientQuery = jest.fn().mockResolvedValue({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: 'round-manual', theme_lens: 'workplace' }] });
    const client = { query: clientQuery, release: jest.fn() };
    const service = new ThemeAssessmentService({ pool: { query, connect: jest.fn().mockResolvedValue(client) } } as never, {} as never);
    jest.spyOn(service, 'recommendNextRound').mockResolvedValue({
      theme_lens: 'emotion', reason: 'verify_disagreement', reason_zh: '继续核对。',
      target: {
        response_id: 'response-emotion', result_revision_id: 'revision-emotion',
        observation_question_id: 'emotion.trigger.daily.v1', action: 'refute',
      },
    });
    jest.spyOn(service, 'next').mockResolvedValue({ state: 'question' } as never);

    const started = await service.start('user-1', { theme: 'workplace' });

    expect(started.round.theme_lens).toBe('workplace');
    expect(started.selection).toMatchObject({ reason: 'manual_theme', target: null, status: 'theme_selection' });
  });

  it('rejects a clarification that contains no user explanation', async () => {
    const query = jest.fn();
    const service = new ThemeAssessmentService(
      { pool: { query } } as never,
      {} as never
    );

    await expect(
      service.respondToResult('user-1', 'round-1', {
        operation_id: 'operation-1',
        action: 'clarify',
      })
    ).rejects.toMatchObject({
      response: { code: 'clarification_explanation_required' },
    });
    expect(query).not.toHaveBeenCalled();
  });

  function resultRow() {
    return {
      id: 'result-1',
      revision_number: 1,
      result: {
        theme_lens: 'emotion',
        theme_title: '情绪反应侧写',
        headline: '你会先稳住自己',
        summary: '本轮摘要',
        observations: [],
        strength: '能停下来',
        watchout: '可能压住感受',
        counterevidence: '不同情境可能不同',
        boundary: '这只是本轮观察',
        evidence: [],
      },
      published_at: '2026-08-28T00:00:00.000Z',
    };
  }

  function roundRow() {
    return {
      id: 'round-1',
      theme_lens: 'emotion',
      locale: 'zh-CN',
      status: 'completed',
      question_bank_version: 'test-v1',
      completed_at: '2026-08-28T00:00:00.000Z',
    };
  }

  function dbForResult(feedbackRows: unknown[] = []) {
    const query = jest.fn()
      .mockResolvedValueOnce({ rows: [roundRow()] })
      .mockResolvedValueOnce({ rows: [resultRow()] })
      .mockResolvedValueOnce({ rows: feedbackRows });
    return { db: { pool: { query } } as any, query };
  }

  it('returns an explicit not-responded state when the result has no feedback', async () => {
    const { db } = dbForResult();
    const service = new ThemeAssessmentService(db, {} as never);

    await expect(service.getResult('user-1', 'round-1')).resolves.toMatchObject({
      feedback_state: 'not_responded',
      whole_result_refuted: false,
      latest_feedback: null,
    });
  });

  it('restores the latest feedback separately for each observation', async () => {
    const result = resultRow();
    result.result.observations = [
      { focus: '观察一', text: '情境一', evidence_question_id: 'q1' },
      { focus: '观察二', text: '情境二', evidence_question_id: 'q2' },
    ];
    const query = jest.fn()
      .mockResolvedValueOnce({ rows: [roundRow()] })
      .mockResolvedValueOnce({ rows: [result] })
      .mockResolvedValueOnce({ rows: [
        { id: 'response-2', action: 'confirm', explanation: null, evidence_question_id: 'q2', created_at: '2026-09-26T00:02:00.000Z' },
        { id: 'response-1', action: 'refute', explanation: null, evidence_question_id: 'q1', created_at: '2026-09-26T00:01:00.000Z' },
      ] });
    const service = new ThemeAssessmentService({ pool: { query } } as never, {} as never);

    await expect(service.getResult('user-1', 'round-1')).resolves.toMatchObject({
      feedback_state: 'needs_follow_up',
      whole_result_refuted: false,
      latest_feedback: { observation_question_id: 'q2' },
      observation_feedback: {
        q1: { action: 'refute', state: 'needs_follow_up' },
        q2: { action: 'confirm', state: 'recorded' },
      },
    });
    expect(query.mock.calls[2][0]).toContain('PARTITION BY evidence_question_id');
  });

  it('projects only the latest whole-result refutation without changing the stored result', async () => {
    const { db } = dbForResult([
      { id: 'response-2', action: 'confirm', explanation: null, evidence_question_id: 'q1', created_at: '2026-09-26T00:02:00.000Z' },
      { id: 'response-1', action: 'refute', explanation: null, evidence_question_id: null, created_at: '2026-09-26T00:01:00.000Z' },
    ]);
    const service = new ThemeAssessmentService(db, {} as never);

    await expect(service.getResult('user-1', 'round-1')).resolves.toMatchObject({
      whole_result_refuted: true,
      result: { headline: '你会先稳住自己', strength: '能停下来' },
    });
  });

  it('clears the whole-result disputed projection after a later whole-result confirmation', async () => {
    const { db } = dbForResult([
      { id: 'response-2', action: 'confirm', explanation: null, evidence_question_id: null, created_at: '2026-09-26T00:02:00.000Z' },
    ]);
    const service = new ThemeAssessmentService(db, {} as never);

    await expect(service.getResult('user-1', 'round-1')).resolves.toMatchObject({
      whole_result_refuted: false,
    });
  });

  it('rejects a reused operation id when the feedback payload changes', async () => {
    const clientQuery = jest.fn().mockResolvedValue({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [{
          id: 'response-1',
          action: 'confirm',
          explanation: null,
          created_at: '2026-08-28T00:00:00.000Z',
        }],
      });
    const client = {
      query: clientQuery,
      release: jest.fn(),
    };
    const { db } = dbForResult();
    (db.pool as unknown as { connect: jest.Mock }).connect = jest.fn().mockResolvedValue(client);
    const service = new ThemeAssessmentService(db, {} as never);

    await expect(service.respondToResult('user-1', 'round-1', {
      operation_id: 'operation-1',
      action: 'refute',
      explanation: '真实情况不同',
    })).rejects.toMatchObject({
      response: { code: 'idempotency_key_reused' },
    });
    expect(clientQuery).not.toHaveBeenCalledWith(
      expect.stringContaining('DO UPDATE'),
      expect.anything(),
    );
  });

  it('rejects feedback for an observation outside the current result', async () => {
    const connect = jest.fn();
    const service = new ThemeAssessmentService({ pool: { connect } } as never, {} as never);
    jest.spyOn(service, 'getResult').mockResolvedValue({
      result_revision_id: 'result-1', result: { observations: [{ evidence_question_id: 'q1' }] },
    } as never);

    await expect(service.respondToResult('user-1', 'round-1', {
      operation_id: 'operation-1', action: 'refute', observation_question_id: 'q2',
    })).rejects.toMatchObject({ response: { code: 'observation_not_in_result' } });
    expect(connect).not.toHaveBeenCalled();
  });

  it('returns the targeted observation id after saving feedback', async () => {
    const clientQuery = jest.fn().mockResolvedValue({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{
        id: 'response-q1', action: 'refute', explanation: null,
        evidence_question_id: 'q1', created_at: '2026-09-26T00:03:00.000Z',
      }] });
    const client = { query: clientQuery, release: jest.fn() };
    const service = new ThemeAssessmentService({ pool: { connect: jest.fn().mockResolvedValue(client) } } as never, {} as never);
    jest.spyOn(service, 'getResult').mockResolvedValue({
      result_revision_id: 'result-1', result: { observations: [{ evidence_question_id: 'q1' }] },
    } as never);

    await expect(service.respondToResult('user-1', 'round-1', {
      operation_id: 'operation-1', action: 'refute', observation_question_id: 'q1',
    })).resolves.toMatchObject({ observation_question_id: 'q1', state: 'needs_follow_up' });
  });

  it('keeps other unresolved observation feedback visible when one observation is confirmed', async () => {
    const clientQuery = jest.fn().mockResolvedValue({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{
        id: 'response-q2', action: 'confirm', explanation: null,
        evidence_question_id: 'q2', created_at: '2026-09-26T00:03:00.000Z',
      }] })
      .mockResolvedValueOnce({ rows: [{ has_pending: true }] });
    const client = { query: clientQuery, release: jest.fn() };
    const service = new ThemeAssessmentService({ pool: { connect: jest.fn().mockResolvedValue(client) } } as never, {} as never);
    jest.spyOn(service, 'getResult').mockResolvedValue({
      result_revision_id: 'result-1', result: { observations: [
        { evidence_question_id: 'q1' }, { evidence_question_id: 'q2' },
      ] },
    } as never);

    await expect(service.respondToResult('user-1', 'round-1', {
      operation_id: 'operation-confirm-q2', action: 'confirm', observation_question_id: 'q2',
    })).resolves.toMatchObject({ state: 'recorded', feedback_state: 'needs_follow_up' });
    expect(clientQuery.mock.calls.at(-2)?.[0]).toContain('BOOL_OR(action <> \'confirm\')');
  });

  it('does not replay the same operation id for a different observation', async () => {
    const clientQuery = jest.fn().mockResolvedValue({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{
        id: 'response-1', action: 'refute', explanation: null,
        evidence_question_id: 'q1', created_at: '2026-09-26T00:00:00.000Z',
      }] });
    const client = { query: clientQuery, release: jest.fn() };
    const service = new ThemeAssessmentService({ pool: { connect: jest.fn().mockResolvedValue(client) } } as never, {} as never);
    jest.spyOn(service, 'getResult').mockResolvedValue({
      result_revision_id: 'result-1', result: { observations: [
        { evidence_question_id: 'q1' }, { evidence_question_id: 'q2' },
      ] },
    } as never);

    await expect(service.respondToResult('user-1', 'round-1', {
      operation_id: 'operation-1', action: 'refute', observation_question_id: 'q2',
    })).rejects.toMatchObject({ response: { code: 'idempotency_key_reused' } });
  });

  it('returns the stored response when the same operation is replayed', async () => {
    const clientQuery = jest.fn().mockResolvedValue({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [{
          id: 'response-1',
          action: 'clarify',
          explanation: '只在工作压力高时这样做',
          created_at: '2026-08-28T00:00:00.000Z',
        }],
      });
    const client = { query: clientQuery, release: jest.fn() };
    const { db } = dbForResult();
    (db.pool as unknown as { connect: jest.Mock }).connect = jest.fn().mockResolvedValue(client);
    const service = new ThemeAssessmentService(db, {} as never);

    await expect(service.respondToResult('user-1', 'round-1', {
      operation_id: 'operation-1',
      action: 'clarify',
      explanation: '只在工作压力高时这样做',
    })).resolves.toMatchObject({
      response_id: 'response-1',
      replayed: true,
      state: 'needs_follow_up',
    });
  });

  it('returns the concurrent write when the unique operation key wins another request', async () => {
    const concurrentResponse = {
      id: 'response-concurrent',
      action: 'partial',
      explanation: '只有在权力关系不对等时才会这样',
      created_at: '2026-08-28T00:00:00.000Z',
    };
    const clientQuery = jest.fn().mockResolvedValue({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [concurrentResponse] });
    const client = { query: clientQuery, release: jest.fn() };
    const { db } = dbForResult();
    (db.pool as unknown as { connect: jest.Mock }).connect = jest.fn().mockResolvedValue(client);
    const service = new ThemeAssessmentService(db, {} as never);

    await expect(service.respondToResult('user-1', 'round-1', {
      operation_id: 'operation-1',
      action: 'partial',
      explanation: '只有在权力关系不对等时才会这样',
    })).resolves.toMatchObject({
      response_id: 'response-concurrent',
      replayed: true,
      state: 'needs_follow_up',
    });

    expect(clientQuery).toHaveBeenCalledWith(
      expect.stringContaining('ON CONFLICT (result_revision_id, operation_id) DO NOTHING'),
      expect.any(Array),
    );
    expect(clientQuery).toHaveBeenCalledWith('COMMIT');
    expect(client.release).toHaveBeenCalledTimes(1);
  });

  it('returns the latest feedback state in round history without a per-round lookup', async () => {
    const query = jest.fn().mockResolvedValue({
      rows: [{
        id: 'round-1',
        theme_lens: 'emotion',
        status: 'completed',
        completed_at: '2026-08-28T00:00:00.000Z',
        result: resultRow().result,
        has_disputed_feedback: true,
        whole_result_feedback_action: 'refute',
        latest_feedback_action: 'confirm',
      }],
    });
    const service = new ThemeAssessmentService({ pool: { query } } as never, {} as never);

    await expect(service.list('user-1')).resolves.toMatchObject([{
      id: 'round-1',
      feedback_state: 'needs_follow_up',
      whole_result_refuted: true,
      latest_feedback_action: 'confirm',
    }]);
    expect(query).toHaveBeenCalledTimes(1);
    expect(query.mock.calls[0][0]).toContain('theme_assessment_result_responses');
    expect(query.mock.calls[0][0]).toContain('PARTITION BY evidence_question_id');
    expect(query.mock.calls[0][0]).toContain('FILTER (WHERE evidence_question_id IS NULL)');
  });

  it('filters out previous feedback recommendations when evidence_collection is revoked', async () => {
    const queries: string[] = [];
    const query = jest.fn().mockImplementation(async (statement: string) => {
      queries.push(statement);
      return { rows: [] };
    });
    const service = new ThemeAssessmentService({ pool: { query } } as never, {} as never);
    jest.spyOn(service as any, 'coverageCounts').mockResolvedValue({
      themes: [],
      recommended_theme: 'emotion',
      recommendation: '覆盖不足',
    });

    await service.recommendNextRound('user-1');
    expect(queries.some((sql) => sql.includes("cg.consent_type = 'evidence_collection' AND cg.granted = false"))).toBe(true);
  });

  it('atomically enforces store_only user_scope on theme result completion', async () => {
    const questions = selectThemeRoundCore('emotion', 0);
    let revisionInsertSql = '';
    const query = jest.fn().mockImplementation(async (statement: string) => {
      if (statement.includes('INSERT INTO theme_assessment_result_revisions')) {
        revisionInsertSql = statement;
        return { rows: [{ id: 'rev-1', revision_number: 1, result: {}, published_at: new Date().toISOString() }] };
      }
      return { rows: [] };
    });
    const service = new ThemeAssessmentService({ pool: { query } } as never, {} as never);
    jest.spyOn(service as any, 'getRound').mockResolvedValue({
      id: 'round-1', theme_lens: 'emotion', locale: 'zh-CN', status: 'ready_to_complete',
      question_bank_version: 'test-v1', completed_at: null,
    });
    jest.spyOn(service, 'next').mockResolvedValue({ state: 'ready_to_complete' } as never);
    jest.spyOn(service as any, 'loadRoundState').mockResolvedValue({
      items: questions.map((definition, index) => ({ id: `item-${index}`, definition })),
      answers: questions.map((_, index) => ({
        item_id: `item-${index}`, choice_id: 'A', free_text: null,
        answered_at: '2026-09-26T00:00:00.000Z',
      })),
    });
    jest.spyOn(service, 'getResult').mockResolvedValue({ round_id: 'round-1' } as never);

    await service.complete('user-1', 'round-1');
    expect(revisionInsertSql).toContain('user_scope AS');
    expect(revisionInsertSql).toContain("cg.consent_type = 'evidence_collection' AND cg.granted = false");
    expect(revisionInsertSql).toContain('jsonb_set');
  });
});
