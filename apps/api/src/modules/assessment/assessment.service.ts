// apps/api/src/modules/assessment/assessment.service.ts
// Assessment backend service:
// 1) fixed 14-question Level 1 baseline completion
// 2) micro-sandbox dynamic 1-question loop
// 3) ScenarioAnswer support (choice / input discriminated union)

import { BadRequestException, Injectable, InternalServerErrorException, ServiceUnavailableException } from '@nestjs/common';
import type { PoolClient } from '../../common/pool.js';
import { Database } from '../../common/database.js';
import { AuthService } from '../auth/auth.service.js';
import { RedisService } from '../../common/redis.service.js';
import { EvidenceService } from '../evidence/evidence.service.js';
import { QueueService } from '../../queue/queue.service.js';
import { resolveLlmRuntimeConfig } from '../../common/llm-config.js';
import { resolveLlmChatCompletionsUrl } from '../../common/llm-endpoint.js';
import { EVA_STRUCTURED_REFLECTION_V1 } from '../../common/feature-flags.js';
import { FORMAL_EVIDENCE_VIEW } from '../../common/formal-evidence.js';
import {
  CURRENT_SCRIPT_VERSION,
  CURRENT_SCENARIO_SET,
  CURRENT_MICRO_SCENARIO_SET,
  SCENARIO_SCHEMAS,
  SCORED_SCENARIO_IDS,
  ALL_SCENARIO_SCHEMAS,
  resolveFrequencyWeight,
  computeDimensionConfidence,
  type ScenarioChoice,
  type ScenarioAnswer,
  type ChoiceOption,
  type UBV,
  type Memory,
  type BeliefDim,
  type PersonalityVector,
  type ScriptEvidence,
  type DynamicScenarioDef,
  type LLMCaller,
  type FrequencyContext,
  type DimensionConfidenceResult,
  type EvidenceEventRow,
  generateScriptResult,
  applyScriptResult,
  applyPersonalityVectorUpdate,
  generateDynamicScenarios,
  mergeDynamicVector,
  computeAssessmentEvidenceEvents,
  computeUBVEvidenceEvents,
  applyDecayToAll,
  DIMENSION_KIND_MAP,
  decideNextQuestion,
  type RouterDecision,
} from '@eva/core';
import { randomUUID } from 'crypto';

const MICRO_TOKEN_TTL_SECONDS = 15 * 60;
const MICRO_ALLOWED_CHOICES: ReadonlyArray<ChoiceOption> = ['A', 'B', 'C', 'D'];
/** [S1 Req 10.4] Micro-sandbox evidence weight — lower than formal (1.0) */
const MICRO_EVIDENCE_WEIGHT = 0.8;
/** [S1 Req 10.2] Daily micro-sandbox quota */
const MICRO_DAILY_QUOTA = 3;
const PRACTICE_BASE_WEIGHT = 0.2;
const PRACTICE_MIN_CONFIDENCE = 0.35;
const PRACTICE_MAX_CONFIDENCE = 0.5;
const PRACTICE_CONFIDENCE_GATE = 0.4;
const PRACTICE_MAX_ABSORB_PER_DIM_PER_DAY = 3;
const PRACTICE_REPEAT_DECAY = [1, 0.6, 0.3, 0.1] as const;
const PRACTICE_COUNTER_TTL_SECONDS = 3 * 24 * 60 * 60;

type PendingMicroScenario = {
  scenario: DynamicScenarioDef;
  locale: string;
  mode: MicroSandboxMode;
  generated_at: number;
};

type MicroSandboxMode = 'calibration' | 'practice';

export interface CompleteAssessmentDto {
  locale: string;
  script_version?: string;
  scenario_set?: string;
  choices: Array<{ scenarioId: string; choice: string; timestamp?: number }>;
  /** [S1] ScenarioAnswer discriminated union — supports choice and free-text input */
  answers?: ScenarioAnswer[];
  /** [S1] Exact baseline question order shown to the user. */
  selected_schema_ids?: string[];
  started_at?: number;
  completed_at?: number;
}

export interface AssessmentCompleteResponse {
  assessment_run_id: string;
  script_result: Record<string, unknown>;
  next_suggested_dimension: string | null;
}

export interface MicroSandboxNextDto {
  locale?: string;
  mode?: MicroSandboxMode;
}

export interface MicroSandboxNextResponse {
  token: string;
  scenario_set: string;
  mode: MicroSandboxMode;
  expires_in_seconds: number;
  scenario: DynamicScenarioDef;
  /** [S1] When confidence-driven logic is active, the target dimension for this round */
  target_dimension?: string | null;
}

/** [S1] Returned when the daily micro-sandbox quota is exhausted */
export interface MicroSandboxQuotaExceededResponse {
  available: false;
  reason: 'daily_quota_exceeded';
  remaining: 0;
}

export interface CompleteMicroSandboxDto {
  token: string;
  choice: ChoiceOption;
  locale?: string;
  mode?: MicroSandboxMode;
}

export interface CompleteMicroSandboxResponse {
  assessment_run_id: string | null;
  scenario_set: string;
  mode: MicroSandboxMode;
  selected_choice: ChoiceOption;
  selected_feedback: string;
  key_insight: string;
  next_suggested_dimension: string | null;
}

@Injectable()
export class AssessmentService {
  constructor(
    private readonly db: Database,
    private readonly auth: AuthService,
    private readonly redis: RedisService,
    private readonly evidenceService: EvidenceService,
    private readonly queue: QueueService,
  ) {}

