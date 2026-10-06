import { BadRequestException } from '@nestjs/common';
import { generateDynamicScenarios } from '@eva/core';

jest.mock('@eva/core', () => {
  const buildExpectedSignal = () => ({ A: 'high', B: 'mid-high', C: 'mid-low', D: 'low' });
  const buildOptions = () => ({ A: {}, B: {}, C: {}, D: {} });
  const SCENARIO_SCHEMAS = [
    { id: 'trust', dimension: 'trustBoundaries', measurementIntent: '', confounders: [], reverse_scored: false, attention_check: false, expected_signal: buildExpectedSignal(), vector_patch: buildOptions(), allow_free_text: false },
    { id: 'conflict', dimension: 'conflictResponse', measurementIntent: '', confounders: [], reverse_scored: false, attention_check: false, expected_signal: buildExpectedSignal(), vector_patch: buildOptions(), allow_free_text: false },
    { id: 'attachment', dimension: 'attachment', measurementIntent: '', confounders: [], reverse_scored: false, attention_check: false, expected_signal: buildExpectedSignal(), vector_patch: buildOptions(), allow_free_text: false },
    { id: 'emotion', dimension: 'emotionRegulation', measurementIntent: '', confounders: [], reverse_scored: false, attention_check: false, expected_signal: buildExpectedSignal(), vector_patch: buildOptions(), allow_free_text: false },
    { id: 'stress', dimension: 'stressResponse', measurementIntent: '', confounders: [], reverse_scored: false, attention_check: false, expected_signal: buildExpectedSignal(), vector_patch: buildOptions(), allow_free_text: false },
    { id: 'achievement', dimension: 'achievementMotivation', measurementIntent: '', confounders: [], reverse_scored: false, attention_check: false, expected_signal: buildExpectedSignal(), vector_patch: buildOptions(), allow_free_text: false },
    { id: 'selfview', dimension: 'selfCognition', measurementIntent: '', confounders: [], reverse_scored: false, attention_check: false, expected_signal: buildExpectedSignal(), vector_patch: buildOptions(), allow_free_text: false },
    { id: 'socialenergy', dimension: 'socialEnergy', measurementIntent: '', confounders: [], reverse_scored: false, attention_check: false, expected_signal: buildExpectedSignal(), vector_patch: buildOptions(), allow_free_text: false },
    { id: 'conflict_friend', dimension: 'conflictResponse', measurementIntent: '', confounders: [], reverse_scored: false, attention_check: false, expected_signal: buildExpectedSignal(), vector_patch: buildOptions(), allow_free_text: false },
    { id: 'stress_chronic', dimension: 'stressResponse', measurementIntent: '', confounders: [], reverse_scored: false, attention_check: false, expected_signal: buildExpectedSignal(), vector_patch: buildOptions(), allow_free_text: false },
    { id: 'social_lowenergy', dimension: 'socialEnergy', measurementIntent: '', confounders: [], reverse_scored: false, attention_check: false, expected_signal: buildExpectedSignal(), vector_patch: buildOptions(), allow_free_text: false },
    { id: 'motive_silence', dimension: 'conflictResponse', measurementIntent: '', confounders: [], reverse_scored: false, attention_check: false, expected_signal: buildExpectedSignal(), vector_patch: buildOptions(), allow_free_text: false },
    { id: 'motive_social', dimension: 'socialEnergy', measurementIntent: '', confounders: [], reverse_scored: false, attention_check: false, expected_signal: buildExpectedSignal(), vector_patch: buildOptions(), allow_free_text: false },
    { id: 'reality_refuse', dimension: 'trustBoundaries', measurementIntent: '', confounders: [], reverse_scored: false, attention_check: false, expected_signal: buildExpectedSignal(), vector_patch: buildOptions(), allow_free_text: true, input_only: true, free_text_dimension: 'trustBoundaries' },
  ];
  const SCORED_SCENARIO_IDS = SCENARIO_SCHEMAS.filter((schema) => !schema.input_only).map((schema) => schema.id);

  return {
    __esModule: true,
    CURRENT_SCRIPT_VERSION: '2026-06-v2',
    CURRENT_SCENARIO_SET: 'global_core_v2',
    CURRENT_MICRO_SCENARIO_SET: 'micro_sandbox_v1',
    SCENARIO_SCHEMAS,
    SCORED_SCENARIO_IDS,
    ALL_SCENARIO_SCHEMAS: SCENARIO_SCHEMAS,
    DIMENSION_KIND_MAP: {},
    resolveFrequencyWeight: jest.fn(() => ({ kind: 'formal', weight: 0.8 })),
    computeDimensionConfidence: jest.fn(),
    generateScriptResult: jest.fn(() => ({
      key_insight: 'test insight',
      evidence_log: [],
      vector: {},
      narrative: '',
      eva_opening: '',
      share_card: { archetype: 'test', headline: 'test', description: 'test', cta: 'test' },
      choices: [],
    })),
    applyScriptResult: jest.fn((memory) => memory),
    applyPersonalityVectorUpdate: jest.fn((memory) => memory),
    generateDynamicScenarios: jest.fn(),
    mergeDynamicVector: jest.fn(),
    computeAssessmentEvidenceEvents: jest.fn(() => []),
    computeUBVEvidenceEvents: jest.fn(() => []),
    applyDecayToAll: jest.fn((dims) => dims),
  };
});

jest.mock('../../common/feature-flags.js', () => ({
  EVA_STRUCTURED_REFLECTION_V1: false,
}));

import { AssessmentService } from './assessment.service.js';

