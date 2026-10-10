import { ThemeAssessmentService } from './theme-assessment.service.js';
import { GUEST_EPISODE_ID, GUEST_EPISODE_VERSION, RAIN_BEFORE_STOP_NODES } from '@eva/core';

const GUEST_RUN_ID = '8f5691be-f7d0-4d9f-b21a-52fc40b17c1e';

function validCommand() {
  return {
    guest_run_id: GUEST_RUN_ID,
    version: GUEST_EPISODE_VERSION,
    adult_confirmed: true,
    answers: RAIN_BEFORE_STOP_NODES.map((node) => ({
      node_id: node.id,
      choice_id: node.options[0].id,
    })),
  };
}

describe('GuestAssessment API Logic', () => {
  beforeAll(() => {
    process.env.JWT_SECRET = 'guest-acceptance-secret';
  });

  it('generates guest opening nodes', async () => {
    const service = new ThemeAssessmentService({} as never, {} as never);
    const opening = await service.getGuestOpening();
    expect(opening.episode_id).toBe(GUEST_EPISODE_ID);
    expect(opening.nodes.length).toBe(6);
    expect(JSON.stringify(opening.nodes)).not.toContain('approach');
    expect(opening.nodes.every((node) => node.options.every((option) => option.consequence))).toBe(true);
  });

  it('completes guest opening and signs token', async () => {
    const service = new ThemeAssessmentService({} as never, {} as never);
    const res = await service.completeGuestOpening(validCommand());
    expect(res.result).toBeDefined();
    expect(res.claim_token).toBeDefined();
    expect(res.claim_token.split('.')).toHaveLength(2);
  });

  it.each([
    [{ ...validCommand(), adult_confirmed: false }, 'adult_confirmation_required'],
    [{ ...validCommand(), version: 'wrong-version' }, 'guest_episode_version_invalid'],
    [{ ...validCommand(), guest_run_id: 'not-a-uuid' }, 'guest_run_id_invalid'],
    [{ ...validCommand(), answers: undefined }, 'guest_answers_invalid'],
  ])('rejects an invalid completion contract', async (command, code) => {
    const service = new ThemeAssessmentService({} as never, {} as never);
    await expect(service.completeGuestOpening(command as never)).rejects.toMatchObject({
      response: { code },
    });
  });

  it('rejects a tampered claim before touching the database', async () => {
    const service = new ThemeAssessmentService({} as never, {} as never);
    const completed = await service.completeGuestOpening(validCommand());
    const [payload, signature] = completed.claim_token.split('.');
    const tampered = `${payload}x.${signature}`;

    await expect(
      service.claimGuestOpening('user-1', { claim_token: tampered })
    ).rejects.toMatchObject({ response: { code: 'invalid_claim_signature' } });
  });

  it('rejects malformed and expired claims before touching the database', async () => {
    const service = new ThemeAssessmentService({} as never, {} as never);
    await expect(
      service.claimGuestOpening('user-1', { claim_token: 'invalid' })
    ).rejects.toMatchObject({ response: { code: 'invalid_claim_token' } });

    const completedAt = Date.now();
    const completed = await service.completeGuestOpening(validCommand());
    const clock = jest.spyOn(Date, 'now').mockReturnValue(completedAt + 25 * 60 * 60 * 1000);
    try {
      await expect(
        service.claimGuestOpening('user-1', { claim_token: completed.claim_token })
      ).rejects.toMatchObject({ response: { code: 'claim_token_expired' } });
    } finally {
      clock.mockRestore();
    }
  });

  it('fails closed in production when no signing secret exists', async () => {
    const previousNodeEnv = process.env.NODE_ENV;
    const previousJwtSecret = process.env.JWT_SECRET;
    const previousGuestSecret = process.env.GUEST_CLAIM_SECRET;
    process.env.NODE_ENV = 'production';
    delete process.env.JWT_SECRET;
    delete process.env.GUEST_CLAIM_SECRET;
    try {
      const service = new ThemeAssessmentService({} as never, {} as never);
      await expect(service.completeGuestOpening(validCommand())).rejects.toMatchObject({
        response: { code: 'guest_claim_secret_missing' },
      });
    } finally {
      process.env.NODE_ENV = previousNodeEnv;
      process.env.JWT_SECRET = previousJwtSecret;
      if (previousGuestSecret === undefined) delete process.env.GUEST_CLAIM_SECRET;
      else process.env.GUEST_CLAIM_SECRET = previousGuestSecret;
    }
  });

  it('persists six traceable choices in one simulation source group when claimed', async () => {
    let savedResult: Record<string, unknown> | null = null;
    let itemCount = 0;
    const clientQuery = jest.fn(async (sql: string, params?: unknown[]) => {
      if (sql.includes('SELECT id, user_id FROM theme_assessment_rounds')) return { rows: [] };
      if (sql.includes('INSERT INTO theme_assessment_rounds')) return { rows: [{ id: 'round-1' }] };
      if (sql.includes('INSERT INTO theme_assessment_round_items')) {
        itemCount += 1;
        return { rows: [{ id: `item-${itemCount}` }] };
      }
      if (sql.includes('INSERT INTO theme_assessment_result_revisions')) {
        savedResult = JSON.parse(String(params?.[1]));
      }
      return { rows: [] };
    });
    const poolQuery = jest.fn(async (sql: string) => {
      if (sql.includes('FROM theme_assessment_rounds') && sql.includes('WHERE id = $1')) {
        return {
          rows: [{
            id: 'round-1',
            theme_lens: 'workplace',
            locale: 'zh-CN',
            status: 'completed',
            question_bank_version: 'guest-rain-before-stop-v1',
            completed_at: '2026-09-02T00:00:00.000Z',
          }],
        };
      }
      if (sql.includes('FROM theme_assessment_result_revisions')) {
        return {
          rows: [{
            id: 'revision-1',
            revision_number: 1,
            published_at: '2026-09-02T00:00:00.000Z',
            result: savedResult,
          }],
        };
      }
      return { rows: [] };
    });
    const db = {
      pool: {
        connect: async () => ({ query: clientQuery, release: jest.fn() }),
        query: poolQuery,
      },
    };
    const service = new ThemeAssessmentService(db as never, {} as never);
    const completed = await service.completeGuestOpening(validCommand());

    const claimed = await service.claimGuestOpening('user-1', {
      claim_token: completed.claim_token,
    });

    expect(claimed.round_id).toBe('round-1');
    expect(clientQuery.mock.calls.filter(([sql]) => String(sql).includes('INSERT INTO theme_assessment_round_items'))).toHaveLength(6);
    expect(clientQuery.mock.calls.filter(([sql]) => String(sql).includes('INSERT INTO theme_assessment_round_answers'))).toHaveLength(6);
    expect(savedResult).toMatchObject({
      episode_id: GUEST_EPISODE_ID,
      evidence_kind: 'simulation',
      science_status: 'candidate_only',
      source_independence_group: expect.stringContaining(GUEST_RUN_ID),
    });
    expect(savedResult.guest_report).toMatchObject({
      episode_id: GUEST_EPISODE_ID,
      story_replay: expect.any(String),
      observations: expect.arrayContaining([
        expect.objectContaining({ id: expect.stringMatching(/^guest:/), evidence_node_ids: expect.any(Array) }),
      ]),
    });
    expect(savedResult.observations).toEqual(expect.arrayContaining([
      expect.objectContaining({ evidence_question_id: expect.stringMatching(/^guest:/) }),
    ]));
  });
});