  async complete(
    userId: string,
    dto: CompleteAssessmentDto,
  ): Promise<AssessmentCompleteResponse> {
    const locale = dto.locale ?? 'zh-CN';
    const scriptVersion = dto.script_version ?? CURRENT_SCRIPT_VERSION;
    const scenarioSet = dto.scenario_set ?? CURRENT_SCENARIO_SET;

    // [S1] Validate ScenarioAnswer free-text: reject empty/whitespace input (Req 2.4)
    if (dto.answers) {
      for (const answer of dto.answers) {
        if (answer.kind === 'input') {
          if (!answer.text || answer.text.trim().length === 0) {
            throw new BadRequestException('Free-text input cannot be empty. Please provide content.');
          }
        }
      }
    }

    this.assertAssessmentSubmission(scenarioSet, dto);

    const scoredChoices: ScenarioChoice[] = dto.choices.map((c) => ({
      scenarioId: c.scenarioId as ScenarioChoice['scenarioId'],
      choice: c.choice as ScenarioChoice['choice'],
      timestamp: c.timestamp ?? Date.now(),
    }));
    const scriptResult = generateScriptResult(
      scoredChoices,
      locale as 'zh-CN' | 'en' | 'ja' | 'es',
    );

    const memory = await this.auth.getUserMemory(userId);
    if (!memory) throw new Error('User memory not found');

    const postScriptMemory = applyScriptResult(memory, scriptResult);
    let updatedMemory = postScriptMemory;
    if (postScriptMemory.ubv) {
      const freshUbv = postScriptMemory.ubv;
      const ubvDims = Object.fromEntries(
        Object.keys(DIMENSION_KIND_MAP)
          .filter((k) => (freshUbv as unknown as Record<string, unknown>)[k] != null)
          .map((k) => [k, (freshUbv as unknown as Record<string, unknown>)[k] as BeliefDim]),
      );
      const decayed = applyDecayToAll(ubvDims, Date.now());
      updatedMemory = {
        ...postScriptMemory,
        ubv: { ...freshUbv, ...decayed } as UBV,
        meta: {
          ...postScriptMemory.meta,
          baseline_completed: true,
          assessment_debrief: {
            source_id: 'pending',
            source_type: 'baseline',
            key_insight: scriptResult.key_insight,
            evidence: scriptResult.evidence_log.slice(0, 4),
            remaining_turns: 3,
            confirmed_or_refuted: false,
            created_at: Date.now(),
          },
        },
      };
    }

    const resultJson = scriptResult as unknown as Record<string, unknown>;
    // [S1] If dto.answers is provided, skip legacy evidence path to avoid double-write.
    // processScenarioAnswers (called later) writes evidence with full S1 schema.
    const hasNewAnswers = dto.answers && dto.answers.length > 0;
    const evidenceEvents = hasNewAnswers
      ? []
      : computeAssessmentEvidenceEvents(userId, 'pending', scriptResult, locale);

    const client: PoolClient = await this.db.pool.connect();
    let assessmentRunId: string;
    try {
      await client.query('BEGIN');

      await client.query(
        `UPDATE users SET memory_state = $2::jsonb, updated_at = NOW() WHERE id = $1`,
        [userId, JSON.stringify(updatedMemory)],
      );

      const runRows = await client.query<{ id: string }>(
        `INSERT INTO assessment_runs
           (user_id, locale, script_version, scenario_set, choices, result, started_at, completed_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING id`,
        [
          userId,
          locale,
          scriptVersion,
          scenarioSet,
          JSON.stringify(scoredChoices),
          JSON.stringify(resultJson),
          dto.started_at ? new Date(dto.started_at) : null,
          dto.completed_at ? new Date(dto.completed_at) : new Date(),
        ],
      );
      assessmentRunId = runRows.rows[0].id;

      for (const ev of evidenceEvents) {
        await client.query(
          `INSERT INTO evidence_events
             (user_id, source_type, source_id, dimension, delta, weight, confidence, quote, explanation,
              candidate, epistemic_source, content_kind, source_independence_group, quality_metadata)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, true, 'system_interaction',
                   'simulation_choice', $10, '{"attribution":"self"}'::jsonb)`,
          [
            ev.userId,
            ev.sourceType,
            assessmentRunId,
            ev.dimension,
            ev.delta ?? null,
            ev.weight ?? 1,
            ev.confidence ?? 0.5,
            ev.quote ?? null,
            ev.explanation,
            `assessment:${assessmentRunId}`,
          ],
        );
      }

      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }

    updatedMemory = await this.attachDebriefSourceId(userId, updatedMemory, assessmentRunId);

    // [S1] Process ScenarioAnswer entries — write evidence via extended path
    if (dto.answers && dto.answers.length > 0) {
      await this.processScenarioAnswers(userId, assessmentRunId, dto.answers);
    }

    // 接通画像快照。此前 enqueueSnapshot 全仓零调用 → personality_snapshots
    // 永不落库、30 天滚动基线永不更新、shift 检测永不触发。算法（computeRCI，
    // 阈值 1.96）、worker、五重门控都已就绪，只差这一个调用。
    // 注意：shift 检测另受两个开关约束 —— worker 的 EVA_SHIFT_DETECTION_ENABLED
    // （默认 false）或 job 的 immediate=true；快照落库本身不受它们影响。
    try {
      await this.queue.enqueueSnapshot({
        userId,
        sourceType: 'test',
        sourceId: assessmentRunId,
      });
    } catch (err) {
      // 快照入队失败不应影响测评完成
      console.error('[AssessmentService] enqueueSnapshot failed:', err);
    }

    const nextDimension = this.pickNextDimension(updatedMemory.ubv);
    return {
      assessment_run_id: assessmentRunId,
      script_result: resultJson,
      next_suggested_dimension: nextDimension,
    };
  }

