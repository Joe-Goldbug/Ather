import {
  BadRequestException,
  ConflictException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import {
  THEME_LENSES,
  THEME_QUESTION_BANK_VERSION,
  buildThemeRoundResult,
  decideThemeRoundFollowUp,
  getThemeTitle,
  getThemeQuestionBank,
  selectThemeRoundCore,
  type RoundStatus,
  type ThemeLens,
  type ThemeQuestion,
  type ThemeRoundAnswer,
  type ThemeRoundResult,
  type RoundApproach,
  validateThemeRoundAnswers,
} from '@eva/core';

import {
  GUEST_EPISODE_ID,
  GUEST_EPISODE_VERSION,
  GUEST_QUESTION_BANK_VERSION,
  GUEST_COPY_VERSION,
  RAIN_BEFORE_STOP_NODES,
  buildGuestEpisodeResult,
  validateGuestEpisodeAnswers
} from '@eva/core';
import * as crypto from 'crypto';

export interface CompleteGuestOpeningBody {
  guest_run_id: string;
  version: string;
  adult_confirmed: boolean;
  answers: { node_id: string; choice_id: 'A' | 'B' | 'C' | 'D' }[];
}

export interface ClaimGuestOpeningBody {
  claim_token: string;
}

import { Database } from '../../common/database.js';
import { FORMAL_EVIDENCE_VIEW } from '../../common/formal-evidence.js';
import { ThemeFollowupGeneratorService } from './theme-followup-generator.service.js';
import { ThemeQuestionGeneratorService, type CoreQuestionInput, type PriorRoundSummary, type DiaryDigestEntry } from './theme-question-generator.service.js';
import { ThemeInsightGeneratorService, type AiInsight } from './theme-insight-generator.service.js';
import { EVA_THEME_AI_PERSONALIZATION, EVA_THEME_AI_INSIGHT } from '../../common/feature-flags.js';
import { sanitizeUserContext } from './llm-guards.js';

type RoundRow = {
  id: string;
  theme_lens: ThemeLens;
  locale: string;
  status: RoundStatus;
  question_bank_version: string;
  completed_at: string | null;
  selection_decision?: ThemeRoundSelection | null;
};
type ItemRow = {
  id: string;
  ordinal: number;
  definition: ThemeQuestion;
  role: 'core' | 'clarifier' | 'counterexample';
  source: 'static' | 'dynamic';
};
type AnswerRow = {
  item_id: string;
  choice_id: 'A' | 'B' | 'C' | 'D';
  free_text: string | null;
  answered_at: string;
};

export type StartThemeRoundCommand = { theme?: ThemeLens; locale?: string };
export type SubmitThemeRoundAnswerCommand = {
  operation_id: string;
  choice_id: 'A' | 'B' | 'C' | 'D';
  free_text?: string;
};
export type RespondThemeResultCommand = {
  operation_id: string;
  action: 'confirm' | 'partial' | 'refute' | 'clarify';
  explanation?: string;
  observation_question_id?: string;  // P0-3：指定对哪条 observation 反馈；undefined/null 表示整报告级
};

export type ThemeResultFeedbackState = 'not_responded' | 'recorded' | 'needs_follow_up';

export type ThemeResultFeedback = {
  response_id: string;
  action: RespondThemeResultCommand['action'];
  explanation: string | null;
  observation_question_id: string | null;
  state: Exclude<ThemeResultFeedbackState, 'not_responded'>;
  created_at: string;
};

type FollowupTarget = {
  response_id: string;
  result_revision_id: string;
  observation_question_id: string | null;
  action: 'partial' | 'refute' | 'clarify';
};

type ThemeRoundSelection = {
  rule_version: 'theme-feedback-v1';
  reason: 'manual_theme' | 'verify_disagreement' | 'clarify_partial' | 'use_added_context' | 'add_context' | 'refresh_stale_evidence' | 'explore_domain';
  reason_zh: string;
  target: FollowupTarget | null;
  status: 'targeted' | 'theme_followup' | 'target_unavailable' | 'theme_selection';
  selected_question_id: string | null;
  personalization?: {
    enabled: boolean;
    generated_count: number;
    fallback_count: number;
    input_snapshot: {
      prior_rounds: number;
      diary_entries: number;
      used_focus_contexts: string[];
    };
  };
};

type Recommendation = {
  theme_lens: ThemeLens;
  reason: 'verify_disagreement' | 'clarify_partial' | 'use_added_context' | 'add_context' | 'refresh_stale_evidence' | 'explore_domain';
  reason_zh: string;
  target: FollowupTarget | null;
};

const RESULT_FEEDBACK_ACTIONS = new Set<RespondThemeResultCommand['action']>([
  'confirm',
  'partial',
  'refute',
  'clarify',
]);

function feedbackState(action: RespondThemeResultCommand['action']): ThemeResultFeedback['state'] {
  return action === 'confirm' ? 'recorded' : 'needs_follow_up';
}

function normalizeExplanation(explanation: string | null | undefined) {
  return explanation?.trim() || null;
}

const GUEST_CLAIM_TTL_MS = 24 * 60 * 60 * 1000;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type GuestClaimPayload = {
  guest_run_id: string;
  episode_id: typeof GUEST_EPISODE_ID;
  version: typeof GUEST_EPISODE_VERSION;
  question_bank_version: typeof GUEST_QUESTION_BANK_VERSION;
  answers: CompleteGuestOpeningBody['answers'];
  expires_at: number;
};

function guestClaimSecret() {
  const secret = process.env.GUEST_CLAIM_SECRET?.trim() || process.env.JWT_SECRET?.trim();
  if (secret) return secret;
  if (process.env.NODE_ENV === 'production') {
    throw new InternalServerErrorException({ code: 'guest_claim_secret_missing' });
  }
  return 'eva-local-guest-claim-secret';
}

function publicGuestNodes(guestRunId: string) {
  return RAIN_BEFORE_STOP_NODES.map((node) => ({
    id: node.id,
    title: node.title,
    context: node.context,
    options: [...node.options]
      .sort((left, right) => {
        const leftHash = crypto.createHash('sha256').update(`${guestRunId}:${node.id}:${left.id}`).digest('hex');
        const rightHash = crypto.createHash('sha256').update(`${guestRunId}:${node.id}:${right.id}`).digest('hex');
        return leftHash.localeCompare(rightHash);
      })
      .map(({ id, text, consequence }) => ({ id, text, consequence })),
  }));
}

function signGuestClaim(payload: GuestClaimPayload) {
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = crypto.createHmac('sha256', guestClaimSecret()).update(encodedPayload).digest('base64url');
  return `${encodedPayload}.${signature}`;
}

function readGuestClaim(token: string): GuestClaimPayload {
  const [encodedPayload, suppliedSignature, extra] = String(token ?? '').split('.');
  if (!encodedPayload || !suppliedSignature || extra) {
    throw new BadRequestException({ code: 'invalid_claim_token' });
  }
  const expectedSignature = crypto
    .createHmac('sha256', guestClaimSecret())
    .update(encodedPayload)
    .digest('base64url');
  const supplied = Buffer.from(suppliedSignature);
  const expected = Buffer.from(expectedSignature);
  if (supplied.length !== expected.length || !crypto.timingSafeEqual(supplied, expected)) {
    throw new BadRequestException({ code: 'invalid_claim_signature' });
  }

  let payload: GuestClaimPayload;
  try {
    payload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8'));
  } catch {
    throw new BadRequestException({ code: 'invalid_claim_token' });
  }
  if (
    payload.episode_id !== GUEST_EPISODE_ID ||
    payload.version !== GUEST_EPISODE_VERSION ||
    payload.question_bank_version !== GUEST_QUESTION_BANK_VERSION ||
    !UUID_PATTERN.test(payload.guest_run_id) ||
    validateGuestEpisodeAnswers(payload.answers ?? []).length > 0
  ) {
    throw new BadRequestException({ code: 'invalid_claim_payload' });
  }
  if (!Number.isFinite(payload.expires_at) || payload.expires_at < Date.now()) {
    throw new BadRequestException({ code: 'claim_token_expired' });
  }
  return payload;
}

@Injectable()
export class ThemeAssessmentService {
  constructor(
    private readonly db: Database,
    private readonly followupGenerator: ThemeFollowupGeneratorService,
    private readonly questionGenerator: ThemeQuestionGeneratorService,
    private readonly insightGenerator: ThemeInsightGeneratorService,
  ) {}


  async getGuestOpening() {
    const guestRunId = crypto.randomUUID();
    return {
      guest_run_id: guestRunId,
      episode_id: GUEST_EPISODE_ID,
      episode_version: GUEST_EPISODE_VERSION,
      question_bank_version: GUEST_QUESTION_BANK_VERSION,
      copy_version: GUEST_COPY_VERSION,
      expires_at: new Date(Date.now() + GUEST_CLAIM_TTL_MS).toISOString(),
      nodes: publicGuestNodes(guestRunId),
    };
  }

  async completeGuestOpening(command: CompleteGuestOpeningBody) {
    if (!command?.adult_confirmed) {
      throw new BadRequestException({ code: 'adult_confirmation_required' });
    }
    if (command.version !== GUEST_EPISODE_VERSION) {
      throw new BadRequestException({ code: 'guest_episode_version_invalid' });
    }
    if (!UUID_PATTERN.test(command.guest_run_id ?? '')) {
      throw new BadRequestException({ code: 'guest_run_id_invalid' });
    }
    if (!Array.isArray(command.answers)) {
      throw new BadRequestException({ code: 'guest_answers_invalid', errors: ['answers_required'] });
    }
    const errors = validateGuestEpisodeAnswers(command.answers);
    if (errors.length) throw new BadRequestException({ code: 'guest_answers_invalid', errors });
    const result = buildGuestEpisodeResult(command.answers);
    if (!result) throw new BadRequestException({ code: 'guest_result_invalid' });

    const payload: GuestClaimPayload = {
      guest_run_id: command.guest_run_id,
      episode_id: GUEST_EPISODE_ID,
      version: command.version,
      question_bank_version: GUEST_QUESTION_BANK_VERSION,
      answers: command.answers,
      expires_at: Date.now() + GUEST_CLAIM_TTL_MS,
    };

    return {
      result: {
        ...result,
        source_independence_group: `${result.source_independence_group}:${command.guest_run_id}`,
      },
      claim_token: signGuestClaim(payload),
    };
  }

  async claimGuestOpening(userId: string, command: ClaimGuestOpeningBody) {
    const data = readGuestClaim(command?.claim_token);
    const baseResult = buildGuestEpisodeResult(data.answers);
    if (!baseResult) throw new BadRequestException({ code: 'guest_result_invalid' });
    const result = {
      ...baseResult,
      source_independence_group: `${baseResult.source_independence_group}:${data.guest_run_id}`,
    };

    const client = await this.db.pool.connect();
    try {
      await client.query('BEGIN');
      const existing = await client.query(
        'SELECT id, user_id FROM theme_assessment_rounds WHERE guest_run_id = $1 FOR UPDATE',
        [data.guest_run_id]
      );
      if (existing.rows[0]) {
        if (existing.rows[0].user_id !== userId) {
          throw new ConflictException({ code: 'guest_run_already_claimed' });
        }
        await client.query('COMMIT');
        return this.getResult(userId, existing.rows[0].id);
      }

      const theme = 'workplace';
      const roundResult = await client.query(
        `INSERT INTO theme_assessment_rounds (user_id, theme_lens, locale, question_bank_version, status, entry_source, guest_run_id, completed_at)
         VALUES ($1, $2, $3, $4, 'completed', 'guest_opening_claim', $5, NOW())
         ON CONFLICT (guest_run_id) WHERE guest_run_id IS NOT NULL DO NOTHING
         RETURNING id`,
        [userId, theme, 'zh-CN', GUEST_QUESTION_BANK_VERSION, data.guest_run_id]
      );
      if (!roundResult.rows[0]) {
        const concurrent = await client.query(
          'SELECT id, user_id FROM theme_assessment_rounds WHERE guest_run_id = $1',
          [data.guest_run_id]
        );
        if (!concurrent.rows[0]) {
          throw new ConflictException({ code: 'guest_claim_write_conflict' });
        }
        if (concurrent.rows[0].user_id !== userId) {
          throw new ConflictException({ code: 'guest_run_already_claimed' });
        }
        await client.query('COMMIT');
        return this.getResult(userId, concurrent.rows[0].id);
      }
      const roundId = roundResult.rows[0].id;

      const evidence = [];
      for (const [index, answer] of data.answers.entries()) {
        const node = RAIN_BEFORE_STOP_NODES.find((candidate) => candidate.id === answer.node_id)!;
        const option = node.options.find((candidate) => candidate.id === answer.choice_id)!;
        const definition = {
          episode_id: GUEST_EPISODE_ID,
          episode_version: GUEST_EPISODE_VERSION,
          source_independence_group: result.source_independence_group,
          evidence_kind: result.evidence_kind,
          science_status: result.science_status,
          node_id: node.id,
          title: node.title,
          context: node.context,
          options: node.options,
        };
        const item = await client.query(
          `INSERT INTO theme_assessment_round_items
             (round_id, ordinal, question_id, role, source, definition)
           VALUES ($1, $2, $3, 'core', 'static', $4::jsonb)
           RETURNING id`,
          [roundId, index + 1, node.id, JSON.stringify(definition)]
        );
        await client.query(
          `INSERT INTO theme_assessment_round_answers
             (round_id, item_id, user_id, operation_id, choice_id)
           VALUES ($1, $2, $3, $4, $5)`,
          [roundId, item.rows[0].id, userId, `guest-claim:${data.guest_run_id}:${node.id}`, answer.choice_id]
        );
        evidence.push({
          question_id: node.id,
          focus_label: node.title,
          context_label: '模拟章节',
          choice_id: answer.choice_id,
          choice_text: option.text,
          approach: option.approach,
        });
      }

      const adaptedResult = {
         result_version: GUEST_EPISODE_VERSION,
         theme_lens: theme,
         theme_title: result.episode_title,
         headline: result.summary,
         summary: result.pattern,
         observations: [{
           focus: '本章出现的做法',
           text: result.pattern,
           evidence_question_id: GUEST_EPISODE_ID,
         }],
         strength: result.benefits,
         watchout: result.costs,
         counterevidence: result.exceptions,
         boundary: result.unknowns,
         evidence,
         episode_id: GUEST_EPISODE_ID,
         source_independence_group: result.source_independence_group,
         evidence_kind: result.evidence_kind,
         science_status: result.science_status,
      };

      await client.query(
        `WITH user_scope AS (
           SELECT NOT EXISTS (
             SELECT 1 FROM consent_grants cg
             WHERE cg.user_id = $3
               AND cg.consent_type = 'evidence_collection' AND cg.granted = false
           ) AS is_allowed
         )
         INSERT INTO theme_assessment_result_revisions (round_id, revision_number, result)
         SELECT $1, 1,
                CASE WHEN (SELECT is_allowed FROM user_scope) THEN $2::jsonb
                     ELSE jsonb_set($2::jsonb, '{boundary}', to_jsonb(($2::jsonb->>'boundary') || '（当前处于仅保存模式，此记录仅供个人查阅，不参与画像分析与证据收集）'))
                END
         FROM user_scope`,
        [roundId, JSON.stringify(adaptedResult), userId]
      );

      await client.query('COMMIT');
      return this.getResult(userId, roundId);
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      throw error;
    } finally {
      client.release();
    }
  }

  async start(userId: string, command: StartThemeRoundCommand) {
    // Track A only has a reviewed Chinese item bank. Do not present Chinese copy
    // as though an unreviewed locale were a valid assessment.
    if (command.locale && command.locale !== 'zh-CN') {
      throw new BadRequestException({
        code: 'theme_assessment_locale_not_supported',
        message: '连续主题测试目前仅支持已审核的中文版本。',
      });
    }

    const recommendation = await this.recommendNextRound(userId);
    const theme = command.theme ?? recommendation.theme_lens;
    if (!THEME_LENSES.includes(theme))
      throw new BadRequestException({ code: 'invalid_theme_lens' });
    const ordinalResult = await this.db.pool.query<{ total: string }>(
      `SELECT COUNT(*)::text AS total FROM theme_assessment_rounds WHERE user_id = $1 AND theme_lens = $2`,
      [userId, theme]
    );
    const roundOrdinal = Number(ordinalResult.rows[0]?.total ?? 0);
    const target = theme === recommendation.theme_lens ? recommendation.target : null;
    const core = selectThemeRoundCore(theme, roundOrdinal, target?.observation_question_id ?? undefined);

    let personalization: ThemeRoundSelection['personalization'] = undefined;
    if (EVA_THEME_AI_PERSONALIZATION && roundOrdinal >= 1) {
      const priorRounds = await this.gatherPriorRoundSummaries(userId, theme);
      const diaryDigest = await this.gatherDiaryDigest(userId);
      const usedFocusContexts = core.map((question) => `${question.focus_key}.${question.context}`);
      const generated = await this.questionGenerator.generateCoreQuestions({
        theme_lens: theme,
        prior_rounds: priorRounds,
        diary_digest: diaryDigest,
        used_focus_contexts: usedFocusContexts,
      });
      let generatedCount = 0;
      if (generated && generated.size > 0) {
        for (const [index, question] of core.entries()) {
          const promptText = generated.get(question.focus_key);
          if (promptText) {
            generatedCount++;
            core[index] = {
              ...question,
              question_id: `${question.theme_lens}.${question.focus_key}.${question.context}.dyn${roundOrdinal}`,
              source: 'dynamic' as const,
              prompt: promptText,
            };
          }
        }
      }
      personalization = {
        enabled: true,
        generated_count: generatedCount,
        fallback_count: 6 - generatedCount,
        input_snapshot: {
          prior_rounds: priorRounds.length,
          diary_entries: diaryDigest.length,
          used_focus_contexts: usedFocusContexts,
        },
      };
    }

    const targetQuestion = target?.observation_question_id
      ? getThemeQuestionBank(theme).find((question) => question.question_id === target.observation_question_id)
      : null;
    const selectedTargetQuestion = targetQuestion && core[0]?.focus_key === targetQuestion.focus_key
      ? core[0]
      : null;
    const selection: ThemeRoundSelection = {
      rule_version: 'theme-feedback-v1',
      reason: command.theme && command.theme !== recommendation.theme_lens
        ? 'manual_theme'
        : recommendation.reason,
      reason_zh: command.theme && command.theme !== recommendation.theme_lens
        ? `你选择了「${getThemeTitle(theme)}」；本轮按你的选择开始。`
        : target?.observation_question_id && !selectedTargetQuestion
          ? '上轮反馈仍待跟进，但当前题库没有同一观察焦点的替代情境。'
          : recommendation.reason_zh,
      target,
      status: target
        ? !target.observation_question_id ? 'theme_followup'
          : selectedTargetQuestion ? 'targeted' : 'target_unavailable'
        : 'theme_selection',
      selected_question_id: core[0]?.question_id ?? null,
      personalization,
    };
    const client = await this.db.pool.connect();
    try {
      await client.query('BEGIN');
      const roundResult = await client.query<RoundRow>(
        `INSERT INTO theme_assessment_rounds
           (user_id, theme_lens, locale, question_bank_version, selection_decision)
         VALUES ($1, $2, $3, $4, $5::jsonb)
         RETURNING id, theme_lens, locale, status, question_bank_version, completed_at, selection_decision`,
        [userId, theme, command.locale ?? 'zh-CN', THEME_QUESTION_BANK_VERSION, JSON.stringify(selection)]
      );
      const round = roundResult.rows[0]!;
      for (const [index, question] of core.entries()) {
        await client.query(
          `INSERT INTO theme_assessment_round_items (round_id, ordinal, question_id, role, source, definition)
           VALUES ($1, $2, $3, $4, $5, $6::jsonb)`,
          [
            round.id,
            index + 1,
            question.question_id,
            question.role,
            question.source,
            JSON.stringify(question),
          ]
        );
      }
      await client.query('COMMIT');
      return {
        round,
        recommendation: command.theme ? null : getThemeTitle(theme),
        selection,
        next: await this.next(userId, round.id),
      };
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      throw error;
    } finally {
      client.release();
    }
  }

  async next(userId: string, roundId: string) {
    const round = await this.getRound(userId, roundId);
    if (round.status === 'completed') return { state: 'completed' as const, selection: round.selection_decision ?? null };
    const { items, answers } = await this.loadRoundState(roundId);
    const unanswered = items.find((item) => !answers.some((answer) => answer.item_id === item.id));
    if (unanswered)
      return {
        state: 'question' as const,
        item_id: unanswered.id,
        decision_index: unanswered.ordinal,
        decision_minimum: 6,
        decision_maximum: 8,
        question: unanswered.definition,
        selection: round.selection_decision ?? null,
      };

    const coreItems = items.filter((item) => item.role === 'core');
    if (coreItems.length < 6)
      throw new ConflictException({ code: 'round_requires_six_core_questions' });
    const adaptiveCount = items.length - coreItems.length;
    if (adaptiveCount < 2) {
      const fallback = decideThemeRoundFollowUp(
        items.map((item) => item.definition),
        this.toCoreAnswers(items, answers)
      );
      const followup = fallback
        ? await this.followupGenerator.rephrase(fallback, this.toCoreAnswers(items, answers))
        : null;
      if (followup) {
        const inserted = await this.db.pool.query<ItemRow>(
          `INSERT INTO theme_assessment_round_items (round_id, ordinal, question_id, role, source, parent_item_id, definition)
           VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)
           RETURNING id, ordinal, definition, role, source`,
          [
            roundId,
            items.length + 1,
            followup.question_id,
            followup.role,
            followup.source,
            items.filter((item) => item.role !== 'core').at(-1)?.id ?? null,
            JSON.stringify(followup),
          ]
        );
        return {
          state: 'question' as const,
          item_id: inserted.rows[0]!.id,
          decision_index: inserted.rows[0]!.ordinal,
          decision_minimum: 6,
          decision_maximum: 8,
          question: inserted.rows[0]!.definition,
          selection: round.selection_decision ?? null,
        };
      }
    }
    await this.db.pool.query(
      `UPDATE theme_assessment_rounds SET status = 'ready_to_complete', updated_at = NOW() WHERE id = $1`,
      [roundId]
    );
    return {
      state: 'ready' as const,
      completed_decisions: answers.length,
      message: '本轮有效决策点已完成。',
      selection: round.selection_decision ?? null,
    };
  }

  async submitAnswer(
    userId: string,
    roundId: string,
    itemId: string,
    command: SubmitThemeRoundAnswerCommand
  ) {
    if (!command.operation_id?.trim())
      throw new BadRequestException({ code: 'operation_id_required' });
    const round = await this.getRound(userId, roundId);
    if (round.status === 'completed')
      throw new ConflictException({ code: 'round_already_completed' });
    const itemResult = await this.db.pool.query<ItemRow>(
      `SELECT id, ordinal, definition, role, source FROM theme_assessment_round_items
       WHERE id = $1 AND round_id = $2 AND invalidated_at IS NULL`,
      [itemId, roundId]
    );
    const item = itemResult.rows[0];
    if (!item || !item.definition.options.some((option) => option.id === command.choice_id)) {
      throw new NotFoundException({ code: 'question_not_available' });
    }
    const client = await this.db.pool.connect();
    try {
      await client.query('BEGIN');
      const replay = await client.query<{ choice_id: string }>(
        `SELECT choice_id FROM theme_assessment_round_answers WHERE round_id = $1 AND operation_id = $2`,
        [roundId, command.operation_id]
      );
      if (replay.rows[0]) {
        if (replay.rows[0].choice_id !== command.choice_id)
          throw new ConflictException({ code: 'operation_id_reused' });
      } else {
        const prior = await client.query<{ id: string }>(
          `SELECT id FROM theme_assessment_round_answers WHERE item_id = $1 AND invalidated_at IS NULL LIMIT 1`,
          [itemId]
        );
        if (prior.rows[0]) {
          await client.query(
            `UPDATE theme_assessment_round_answers SET invalidated_at = NOW(), updated_at = NOW() WHERE id = $1`,
            [prior.rows[0].id]
          );
        }
        await client.query(
          `INSERT INTO theme_assessment_round_answers (round_id, item_id, user_id, operation_id, choice_id, free_text)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [
            roundId,
            itemId,
            userId,
            command.operation_id,
            command.choice_id,
            command.free_text?.trim() || null,
          ]
        );
        if (item.role === 'core') {
          await client.query(
            `UPDATE theme_assessment_round_items SET invalidated_at = NOW() WHERE round_id = $1 AND role <> 'core' AND invalidated_at IS NULL`,
            [roundId]
          );
          await client.query(
            `UPDATE theme_assessment_round_answers SET invalidated_at = NOW() WHERE round_id = $1 AND item_id IN (SELECT id FROM theme_assessment_round_items WHERE round_id = $1 AND role <> 'core') AND invalidated_at IS NULL`,
            [roundId]
          );
          await client.query(
            `UPDATE theme_assessment_result_revisions SET invalidated_at = NOW() WHERE round_id = $1 AND invalidated_at IS NULL`,
            [roundId]
          );
        }
      }
      await client.query(
        `UPDATE theme_assessment_rounds SET status = 'in_progress', updated_at = NOW() WHERE id = $1`,
        [roundId]
      );
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      throw error;
    } finally {
      client.release();
    }
    return this.next(userId, roundId);
  }

  async complete(userId: string, roundId: string) {
    const round = await this.getRound(userId, roundId);
    if (round.status === 'completed') return this.getResult(userId, roundId);
    const next = await this.next(userId, roundId);
    if (next.state === 'question')
      throw new ConflictException({ code: 'round_requires_next_answer', next });
    const { items, answers } = await this.loadRoundState(roundId);
    const serializedAnswers = this.toCoreAnswers(items, answers);
    const errors = validateThemeRoundAnswers(
      items.map((item) => item.definition),
      serializedAnswers
    );
    if (errors.length) throw new ConflictException({ code: 'round_incomplete', errors });
    const result = buildThemeRoundResult(
      round.theme_lens,
      items.map((item) => item.definition),
      serializedAnswers
    );
    if (!result) throw new ConflictException({ code: 'result_withheld' });

    if (EVA_THEME_AI_INSIGHT) {
      const priorRounds = await this.gatherPriorRoundSummaries(userId, round.theme_lens);
      const diaryDigest = await this.gatherDiaryDigest(userId);
      const insight = await this.insightGenerator.generateInsight(
        round.theme_lens, result, priorRounds, diaryDigest,
      );
      if (insight) {
        (result as ThemeRoundResult & { ai_insight?: AiInsight }).ai_insight = insight;
      }
    }

    const saved = await this.db.pool.query<{
      id: string;
      revision_number: number;
      result: ThemeRoundResult;
      published_at: string;
    }>(
      `WITH user_scope AS (
         SELECT NOT EXISTS (
           SELECT 1 FROM consent_grants cg
           WHERE cg.user_id = (SELECT user_id FROM theme_assessment_rounds WHERE id = $1)
             AND cg.consent_type = 'evidence_collection' AND cg.granted = false
         ) AS is_allowed
       ), next_revision AS (
         SELECT COALESCE(MAX(revision_number), 0) + 1 AS number FROM theme_assessment_result_revisions WHERE round_id = $1
       ), inserted AS (
         INSERT INTO theme_assessment_result_revisions (round_id, revision_number, result)
         SELECT $1, number,
                CASE WHEN (SELECT is_allowed FROM user_scope) THEN $2::jsonb
                     ELSE jsonb_set($2::jsonb, '{boundary}', to_jsonb(($2::jsonb->>'boundary') || '（当前处于仅保存模式，此记录仅供个人查阅，不参与画像分析与证据收集）'))
                END
         FROM next_revision
         RETURNING id, revision_number, result, published_at
       ) SELECT * FROM inserted`,
      [roundId, JSON.stringify(result)]
    );
    await this.db.pool.query(
      `UPDATE theme_assessment_rounds SET status = 'completed', completed_at = NOW(), updated_at = NOW() WHERE id = $1`,
      [roundId]
    );

    return this.getResult(userId, roundId);
  }

  async getResult(userId: string, roundId: string) {
    await this.getRound(userId, roundId);
    const row = await this.db.pool.query<{
      id: string;
      revision_number: number;
      result: ThemeRoundResult;
      published_at: string;
    }>(
      `SELECT id, revision_number, result, published_at FROM theme_assessment_result_revisions
       WHERE round_id = $1 AND invalidated_at IS NULL ORDER BY revision_number DESC LIMIT 1`,
      [roundId]
    );
    if (!row.rows[0]) throw new NotFoundException({ code: 'result_not_available' });
    const feedback = await this.getResultFeedback(userId, row.rows[0].id);
    const latestFeedback = feedback[0] ?? null;
    const observationIds = new Set(row.rows[0].result.observations.map((observation) => observation.evidence_question_id));
    const observationFeedback = Object.fromEntries(
      feedback
        .filter((entry) => entry.observation_question_id !== null && observationIds.has(entry.observation_question_id))
        .map((entry) => [entry.observation_question_id, entry]),
    );
    return {
      round_id: roundId,
      result_revision_id: row.rows[0].id,
      revision_number: row.rows[0].revision_number,
      published_at: row.rows[0].published_at,
      result: row.rows[0].result,
      feedback_state: feedback.some((entry) => entry.state === 'needs_follow_up')
        ? 'needs_follow_up'
        : latestFeedback?.state ?? 'not_responded',
      whole_result_refuted: feedback.some((entry) => entry.observation_question_id === null && entry.action === 'refute'),
      latest_feedback: latestFeedback,
      observation_feedback: observationFeedback,
    };
  }

  async respondToResult(userId: string, roundId: string, command: RespondThemeResultCommand) {
    if (!command.operation_id?.trim() || !RESULT_FEEDBACK_ACTIONS.has(command.action)) {
      throw new BadRequestException({ code: 'invalid_response_command' });
    }
    if (command.action === 'clarify' && !command.explanation?.trim()) {
      throw new BadRequestException({ code: 'clarification_explanation_required' });
    }
    const result = await this.getResult(userId, roundId);
    const targetId = command.observation_question_id ?? null;
    if (targetId !== null && !result.result.observations.some((observation) => observation.evidence_question_id === targetId)) {
      throw new BadRequestException({ code: 'observation_not_in_result' });
    }
    const explanation = normalizeExplanation(command.explanation);
    const client = await this.db.pool.connect();
    try {
      await client.query('BEGIN');
      const existing = await client.query<{
        id: string;
        action: RespondThemeResultCommand['action'];
        explanation: string | null;
        evidence_question_id: string | null;
        created_at: string;
      }>(
        `SELECT id, action, explanation, evidence_question_id, created_at
         FROM theme_assessment_result_responses
         WHERE result_revision_id = $1 AND operation_id = $2 AND user_id = $3
         FOR UPDATE`,
        [result.result_revision_id, command.operation_id, userId],
      );

      if (existing.rows[0]) {
        const stored = existing.rows[0];
        if (stored.action !== command.action || normalizeExplanation(stored.explanation) !== explanation ||
            (stored.evidence_question_id ?? null) !== targetId) {
          throw new ConflictException({ code: 'idempotency_key_reused' });
        }
        const feedbackStateResult = await this.aggregateFeedbackState(client, userId, result.result_revision_id);
        await client.query('COMMIT');
        return {
          response_id: stored.id,
          result_revision_id: result.result_revision_id,
          action: stored.action,
          explanation: stored.explanation,
          observation_question_id: stored.evidence_question_id ?? null,
          state: feedbackState(stored.action),
          feedback_state: feedbackStateResult ?? feedbackState(stored.action),
          created_at: stored.created_at,
          replayed: true,
        };
      }

      const inserted = await client.query<{
        id: string;
        action: RespondThemeResultCommand['action'];
        explanation: string | null;
        evidence_question_id: string | null;
        created_at: string;
      }>(
        `INSERT INTO theme_assessment_result_responses
           (result_revision_id, user_id, operation_id, action, explanation, evidence_question_id)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (result_revision_id, operation_id) DO NOTHING
         RETURNING id, action, explanation, evidence_question_id, created_at`,
        [result.result_revision_id, userId, command.operation_id, command.action, explanation, targetId],
      );

      let response = inserted.rows[0];
      let replayed = false;
      if (!response) {
        const concurrent = await client.query<{
          id: string;
          action: RespondThemeResultCommand['action'];
          explanation: string | null;
          evidence_question_id: string | null;
          created_at: string;
        }>(
          `SELECT id, action, explanation, evidence_question_id, created_at
           FROM theme_assessment_result_responses
           WHERE result_revision_id = $1 AND operation_id = $2 AND user_id = $3
           FOR UPDATE`,
          [result.result_revision_id, command.operation_id, userId],
        );
        response = concurrent.rows[0];
        if (!response) throw new ConflictException({ code: 'idempotency_write_conflict' });
        replayed = true;
        if (response.action !== command.action || normalizeExplanation(response.explanation) !== explanation ||
            (response.evidence_question_id ?? null) !== targetId) {
          throw new ConflictException({ code: 'idempotency_key_reused' });
        }
      }

      const feedbackStateResult = await this.aggregateFeedbackState(client, userId, result.result_revision_id);
      await client.query('COMMIT');
      return {
        response_id: response.id,
        result_revision_id: result.result_revision_id,
        action: response.action,
        explanation: response.explanation,
        observation_question_id: response.evidence_question_id ?? null,
        state: feedbackState(response.action),
        feedback_state: feedbackStateResult ?? feedbackState(response.action),
        created_at: response.created_at,
        replayed,
      };
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      throw error;
    } finally {
      client.release();
    }
  }

  private async getResultFeedback(
    userId: string,
    resultRevisionId: string,
  ): Promise<ThemeResultFeedback[]> {
    const response = await this.db.pool.query<{
      id: string;
      action: RespondThemeResultCommand['action'];
      explanation: string | null;
      evidence_question_id: string | null;
      created_at: string;
    }>(
      `SELECT id, action, explanation, evidence_question_id, created_at
       FROM (
         SELECT id, action, explanation, evidence_question_id, created_at,
                ROW_NUMBER() OVER (
                  PARTITION BY evidence_question_id ORDER BY created_at DESC, id DESC
                ) AS row_rank
         FROM theme_assessment_result_responses
         WHERE result_revision_id = $1 AND user_id = $2
       ) response
       WHERE row_rank = 1
       ORDER BY created_at DESC, id DESC`,
      [resultRevisionId, userId],
    );
    return response.rows.map((row) => ({
      response_id: row.id,
      action: row.action,
      explanation: row.explanation,
      observation_question_id: row.evidence_question_id ?? null,
      state: feedbackState(row.action),
      created_at: row.created_at,
    }));
  }

  private async aggregateFeedbackState(
    client: { query: (sql: string, params?: unknown[]) => Promise<{ rows: Array<{ has_pending: boolean | null }> }> },
    userId: string,
    resultRevisionId: string,
  ): Promise<ThemeResultFeedbackState | null> {
    const result = await client.query(
      `SELECT BOOL_OR(action <> 'confirm') AS has_pending
       FROM (
         SELECT DISTINCT ON (evidence_question_id) action
         FROM theme_assessment_result_responses
         WHERE result_revision_id = $1 AND user_id = $2
         ORDER BY evidence_question_id, created_at DESC, id DESC
       ) latest`,
      [resultRevisionId, userId],
    );
    const hasPending = result.rows[0]?.has_pending;
    return hasPending === null || hasPending === undefined
      ? null
      : hasPending ? 'needs_follow_up' : 'recorded';
  }

  async coverage(userId: string) {
    const counts = await this.coverageCounts(userId);
    const next = await this.recommendNextRound(userId);
    return {
      ...counts,
      recommended_theme: next.theme_lens,
      recommendation: next.reason_zh,
      recommendation_reason: next.reason,
      recommendation_target: next.target,
    };
  }

  private async coverageCounts(userId: string) {
    const rows = await this.db.pool.query<{
      theme_lens: ThemeLens;
      total: string;
      last_completed_at: string | null;
    }>(
      `SELECT theme_lens, COUNT(*)::text AS total, MAX(completed_at)::text AS last_completed_at
       FROM theme_assessment_rounds WHERE user_id = $1 AND status = 'completed'
       GROUP BY theme_lens`,
      [userId]
    );
    const byTheme = new Map(rows.rows.map((row) => [row.theme_lens, row]));
    const themes = THEME_LENSES.map((theme) => ({
      theme_lens: theme,
      title: getThemeTitle(theme),
      completed_rounds: Number(byTheme.get(theme)?.total ?? 0),
      last_completed_at: byTheme.get(theme)?.last_completed_at ?? null,
    }));
    const recommended = [...themes].sort(
      (a, b) => a.completed_rounds - b.completed_rounds || a.theme_lens.localeCompare(b.theme_lens)
    )[0]!;
    return {
      themes,
      recommended_theme: recommended.theme_lens,
      recommendation: `你还没有充分覆盖「${recommended.title}」。`,
    };
  }

  /**
   * Latest unresolved result feedback takes priority; other fallbacks are not
   * allowed to claim a dimension-specific contradiction without a reviewed map.
   */
  async recommendNextRound(userId: string): Promise<Recommendation> {
    const recentFeedback = await this.db.pool.query<{
      theme_lens: ThemeLens | null;
      response_id: string;
      result_revision_id: string;
      evidence_question_id: string | null;
      action: FollowupTarget['action'];
    }>(
      `WITH latest_revision AS (
         SELECT DISTINCT ON (round_id) id, round_id
         FROM theme_assessment_result_revisions
         WHERE invalidated_at IS NULL
         ORDER BY round_id, revision_number DESC, id DESC
       ), latest_feedback AS (
         SELECT DISTINCT ON (response.result_revision_id, response.evidence_question_id)
                response.id, response.result_revision_id, response.evidence_question_id,
                response.action, response.created_at
         FROM theme_assessment_result_responses response
         JOIN latest_revision revision ON revision.id = response.result_revision_id
         WHERE response.user_id = $1
         ORDER BY response.result_revision_id, response.evidence_question_id,
                  response.created_at DESC, response.id DESC
       )
       SELECT round.theme_lens, response.id AS response_id,
              response.result_revision_id, response.evidence_question_id, response.action
       FROM latest_feedback response
       JOIN theme_assessment_result_revisions revision ON revision.id = response.result_revision_id
       JOIN theme_assessment_rounds round ON round.id = revision.round_id
       WHERE round.user_id = $1 AND round.status = 'completed'
         AND response.action IN ('refute', 'partial', 'clarify')
         AND NOT EXISTS (
           SELECT 1 FROM consent_grants cg
           WHERE cg.user_id = $1 AND cg.consent_type = 'evidence_collection' AND cg.granted = false
         )
         AND NOT EXISTS (
           SELECT 1 FROM theme_assessment_rounds followup
           WHERE followup.user_id = $1 AND followup.status = 'completed'
             AND followup.selection_decision->'target'->>'response_id' = response.id::text
             AND followup.selection_decision->>'status' IN ('targeted', 'theme_followup')
         )
       ORDER BY response.created_at DESC, response.id DESC
       LIMIT 1`,
      [userId],
    );
    if (recentFeedback.rows[0]?.theme_lens) {
      const feedback = recentFeedback.rows[0];
      const reason = feedback.action === 'refute'
        ? 'verify_disagreement'
        : feedback.action === 'partial' ? 'clarify_partial' : 'use_added_context';
      const reason_zh = feedback.action === 'refute'
        ? feedback.evidence_question_id
          ? '你认为这条观察不符合实际；本轮会换一个相同观察焦点的情境继续核对。'
          : '你认为上一轮整体观察不符合实际；本轮从同一主题继续观察，不代表已解决异议。'
        : feedback.action === 'partial'
          ? feedback.evidence_question_id
            ? '你认为这条观察只符合一部分；本轮会换一个相同观察焦点的情境继续核对。'
            : '你认为上一轮整体观察只符合一部分；本轮继续观察该主题，不代表已解决异议。'
          : feedback.evidence_question_id
            ? '你补充了这条观察的背景；本轮会在相同观察焦点的另一个情境继续了解。'
            : '你补充了上一轮的背景；本轮继续观察该主题，不代表已解决异议。';
      return {
        theme_lens: feedback.theme_lens,
        reason,
        reason_zh,
        target: {
          response_id: feedback.response_id,
          result_revision_id: feedback.result_revision_id,
          observation_question_id: feedback.evidence_question_id,
          action: feedback.action,
        },
      };
    }

    // The product has no reviewed dimension-to-theme crosswalk. Do not label an
    // arbitrary low-coverage theme as a contradiction check.
    const captureCount = await this.db.pool.query<{ n: string }>(
      `SELECT COUNT(*)::text AS n FROM captures WHERE user_id = $1`,
      [userId],
    );
    if (Number(captureCount.rows[0]?.n ?? 0) < 3) {
      const cov = await this.coverageCounts(userId);
      return {
        theme_lens: cov.recommended_theme,
        reason: 'add_context',
        reason_zh: '你的现实记录还不多，先在「日常镜」里补一些具体情境。',
        target: null,
      };
    }

    const latestEvidence = await this.db.pool.query<{ created_at: string }>(
      `SELECT created_at FROM ${FORMAL_EVIDENCE_VIEW}
       WHERE user_id = $1
         AND NOT EXISTS (
           SELECT 1 FROM consent_grants cg
           WHERE cg.user_id = $1 AND cg.consent_type = 'evidence_collection' AND cg.granted = false
         )
       ORDER BY created_at DESC LIMIT 1`,
      [userId],
    );
    if (latestEvidence.rows[0]) {
      const ageDays = (Date.now() - new Date(latestEvidence.rows[0].created_at).getTime()) / (1000 * 60 * 60 * 24);
      if (ageDays > 90) {
        const cov = await this.coverageCounts(userId);
        return {
          theme_lens: cov.recommended_theme,
          reason: 'refresh_stale_evidence',
          reason_zh: `距最近一条有效观察已过 ${Math.floor(ageDays)} 天，可以重新记录当前情境。`,
          target: null,
        };
      }
    }

    // 5. fallback：覆盖度最低
    const cov = await this.coverageCounts(userId);
    return {
      theme_lens: cov.recommended_theme,
      reason: 'explore_domain',
      reason_zh: `你还没有充分覆盖「${cov.themes.find((t) => t.theme_lens === cov.recommended_theme)?.title ?? ''}」。`,
      target: null,
    };
  }

  async list(userId: string) {
    const rows = await this.db.pool.query<{
      id: string;
      theme_lens: ThemeLens;
      status: RoundStatus;
      completed_at: string | null;
      result: ThemeRoundResult | null;
      result_revision_id: string | null;
      latest_feedback_action: RespondThemeResultCommand['action'] | null;
      has_disputed_feedback: boolean | null;
      whole_result_feedback_action: RespondThemeResultCommand['action'] | null;
    }>(
      `SELECT round.id, round.theme_lens, round.status, round.completed_at,
              result.id AS result_revision_id, result.result,
              feedback.latest_feedback_action, feedback.has_disputed_feedback, feedback.whole_result_feedback_action
       FROM theme_assessment_rounds round
       LEFT JOIN LATERAL (
         SELECT id, result FROM theme_assessment_result_revisions
         WHERE round_id = round.id AND invalidated_at IS NULL
         ORDER BY revision_number DESC LIMIT 1
       ) result ON TRUE
       LEFT JOIN LATERAL (
         SELECT (ARRAY_AGG(action ORDER BY created_at DESC, id DESC))[1] AS latest_feedback_action,
                BOOL_OR(action <> 'confirm') AS has_disputed_feedback,
                (ARRAY_AGG(action ORDER BY created_at DESC, id DESC)
                  FILTER (WHERE evidence_question_id IS NULL))[1] AS whole_result_feedback_action
         FROM (
           SELECT id, action, created_at, evidence_question_id,
                  ROW_NUMBER() OVER (PARTITION BY evidence_question_id ORDER BY created_at DESC, id DESC) AS target_rank
           FROM theme_assessment_result_responses
           WHERE result_revision_id = result.id AND user_id = $1
         ) responses
         WHERE target_rank = 1
       ) feedback ON TRUE
       WHERE round.user_id = $1
       ORDER BY COALESCE(round.completed_at, round.created_at) DESC
       LIMIT 30`,
      [userId]
    );
    return rows.rows.map((row) => ({
      id: row.id,
      theme_lens: row.theme_lens,
      theme_title: getThemeTitle(row.theme_lens),
      status: row.status,
      completed_at: row.completed_at,
      headline: row.result?.headline ?? null,
      boundary: row.result?.boundary ?? null,
      feedback_state: row.has_disputed_feedback
        ? 'needs_follow_up'
        : row.latest_feedback_action ? 'recorded' : 'not_responded',
      whole_result_refuted: row.whole_result_feedback_action === 'refute',
      latest_feedback_action: row.latest_feedback_action,
    }));
  }

  /**
   * P1-7：推荐下一主题并附原因（5 分支）
   */
  async recommendNextRoundWithReason(userId: string) {
    return this.recommendNextRound(userId);
  }

  private async getRound(userId: string, roundId: string): Promise<RoundRow> {
    const result = await this.db.pool.query<RoundRow>(
       `SELECT id, theme_lens, locale, status, question_bank_version, completed_at, selection_decision
       FROM theme_assessment_rounds WHERE id = $1 AND user_id = $2 LIMIT 1`,
      [roundId, userId]
    );
    if (!result.rows[0]) throw new NotFoundException({ code: 'round_not_found' });
    return result.rows[0];
  }

  private async loadRoundState(
    roundId: string
  ): Promise<{ items: ItemRow[]; answers: AnswerRow[] }> {
    const [itemResult, answerResult] = await Promise.all([
      this.db.pool.query<ItemRow>(
        `SELECT id, ordinal, definition, role, source FROM theme_assessment_round_items WHERE round_id = $1 AND invalidated_at IS NULL ORDER BY ordinal`,
        [roundId]
      ),
      this.db.pool.query<AnswerRow>(
        `SELECT item_id, choice_id, free_text, answered_at FROM theme_assessment_round_answers WHERE round_id = $1 AND invalidated_at IS NULL ORDER BY answered_at`,
        [roundId]
      ),
    ]);
    return { items: itemResult.rows, answers: answerResult.rows };
  }

  private toCoreAnswers(items: ItemRow[], answers: AnswerRow[]): ThemeRoundAnswer[] {
    return answers.flatMap((answer) => {
      const item = items.find((candidate) => candidate.id === answer.item_id);
      if (!item) return [];
      return [
        {
          question_id: item.definition.question_id,
          choice_id: answer.choice_id,
          free_text: answer.free_text ?? undefined,
          answered_at: Date.parse(answer.answered_at),
        },
      ];
    });
  }

  private async gatherPriorRoundSummaries(userId: string, theme: ThemeLens): Promise<PriorRoundSummary[]> {
    const result = await this.db.pool.query<{ result: ThemeRoundResult }>(
      `SELECT rrev.result
       FROM theme_assessment_result_revisions rrev
       JOIN theme_assessment_rounds r ON r.id = rrev.round_id
       WHERE r.user_id = $1 AND r.theme_lens = $2 AND r.status = 'completed'
         AND rrev.invalidated_at IS NULL
       ORDER BY r.completed_at DESC
       LIMIT 3`,
      [userId, theme]
    );
    return result.rows.map((row) => {
      const evidence = row.result.evidence ?? [];
      const counts: Record<RoundApproach, number> = {
        approach: 0, protect: 0, analyze: 0, withdraw: 0,
      };
      for (const entry of evidence) {
        counts[entry.approach] = (counts[entry.approach] ?? 0) + 1;
      }
      const dominant = (Object.entries(counts) as Array<[RoundApproach, number]>)
        .sort(([, a], [, b]) => b - a)[0]?.[0] ?? 'analyze';
      const observationFocuses = (row.result.observations ?? [])
        .map((obs) => obs.focus);
      return { dominant_approach: dominant, approach_counts: counts, observation_focuses: observationFocuses };
    });
  }

  private async gatherDiaryDigest(userId: string): Promise<DiaryDigestEntry[]> {
    const consentResult = await this.db.pool.query<{ is_allowed: boolean }>(
      `SELECT NOT EXISTS (
        SELECT 1 FROM consent_grants cg
        WHERE cg.user_id = $1 AND cg.consent_type = 'evidence_collection' AND cg.granted = false
      ) AS is_allowed`,
      [userId]
    );
    if (!consentResult.rows[0]?.is_allowed) return [];

    const result = await this.db.pool.query<{
      entry_type: string;
      mood_label: string | null;
      raw_text: string | null;
      captured_at: string;
    }>(
      `SELECT entry_type, mood_label, raw_text, captured_at
       FROM captures
       WHERE user_id = $1
         AND process_mode IN ('organize', 'analyze')
         AND captured_at > NOW() - INTERVAL '14 days'
         AND raw_text IS NOT NULL AND length(trim(raw_text)) > 0
       ORDER BY captured_at DESC
       LIMIT 10`,
      [userId]
    );
    return result.rows.map((row) => ({
      entry_type: row.entry_type,
      mood_label: row.mood_label ?? undefined,
      text: sanitizeUserContext(row.raw_text ?? '') ?? '',
      captured_at: row.captured_at,
    }));
  }
}