const mockDb = { pool: { connect: jest.fn(), query: jest.fn() } };
const mockAuth = { getUserMemory: jest.fn(), saveUserMemory: jest.fn(), getSandboxCompletedToday: jest.fn() };
const mockRedis = { get: jest.fn(), set: jest.fn(), del: jest.fn() };
const mockEvidenceService = { writeEvidence: jest.fn() };
const mockQueue = { enqueueSnapshot: jest.fn().mockResolvedValue(undefined) };

function buildFixedAnswers() {
  return [
    { kind: 'choice' as const, scenarioId: 'trust', choice: 'A' as const, timestamp: 1 },
    { kind: 'choice' as const, scenarioId: 'conflict', choice: 'B' as const, timestamp: 2 },
    { kind: 'choice' as const, scenarioId: 'attachment', choice: 'C' as const, timestamp: 3 },
    { kind: 'choice' as const, scenarioId: 'emotion', choice: 'D' as const, timestamp: 4 },
    { kind: 'choice' as const, scenarioId: 'stress', choice: 'A' as const, timestamp: 5 },
    { kind: 'choice' as const, scenarioId: 'achievement', choice: 'B' as const, timestamp: 6 },
    { kind: 'choice' as const, scenarioId: 'selfview', choice: 'C' as const, timestamp: 7 },
    { kind: 'choice' as const, scenarioId: 'socialenergy', choice: 'D' as const, timestamp: 8 },
    { kind: 'choice' as const, scenarioId: 'conflict_friend', choice: 'A' as const, timestamp: 9 },
    { kind: 'choice' as const, scenarioId: 'stress_chronic', choice: 'B' as const, timestamp: 10 },
    { kind: 'choice' as const, scenarioId: 'social_lowenergy', choice: 'C' as const, timestamp: 11 },
    { kind: 'choice' as const, scenarioId: 'motive_silence', choice: 'D' as const, timestamp: 12 },
    { kind: 'choice' as const, scenarioId: 'motive_social', choice: 'A' as const, timestamp: 13 },
    { kind: 'input' as const, scenarioId: 'reality_refuse', text: '我当时想拒绝，但怕对方失望。', timestamp: 14 },
  ];
}

function buildFixedChoices() {
  return buildFixedAnswers()
    .filter((answer): answer is Extract<ReturnType<typeof buildFixedAnswers>[number], { kind: 'choice' }> => answer.kind === 'choice')
    .map(({ scenarioId, choice, timestamp }) => ({ scenarioId, choice, timestamp }));
}

describe('AssessmentService fixed Level 1 baseline', () => {
  let service: AssessmentService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new AssessmentService(
      mockDb as any,
      mockAuth as any,
      mockRedis as any,
      mockEvidenceService as any,
      mockQueue as any,
    );
  });

  it('rejects empty free-text for the reality input question', async () => {
    await expect(service.complete('user-1', {
      locale: 'zh-CN',
      choices: buildFixedChoices(),
      selected_schema_ids: buildFixedAnswers().map((answer) => answer.scenarioId),
      answers: buildFixedAnswers().map((answer) => (
        answer.kind === 'input' ? { ...answer, text: '   ' } : answer
      )),
    })).rejects.toThrow(BadRequestException);
  });

  it('accepts the fixed 14-question order with 13 scored choices + 1 input', () => {
    expect(() => (service as any).assertAssessmentSubmission('global_core_v2', {
      locale: 'zh-CN',
      choices: buildFixedChoices(),
      selected_schema_ids: buildFixedAnswers().map((answer) => answer.scenarioId),
      answers: buildFixedAnswers(),
    })).not.toThrow();
  });

  it('rejects the legacy short submission shape', () => {
    expect(() => (service as any).assertAssessmentSubmission('global_core_v2', {
      locale: 'zh-CN',
      choices: [{ scenarioId: 'trust', choice: 'A', timestamp: 1 }],
      selected_schema_ids: ['trust'],
      answers: [{ kind: 'choice', scenarioId: 'trust', choice: 'A', timestamp: 1 }],
    })).toThrow('Expected fixed 14 baseline scenarios, got 1');
  });

  it('rejects when the reality input question is posted as a choice', () => {
    const answers = buildFixedAnswers().map((answer) => (
      answer.scenarioId === 'reality_refuse'
        ? { kind: 'choice' as const, scenarioId: 'reality_refuse', choice: 'A' as const, timestamp: 14 }
        : answer
    ));

    expect(() => (service as any).assertAssessmentSubmission('global_core_v2', {
      locale: 'zh-CN',
      choices: buildFixedChoices(),
      selected_schema_ids: answers.map((answer) => answer.scenarioId),
      answers,
    })).toThrow('Scenario "reality_refuse" must be submitted as free-text input.');
  });

  it('does not pass saved captures or legacy diary text to micro-sandbox generation', async () => {
    mockDb.pool.query.mockResolvedValue({ rows: [{ count: '0' }] });
    mockAuth.getUserMemory.mockResolvedValue({
      meta: { baseline_completed: true },
      personality_vector: { trust_threshold: 0.5 },
      diary_entries: [{ raw_user_messages: ['private diary text'] }],
    });
    mockRedis.set.mockResolvedValue('OK');
    jest.spyOn(service as any, 'buildLLMCaller').mockReturnValue(jest.fn());
    jest.mocked(generateDynamicScenarios).mockResolvedValue([{ id: 'scenario-1' }] as any);

    await service.microSandboxNext('user-1', { locale: 'zh-CN', mode: 'practice' });

    expect(generateDynamicScenarios).toHaveBeenCalledWith(
      expect.any(Object), [], expect.any(Function), 'zh-CN', undefined,
    );
    expect(mockDb.pool.query).not.toHaveBeenCalledWith(expect.stringContaining('FROM captures'), expect.anything());
  });
});