  // ─────────────────────────────────────────────────────────────
  // [S1] ScenarioAnswer processing — choice vs input evidence writing
  // ─────────────────────────────────────────────────────────────

  private async processScenarioAnswers(
    userId: string,
    assessmentRunId: string,
    answers: ScenarioAnswer[],
  ): Promise<void> {
    for (const answer of answers) {
      if (answer.kind === 'choice') {
        // Choice records a legacy-unclassified event. It cannot enter the v1
        // formal portrait view until a governance-approved rule promotes it.
        const schema = ALL_SCENARIO_SCHEMAS.find((s) => s.id === answer.scenarioId);
        const dimension = schema?.dimension ?? answer.scenarioId;
        const vectorPatch = schema?.vector_patch?.[answer.choice];
        const delta = vectorPatch ? this.extractPrimaryDelta(vectorPatch as Record<string, unknown>) : 0;

        await this.evidenceService.writeEvidence({
          userId,
          sourceType: 'test',
          sourceId: assessmentRunId,
          dimension,
          delta,
          weight: 1.0,
          confidence: 0.5,
          quote: null,
          explanation: `[assessment:choice] scenario=${answer.scenarioId} choice=${answer.choice}`,
          evidenceKind: 'formal',
          evidenceMode: 'choice',
          candidate: true,
          localDate: new Date().toISOString().slice(0, 10),
          epistemicSource: 'system_interaction',
          contentKind: 'simulation_choice',
          sourceIndependenceGroup: `assessment:${assessmentRunId}`,
          attribution: 'self',
        });
      } else {
        // Input (free-text) is likewise an unclassified record, not formal
        // portrait evidence or a direct personality conclusion.
        const schema = ALL_SCENARIO_SCHEMAS.find((s) => s.id === answer.scenarioId);
        const dimension = schema?.free_text_dimension ?? schema?.dimension ?? answer.scenarioId;

        await this.evidenceService.writeEvidence({
          userId,
          sourceType: 'test',
          sourceId: assessmentRunId,
          dimension,
          delta: null,
          weight: 1.0,
          confidence: 0.5,
          quote: answer.text,
          explanation: `[assessment:input] scenario=${answer.scenarioId} free-text response`,
          evidenceKind: 'formal',
          evidenceMode: 'input',
          candidate: true,
          localDate: new Date().toISOString().slice(0, 10),
          epistemicSource: 'user_self_report',
          contentKind: 'stated_intention',
          sourceIndependenceGroup: `assessment:${assessmentRunId}`,
          attribution: 'self',
        });
      }
    }
  }

  async microSandboxNext(
    userId: string,
    dto: MicroSandboxNextDto,
  ): Promise<MicroSandboxNextResponse | MicroSandboxQuotaExceededResponse> {
    const locale = dto.locale ?? 'zh-CN';
    const mode = this.resolveMicroSandboxMode(dto.mode);

    // [S1 Req 10.2] Daily quota check via resolveFrequencyWeight
    const microSandboxTodayCount = await this.getMicroSandboxTodayCount(userId);
    const frequencyCtx: FrequencyContext = {
      microSandboxTodayCount,
      now: Date.now(),
      isFirstBaseline: false,
    };
    const frequencyResult = resolveFrequencyWeight('micro_sandbox', frequencyCtx);
    if (frequencyResult === null) {
      return { available: false, reason: 'daily_quota_exceeded', remaining: 0 };
    }

    // Calibration writes to the formal daily profile path, so it is limited to once per day.
    // Practice mode is replayable and uses weak, throttled absorption at complete time.
    const alreadyDoneToday = mode === 'calibration'
      ? await this.auth.getSandboxCompletedToday(userId)
      : false;
    if (alreadyDoneToday) {
      throw new BadRequestException('You have already completed micro-sandbox today. Come back tomorrow.');
    }

    const memory = await this.auth.getUserMemory(userId);
    if (!memory) throw new Error('User memory not found');
    if (!memory.meta?.baseline_completed && !memory.baseline_ubv) {
      throw new BadRequestException('Baseline assessment is required before micro-sandbox.');
    }
    if (!memory.personality_vector) {
      throw new BadRequestException('Baseline vector is missing. Please run baseline assessment again.');
    }

    // [S1 Req 10.2] Confidence-driven dimension selection when feature flag is on
    let targetDimension: string | null = null;
    let reflectionDecision: RouterDecision | null = null;
    if (EVA_STRUCTURED_REFLECTION_V1 && memory.ubv) {
      targetDimension = await this.pickDimensionByConfidence(userId, memory.ubv);

      // [Reflection Funnel Phase 3] Augment with the new Router that
      // knows about free/paid tier routing and recent_change signals.
      // Falls back silently if no decision is produced.
      reflectionDecision = await this.decideReflectionTarget(userId, memory.ubv);
      if (reflectionDecision) {
        targetDimension = reflectionDecision.target_dimension;
      }
    }

    const llmCaller = this.buildLLMCaller();
    // Scenario reuse has no record-level permission; do not hydrate saved captures or diaries.
    const scenarios = await generateDynamicScenarios(
      memory.personality_vector,
      [],
      llmCaller,
      locale as 'zh-CN' | 'en' | 'ja' | 'es',
      reflectionDecision?.target_dimension,
    );
    const scenario = scenarios[0];
    if (!scenario) {
      throw new ServiceUnavailableException('Failed to generate micro-sandbox scenario.');
    }

    const token = randomUUID().replace(/-/g, '');
    const key = this.microScenarioKey(userId, token);
    const payload: PendingMicroScenario = {
      scenario,
      locale,
      mode,
      generated_at: Date.now(),
    };
    await this.redis.set(key, JSON.stringify(payload), MICRO_TOKEN_TTL_SECONDS);

    return {
      token,
      scenario_set: CURRENT_MICRO_SCENARIO_SET,
      mode,
      expires_in_seconds: MICRO_TOKEN_TTL_SECONDS,
      scenario,
      target_dimension: targetDimension,
    };
  }

  async completeMicroSandbox(
    userId: string,
    dto: CompleteMicroSandboxDto,
  ): Promise<CompleteMicroSandboxResponse> {
    if (!dto?.token) throw new BadRequestException('token is required');
    if (!MICRO_ALLOWED_CHOICES.includes(dto.choice)) {
      throw new BadRequestException(`choice must be one of ${MICRO_ALLOWED_CHOICES.join(', ')}`);
    }

    const key = this.microScenarioKey(userId, dto.token);
    const raw = await this.redis.get(key);
    if (!raw) {
      throw new BadRequestException('Micro-sandbox token expired or invalid.');
    }
    await this.redis.del(key);

    const pending = this.parsePendingScenario(raw);
    const scenario = pending.scenario;
    const mode = pending.mode ?? this.resolveMicroSandboxMode(dto.mode);
    const option = scenario.options[dto.choice];
    if (!option) throw new BadRequestException(`Invalid choice ${dto.choice}`);

    const memory = await this.auth.getUserMemory(userId);
    if (!memory) throw new Error('User memory not found');
    if (!memory.personality_vector) {
      throw new BadRequestException('Baseline vector is missing. Please run baseline assessment again.');
    }

    const oldUBV = memory.ubv ?? null;
    const selectedPatch = scenario.vector_patch[dto.choice] as unknown as Record<string, unknown>;
    const primaryDimension = this.primaryDimensionFromPatch(selectedPatch);
    const keyInsight = this.buildMicroInsight(scenario, dto.choice, pending.locale);
    const nextVector = mergeDynamicVector(
      memory.personality_vector,
      [{
        scenarioId: scenario.id as ScenarioChoice['scenarioId'],
        choice: dto.choice,
        timestamp: Date.now(),
      }],
      [scenario],
    );
    const mergedMemory = applyPersonalityVectorUpdate(memory, nextVector);
    const microEvidence: ScriptEvidence = {
      id: `${scenario.id}:${dto.choice}`,
      scenarioId: scenario.id as ScenarioChoice['scenarioId'],
      dimensionId: primaryDimension,
      choice: dto.choice,
      choiceLabel: option.label,
      choiceText: option.text,
      scenarioTitle: scenario.title,
      context: scenario.setup,
      expectedSignal: 'mid-high',
      vectorPatch: scenario.vector_patch[dto.choice] as Partial<PersonalityVector>,
    };
    let updatedMemory: Memory = {
      ...mergedMemory,
      meta: {
        ...mergedMemory.meta,
        baseline_completed: true,
        assessment_debrief: {
          source_id: 'pending',
          source_type: 'micro_sandbox' as const,
          key_insight: keyInsight,
          evidence: [microEvidence],
          remaining_turns: 3,
          confirmed_or_refuted: false,
          created_at: Date.now(),
        },
      },
    };

    const resultJson: Record<string, unknown> = {
      mode: 'micro_sandbox',
      scenario_set: CURRENT_MICRO_SCENARIO_SET,
      scenario,
      selected_choice: dto.choice,
      selected_feedback: option.feedback,
      personality_vector: nextVector,
      key_insight: keyInsight,
      generated_at: pending.generated_at,
      completed_at: Date.now(),
    };

    const choicePayload = [{
      scenarioId: scenario.id as ScenarioChoice['scenarioId'],
      choice: dto.choice,
      timestamp: Date.now(),
    }];

    const evidenceEvents = oldUBV && updatedMemory.ubv
      ? computeUBVEvidenceEvents(
          userId,
          'pending',
          oldUBV,
          updatedMemory.ubv,
          `${scenario.id}:${dto.choice}:${option.text}`,
        ).map((ev) => ({
          ...ev,
          sourceType: 'test' as const,
          sourceId: 'pending',
          explanation: `${ev.explanation} [micro-sandbox]`,
        }))
      : [];

    if (mode === 'practice') {
      const today = this.dayBucket();
      const repeatKey = this.practiceRepeatKey(userId, today, scenario.id, dto.choice);
      const dimKey = this.practiceDimensionKey(userId, today, primaryDimension);

      const repeatCount = await this.bumpCounterSafely(repeatKey);
      const absorbedCount = await this.bumpCounterSafely(dimKey);

      const repeatFactor = this.repeatDecayFactor(repeatCount);
      const underAbsorbCap = absorbedCount <= PRACTICE_MAX_ABSORB_PER_DIM_PER_DAY;
      const effectiveWeight = PRACTICE_BASE_WEIGHT * repeatFactor;
      const effectiveConfidence = this.clamp(
        PRACTICE_MAX_CONFIDENCE - (repeatCount - 1) * 0.05 - (underAbsorbCap ? 0 : 0.1),
        PRACTICE_MIN_CONFIDENCE,
        PRACTICE_MAX_CONFIDENCE,
      );

      const shouldWeakAbsorb =
        underAbsorbCap &&
        effectiveWeight > 0 &&
        effectiveConfidence >= PRACTICE_CONFIDENCE_GATE;

      let practiceUpdatedMemory = memory;
      if (shouldWeakAbsorb) {
        const weakScenario = this.scaleScenarioChoicePatch(scenario, dto.choice, effectiveWeight);
        const weakVector = mergeDynamicVector(
          memory.personality_vector,
          [{ scenarioId: scenario.id as ScenarioChoice['scenarioId'], choice: dto.choice, timestamp: Date.now() }],
          [weakScenario],
        );
        practiceUpdatedMemory = applyPersonalityVectorUpdate(memory, weakVector);
      }

      const practiceEvidenceDelta = this.extractPrimaryDelta(selectedPatch);
      const explanation =
        `[micro-sandbox:practice] dim=${primaryDimension} repeat=${repeatCount} ` +
        `daily_absorb=${absorbedCount}/${PRACTICE_MAX_ABSORB_PER_DIM_PER_DAY} ` +
        `weight=${effectiveWeight.toFixed(3)} conf=${effectiveConfidence.toFixed(3)} ` +
        `${shouldWeakAbsorb ? 'absorbed' : 'evidence_only'}`;

      const client: PoolClient = await this.db.pool.connect();
      try {
        await client.query('BEGIN');
        if (shouldWeakAbsorb) {
          await client.query(
            `UPDATE users SET memory_state = $2::jsonb, updated_at = NOW() WHERE id = $1`,
            [userId, JSON.stringify(practiceUpdatedMemory)],
          );
        }
        await client.query(
          `INSERT INTO evidence_events
             (user_id, source_type, source_id, dimension, delta, weight, confidence, quote, explanation,
              candidate, epistemic_source, content_kind, source_independence_group, quality_metadata)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, true, 'system_interaction',
                   'simulation_choice', $10, '{"attribution":"self"}'::jsonb)`,
          [
            userId,
            'micro_sandbox_practice',
            `micro:${scenario.id}`,
            primaryDimension,
            practiceEvidenceDelta,
            effectiveWeight,
            effectiveConfidence,
            option.text,
            explanation,
            `micro:${scenario.id}`,
          ],
        );
        await client.query('COMMIT');
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }

      return {
        assessment_run_id: null,
        scenario_set: CURRENT_MICRO_SCENARIO_SET,
        mode,
        selected_choice: dto.choice,
        selected_feedback: option.feedback,
        key_insight: keyInsight,
        next_suggested_dimension: this.pickNextDimension(memory.ubv),
      };
    }

    const client: PoolClient = await this.db.pool.connect();
    let assessmentRunId: string;
    try {
      await client.query('BEGIN');
      await client.query(
        `UPDATE users SET memory_state = $2::jsonb, updated_at = NOW() WHERE id = $1`,
        [userId, JSON.stringify(updatedMemory)],
      );
      const runRows = await client.query<{ id: string }>(
        `INSERT INTO assessment_runs
           (user_id, locale, script_version, scenario_set, choices, result, started_at, completed_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING id`,
        [
          userId,
          dto.locale ?? pending.locale ?? 'zh-CN',
          CURRENT_SCRIPT_VERSION,
          CURRENT_MICRO_SCENARIO_SET,
          JSON.stringify(choicePayload),
          JSON.stringify(resultJson),
          new Date(pending.generated_at),
          new Date(),
        ],
      );
      assessmentRunId = runRows.rows[0].id;

      // [S1 Req 10.4] Micro-sandbox evidence uses weight ×0.8 and evidence_kind='formal'
      const today = new Date().toISOString().slice(0, 10);
      for (const ev of evidenceEvents) {
        await client.query(
          `INSERT INTO evidence_events
             (user_id, source_type, source_id, dimension, delta, weight, confidence, quote, explanation,
              evidence_kind, evidence_mode, candidate, local_date, epistemic_source, content_kind,
              source_independence_group, quality_metadata)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13,
                   'system_interaction', 'simulation_choice', $14, '{"attribution":"self"}'::jsonb)`,
          [
            ev.userId,
            ev.sourceType,
            assessmentRunId,
            ev.dimension,
            ev.delta ?? null,
            MICRO_EVIDENCE_WEIGHT,
            ev.confidence ?? 0.5,
            ev.quote ?? null,
            `${ev.explanation} [weight=0.8]`,
            'formal',
            'choice',
            true,
            today,
            `assessment:${assessmentRunId}`,
          ],
        );
      }

      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }

    updatedMemory = await this.attachDebriefSourceId(userId, updatedMemory, assessmentRunId);

    return {
      assessment_run_id: assessmentRunId,
      scenario_set: CURRENT_MICRO_SCENARIO_SET,
      mode,
      selected_choice: dto.choice,
      selected_feedback: option.feedback,
      key_insight: keyInsight,
      next_suggested_dimension: this.pickNextDimension(updatedMemory.ubv),
    };
  }

  private async attachDebriefSourceId(
    userId: string,
    memory: Memory,
    assessmentRunId: string,
  ): Promise<Memory> {
    const currentDebrief = memory.meta.assessment_debrief;
    if (!currentDebrief || typeof currentDebrief !== 'object') return memory;

    const updatedMemory = {
      ...memory,
      meta: {
        ...memory.meta,
        assessment_debrief: {
          ...currentDebrief,
          source_id: assessmentRunId,
        },
      },
    } satisfies Memory;
    await this.auth.saveUserMemory(userId, updatedMemory);
    return updatedMemory;
  }

  private primaryDimensionFromPatch(patch: Record<string, unknown>): string {
    const priority: Array<[string, string]> = [
      ['trust_threshold', 'trustBoundaries'],
      ['boundary_strength', 'trustBoundaries'],
      ['conflict_score', 'conflictResponse'],
      ['conflict_style', 'conflictResponse'],
      ['attachment_score', 'attachment'],
      ['attachment_pattern', 'attachment'],
      ['emotional_regulation', 'emotionRegulation'],
      ['stress_score', 'stressResponse'],
      ['stress_response', 'stressResponse'],
      ['perfectionism_score', 'achievementMotivation'],
      ['achievement_drive', 'achievementMotivation'],
      ['growth_mindset_score', 'selfCognition'],
      ['selfview_pattern', 'selfCognition'],
      ['social_energy_score', 'socialEnergy'],
      ['social_energy_style', 'socialEnergy'],
    ];
    const found = priority.find(([key]) => patch[key] != null);
    return found?.[1] ?? 'dynamicScenario';
  }

  private resolveMicroSandboxMode(mode: MicroSandboxMode | undefined): MicroSandboxMode {
    return mode === 'practice' ? 'practice' : 'calibration';
  }

  private dayBucket(input = new Date()): string {
    const y = input.getUTCFullYear();
    const m = String(input.getUTCMonth() + 1).padStart(2, '0');
    const d = String(input.getUTCDate()).padStart(2, '0');
    return `${y}${m}${d}`;
  }

  private practiceRepeatKey(userId: string, day: string, scenarioId: string, choice: ChoiceOption): string {
    return `practice:repeat:${userId}:${day}:${scenarioId}:${choice}`;
  }

  private practiceDimensionKey(userId: string, day: string, dimension: string): string {
    return `practice:absorb:${userId}:${day}:${dimension}`;
  }

  private repeatDecayFactor(repeatCount: number): number {
    const idx = Math.max(0, Math.min(PRACTICE_REPEAT_DECAY.length - 1, repeatCount - 1));
    return PRACTICE_REPEAT_DECAY[idx];
  }

  private async bumpCounterSafely(key: string): Promise<number> {
    try {
      const currentRaw = await this.redis.get(key);
      const current = Number(currentRaw ?? '0');
      const next = Number.isFinite(current) ? current + 1 : 1;
      await this.redis.set(key, String(next), PRACTICE_COUNTER_TTL_SECONDS);
      return next;
    } catch {
      return 1;
    }
  }

  private clamp(v: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, v));
  }

  private scaleScenarioChoicePatch(
    scenario: DynamicScenarioDef,
    choice: ChoiceOption,
    factor: number,
  ): DynamicScenarioDef {
    const originalPatch = scenario.vector_patch[choice] as Record<string, unknown>;
    const scaledPatch: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(originalPatch)) {
      scaledPatch[k] = typeof val === 'number' ? val * factor : val;
    }

    return {
      ...scenario,
      vector_patch: {
        ...scenario.vector_patch,
        [choice]: scaledPatch as DynamicScenarioDef['vector_patch'][ChoiceOption],
      },
    };
  }

  private extractPrimaryDelta(patch: Record<string, unknown>): number {
    const numbers = Object.values(patch).filter((v): v is number => typeof v === 'number');
    if (numbers.length === 0) return 0;
    return numbers.reduce((sum, v) => sum + v, 0) / numbers.length;
  }

  async getLatest(userId: string) {
    const rows = await this.db.pool.query(
      `SELECT id, locale, script_version, scenario_set, result, completed_at
       FROM assessment_runs
       WHERE user_id = $1
       ORDER BY completed_at DESC
       LIMIT 1`,
      [userId],
    );
    return rows.rows[0] ?? null;
  }

  private buildLLMCaller(): LLMCaller {
    const { baseUrl, explicitPath, apiKey, model } = resolveLlmRuntimeConfig();

    if (!apiKey) {
      throw new InternalServerErrorException(
        '[AssessmentService] LLM_API_KEY/OPENAI_API_KEY not set — cannot generate micro-sandbox.',
      );
    }

    // 与 worker 的 callLLM 保持一致：加超时。此前是裸 fetch，LLM 无响应时
    // 会挂死 micro-sandbox 请求（同步 HTTP 路径，直到网关超时才断开）。
    const timeoutMs = Number(process.env.EVA_LLM_TIMEOUT_MS ?? 60_000);
    return async ({ system, messages, max_tokens = 1024, temperature = 0.65 }) => {
      const url = resolveLlmChatCompletionsUrl(baseUrl, explicitPath);
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages: [{ role: 'system', content: system }, ...messages],
          max_tokens,
          temperature,
        }),
        signal: AbortSignal.timeout(timeoutMs),
      });

      if (!response.ok) {
        const body = await response.text();
        throw new ServiceUnavailableException(`[AssessmentService] LLM API error ${response.status}: ${body}`);
      }

      const data = (await response.json()) as { choices: Array<{ message: { content: string } }> };
      return data.choices[0]?.message?.content ?? '';
    };
  }

  private parsePendingScenario(raw: string): PendingMicroScenario {
    try {
      const parsed = JSON.parse(raw) as PendingMicroScenario;
      if (!parsed?.scenario?.id) throw new Error('invalid payload');
      return parsed;
    } catch {
      throw new BadRequestException('Invalid pending micro-sandbox payload.');
    }
  }

  private microScenarioKey(userId: string, token: string): string {
    return `micro_sandbox:${userId}:${token}`;
  }

  private buildMicroInsight(
    scenario: DynamicScenarioDef,
    choice: ChoiceOption,
    locale: string,
  ): string {
    const opt = scenario.options[choice];
    const patch = scenario.vector_patch[choice] as Record<string, unknown>;
    const primaryKey = this.primaryDimensionFromPatch(patch);
    if (locale === 'zh-CN') {
      return `具体观察：在「${scenario.title}」这个场景中，你选择了「${opt.text}」。\n分析：这次选择展现了你在「${primaryKey}」上的决策偏好。\n沟通确认：如果这次并不代表你的日常真实状态，你认为最大的例外是什么？`;
    }
    return `Fact: in "${scenario.title}", you chose "${opt.text}". Pattern: this choice pushed "${primaryKey}" to the front. Rebuttal: if this is not representative, what is the biggest exception?`;
  }

  private pickNextDimension(ubv: UBV | null): string | null {
    if (!ubv) return null;

    const dimKeys = [
      'trustBoundaries', 'conflictResponse', 'attachment',
      'emotionRegulation', 'stressResponse', 'achievementMotivation',
      'selfCognition', 'socialEnergy',
    ];

    let best: string | null = null;
    let lowestConfidence = Infinity;
    for (const key of dimKeys) {
      const dim = ubv[key];
      if (!dim) continue;
      if ((dim.evidence_count ?? 0) >= 3) continue;
      const conf = dim.confidence ?? 0.5;
      if (conf < lowestConfidence) {
        lowestConfidence = conf;
        best = key;
      }
    }

    return best;
  }

  private assertAssessmentSubmission(
    scenarioSet: string,
    dto: CompleteAssessmentDto,
  ): void {
    if (scenarioSet !== CURRENT_SCENARIO_SET) {
      throw new BadRequestException(`Unsupported scenario_set: ${scenarioSet}`);
    }

    const expectedScenarioIds = SCENARIO_SCHEMAS.map((schema) => schema.id);
    const selectedSchemaIds = dto.selected_schema_ids ?? [];
    const answers = dto.answers ?? [];
    const choices = dto.choices;
    const inputOnlyScenarioIds = new Set(
      SCENARIO_SCHEMAS.filter((schema) => schema.input_only === true).map((schema) => schema.id),
    );

    if (selectedSchemaIds.length !== expectedScenarioIds.length) {
      throw new BadRequestException(
        `Expected fixed 14 baseline scenarios, got ${selectedSchemaIds.length}`,
      );
    }

    for (let index = 0; index < expectedScenarioIds.length; index += 1) {
      if (selectedSchemaIds[index] !== expectedScenarioIds[index]) {
        throw new BadRequestException(
          `Invalid selected schema order at ${index}: expected ${expectedScenarioIds[index]}, got ${selectedSchemaIds[index]}`,
        );
      }
    }

    if (answers.length !== expectedScenarioIds.length) {
      throw new BadRequestException(`Expected ${expectedScenarioIds.length} answers, got ${answers.length}`);
    }

    for (let index = 0; index < expectedScenarioIds.length; index += 1) {
      const answer = answers[index];
      if (!answer) {
        throw new BadRequestException(`Missing answer at ${index}`);
      }
      if (answer.scenarioId !== expectedScenarioIds[index]) {
        throw new BadRequestException(
          `Invalid answer order at ${index}: expected ${expectedScenarioIds[index]}, got ${answer.scenarioId}`,
        );
      }

      const expectsInput = inputOnlyScenarioIds.has(answer.scenarioId);
      if (expectsInput && answer.kind !== 'input') {
        throw new BadRequestException(`Scenario "${answer.scenarioId}" must be submitted as free-text input.`);
      }
      if (!expectsInput && answer.kind !== 'choice') {
        throw new BadRequestException(`Scenario "${answer.scenarioId}" must be submitted as an A/B/C/D choice.`);
      }
    }

    const postedChoiceIds = choices.map((choice) => choice.scenarioId);
    if (postedChoiceIds.length !== SCORED_SCENARIO_IDS.length) {
      throw new BadRequestException(`Expected ${SCORED_SCENARIO_IDS.length} scored choices, got ${postedChoiceIds.length}`);
    }

    for (let index = 0; index < SCORED_SCENARIO_IDS.length; index += 1) {
      if (postedChoiceIds[index] !== SCORED_SCENARIO_IDS[index]) {
        throw new BadRequestException(
          `Invalid choice order at ${index}: expected ${SCORED_SCENARIO_IDS[index]}, got ${postedChoiceIds[index]}`,
        );
      }
    }
  }

  // ─────────────────────────────────────────────────────────────
  // [S1 Req 10.2] Daily micro-sandbox count for quota enforcement
  // ─────────────────────────────────────────────────────────────

  /**
   * Get the number of micro-sandbox assessment runs completed today.
   * Used by resolveFrequencyWeight to enforce the daily ≤3 quota.
   */
  private async getMicroSandboxTodayCount(userId: string): Promise<number> {
    const result = await this.db.pool.query<{ count: string }>(
      `SELECT count(*) as count
       FROM assessment_runs
       WHERE user_id = $1
         AND scenario_set = 'micro_sandbox'
         AND date(created_at) = current_date`,
      [userId],
    );
    return Number(result.rows[0]?.count ?? '0');
  }

  // ─────────────────────────────────────────────────────────────
  // [S1 Req 10.2] Confidence-driven dimension selection
  // ─────────────────────────────────────────────────────────────

  /**
   * Pick the target dimension for micro-sandbox using the four-factor confidence engine.
   * Priority:
   *   1. Dimensions with contradictions (triggerTargetedTest = true) — lowest confidence first
   *   2. Dimension with the lowest overall confidence
   * Falls back to null if no clear target (caller uses default scenario generation).
   */
  private async pickDimensionByConfidence(
    userId: string,
    ubv: UBV,
  ): Promise<string | null> {
    const dimKeys = [
      'trustBoundaries', 'conflictResponse', 'attachment',
      'emotionRegulation', 'stressResponse', 'achievementMotivation',
      'selfCognition', 'socialEnergy',
    ];

    // Load all evidence for confidence computation.
    // 必须过滤证据状态：此前仅按 user_id + dimension 查询，导致用户已驳回
    // （portrait_status='withdrawn' / candidate=true）的证据**仍参与置信度计算**；
    // 而唯一带过滤的 recomputeDimension 恰恰零调用——形成"在跑的不过滤、
    // 过滤的不在跑"的双重失效。此处补齐，与 recomputeDimension 保持一致。
    const evidenceRows = await this.db.pool.query<EvidenceEventRow>(
      `SELECT id, user_id, source_type, source_id, dimension, delta, weight, confidence,
              quote, explanation, created_at, evidence_kind, local_date, candidate, evidence_mode
       FROM ${FORMAL_EVIDENCE_VIEW}
       WHERE user_id = $1 AND dimension = ANY($2)
         AND COALESCE(candidate, false) = false
         AND COALESCE(portrait_status, 'legacy_unclassified') <> 'withdrawn'
       ORDER BY created_at ASC`,
      [userId, dimKeys],
    );

    // Group events by dimension
    const eventsByDim = new Map<string, EvidenceEventRow[]>();
    for (const row of evidenceRows?.rows ?? []) {
      const ev: EvidenceEventRow = { ...row, created_at: new Date(row.created_at) };
      const list = eventsByDim.get(ev.dimension) ?? [];
      list.push(ev);
      eventsByDim.set(ev.dimension, list);
    }

    // Load calibration timestamps per dimension（同样排除已撤回/候选证据）
    const calibrationRows = await this.db.pool.query<{ dimension: string; created_at: Date }>(
      `SELECT dimension, created_at FROM ${FORMAL_EVIDENCE_VIEW}
       WHERE user_id = $1 AND dimension = ANY($2) AND evidence_kind = 'calibration'
         AND COALESCE(candidate, false) = false
         AND COALESCE(portrait_status, 'legacy_unclassified') <> 'withdrawn'
       ORDER BY created_at ASC`,
      [userId, dimKeys],
    );
    const calibrationsByDim = new Map<string, number[]>();
    for (const row of calibrationRows?.rows ?? []) {
      const list = calibrationsByDim.get(row.dimension) ?? [];
      list.push(new Date(row.created_at).getTime());
      calibrationsByDim.set(row.dimension, list);
    }

    // Compute confidence for each dimension
    const results: DimensionConfidenceResult[] = [];
    const now = Date.now();
    for (const dim of dimKeys) {
      const events = eventsByDim.get(dim) ?? [];
      const baseValue = (ubv[dim] as BeliefDim | undefined)?.value ?? 50;
      const calibrationTimestamps = calibrationsByDim.get(dim) ?? [];

      const result = computeDimensionConfidence({
        dimension: dim,
        baseValue,
        events,
        calibrationTimestamps,
        now,
      });
      results.push(result);
    }

    // Priority 1: dimensions with contradictions (triggerTargetedTest), pick lowest confidence
    const contradicted = results
      .filter(r => r.triggerTargetedTest)
      .sort((a, b) => a.confidence - b.confidence);
    if (contradicted.length > 0) {
      return contradicted[0]!.dimension;
    }

    // Priority 2: lowest confidence dimension overall
    const sorted = [...results].sort((a, b) => a.confidence - b.confidence);
    if (sorted.length > 0 && sorted[0]!.confidence < 1.0) {
      return sorted[0]!.dimension;
    }

    return null;
  }

  /**
   * [Reflection Funnel Phase 3] Wrap the new Router with tier awareness
   * and a user_tier lookup. Resolves to 'guest' when the user row is absent.
   * Returns null if the Router has nothing to recommend (e.g. all dimensions
   * stable).
   */
  private async decideReflectionTarget(
    userId: string,
    ubv: UBV,
  ): Promise<RouterDecision | null> {
    try {
      const user_tier = await this.getUserTierSafe(userId);

      const dimKeys = [
        'trustBoundaries',
        'conflictResponse',
        'attachment',
        'emotionRegulation',
        'stressResponse',
        'achievementMotivation',
        'selfCognition',
        'socialEnergy',
      ] as const;

      const now = Date.now();
      const dimensions = dimKeys.map((dim) => {
        const belief = ubv[dim];
        return {
          dimension: dim,
          evidence_count: belief?.evidence_count ?? 0,
          confidence: belief?.confidence ?? 0.5,
          has_contradiction: false,
          last_tested_at: belief?.last_evidence_at,
          current_value: belief?.value ?? 50,
        };
      });

      return decideNextQuestion({ dimensions, user_tier, now });
    } catch (err) {
      // Never let a Router error break assessment — fall back to legacy.
      // eslint-disable-next-line no-console
      console.warn(
        `[Reflection Funnel] decideReflectionTarget failed: ${(err as Error).message}`,
      );
      return null;
    }
  }

  /**
   * Safely resolve the reflection-funnel tier for a user.
   *
   * [fix 2026-08-01] This used to `SELECT user_tier`, a column name that only
   * ever existed in the Phase 5 plan doc and was never migrated. The shipped
   * schema stores entitlements in `users.entitlement_tier` ('free' | 'paid'),
   * which is what auth.service.getEntitlementTier() already reads. Querying the
   * non-existent column raised PG 42703 on every micro-sandbox request.
   * Returns 'guest' when no row matches the id; falls back to
   * 'registered_free' when the tier is null/unknown or the query fails.
   */
  private async getUserTierSafe(
    userId: string,
  ): Promise<'guest' | 'registered_free' | 'paid'> {
    try {
      const result = await this.db.pool.query<{ entitlement_tier?: string | null }>(
        `SELECT entitlement_tier FROM users WHERE id = $1 LIMIT 1`,
        [userId],
      );
      if (result.rows.length === 0) return 'guest';
      const tier = result.rows[0]?.entitlement_tier;
      if (tier === 'paid') return 'paid';
      return 'registered_free';
    } catch {
      return 'registered_free';
    }
  }
}
