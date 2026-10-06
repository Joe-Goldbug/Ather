// packages/core/src/assessment/scenario-contracts.test.ts
// Contract tests for scenario scoring accuracy
//
// These tests do NOT check UI or prompts — they verify that:
//  1. Each scenario's vector_patch produces values in the expected direction
//  2. expected_signal labels match actual patch magnitudes
//  3. Every scenario has required accuracy metadata
//  4. Multi-evidence aggregation produces bounded, sensible outputs
//  5. Confidence-decay works correctly across all three kinds
//  6. Correction analytics generates accurate signals

import { describe, test, expect } from 'bun:test';
import { SCENARIO_SCHEMAS, ALL_SCENARIO_SCHEMAS } from './script-schema.js';
import { generateDynamicScenarios } from './script-engine.js';
import {
  aggregateDimensionConfidence,
  aggregateAllDimensions,
} from '../evidence/confidence-aggregator.js';
import {
  computeCorrectionSignals,
  applyCorrectionsToConfidence,
} from '../evidence/correction-analytics.js';
import {
  applyConfidenceDecay,
  applyDecayToAll,
  DIMENSION_KIND_MAP,
} from '../evidence/confidence-decay.js';
import {
  applyPersonalityVectorUpdate,
  createMemory,
} from '../memory/memory.js';
import type { EvidenceEventRow } from '../evidence/evidence-types.js';
import type { BeliefDim, PersonalityVector } from '../shared/types.js';

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

/** Convert an ExpectedSignal label to a numeric range [min, max] for the primary score */
function signalRange(signal: 'high' | 'mid-high' | 'mid-low' | 'low'): [number, number] {
  switch (signal) {
    case 'high':     return [0.70, 1.00];
    case 'mid-high': return [0.45, 0.75];
    case 'mid-low':  return [0.20, 0.60];
    case 'low':      return [0.00, 0.35];
  }
}

/** Get the numeric score that the patch represents for a scenario's primary dimension */
function patchScore(scenarioId: string, choice: 'A' | 'B' | 'C' | 'D'): number | null {
  const schema = SCENARIO_SCHEMAS.find((s) => s.id === scenarioId);
  if (!schema) return null;
  const patch = schema.vector_patch[choice];

  switch (scenarioId) {
    case 'trust':
      // trust_threshold: 0=open, 1=guarded → invert so high UBV trustBoundaries = open (low threshold)
      return patch.trust_threshold != null ? 1 - patch.trust_threshold : null;
    case 'conflict':     return patch.conflict_score ?? null;
    case 'attachment':   return patch.attachment_score ?? null;
    case 'emotion':      return null; // categorical only
    case 'stress':
      // stress_score: 0=low-stress/coping, 1=high-stress → invert so high UBV = better coping
      return patch.stress_score != null ? 1 - patch.stress_score : null;
    case 'achievement':  return patch.perfectionism_score ?? null;
    case 'selfview':     return patch.growth_mindset_score ?? null;
    case 'socialenergy': return patch.social_energy_score ?? null;
    default:             return null;
  }
}

function makeEvidenceRow(overrides: Partial<EvidenceEventRow> = {}): EvidenceEventRow {
  return {
    id: 'test-id',
    user_id: 'user-1',
    source_type: 'test',
    source_id: null,
    dimension: 'trustBoundaries',
    delta: 10,
    weight: 0.5,
    confidence: 0.6,
    quote: null,
    explanation: 'test',
    created_at: new Date(),
    ...overrides,
  };
}

function makeBeliefDim(overrides: Partial<BeliefDim> = {}): BeliefDim {
  return {
    value: 50,
    variance: 0,
    evidence_count: 3,
    last_updated: Date.now(),
    last_evidence_at: Date.now(),
    sources: ['script'],
    confidence: 0.6,
    kind: 'trait',
    correction_count: 0,
    ...overrides,
  };
}

function makePersonalityVector(overrides: Partial<PersonalityVector> = {}): PersonalityVector {
  return {
    trust_threshold: 0.2,
    boundary_strength: 0.3,
    conflict_style: 'analytical',
    conflict_score: 0.7,
    attachment_pattern: 'secure',
    attachment_score: 0.8,
    emotional_regulation: 'rational',
    stress_response: 'mindfulness',
    stress_score: 0.2,
    achievement_drive: 'flow_state',
    perfectionism_score: 0.5,
    selfview_pattern: 'growth_minded',
    growth_mindset_score: 0.85,
    social_energy_style: 'energy_giving',
    social_energy_score: 0.9,
    openness_score: 0.8,
    stability_score: 0.77,
    neuroticism_score: 0.18,
    confidence: {
      trust: 0.6,
      conflict: 0.6,
      attachment: 0.6,
      emotion: 0.6,
      stress: 0.6,
      achievement: 0.6,
      selfview: 0.6,
      socialenergy: 0.6,
    },
    ...overrides,
  };
}

// ─────────────────────────────────────────────────────────────
// 1. Schema metadata completeness
// ─────────────────────────────────────────────────────────────

describe('ScenarioSchema metadata', () => {
  test('every scenario has required accuracy fields', () => {
    for (const schema of SCENARIO_SCHEMAS) {
      expect(typeof schema.confounders).toBe('object');
      expect(Array.isArray(schema.confounders)).toBe(true);
      expect(typeof schema.reverse_scored).toBe('boolean');
      expect(typeof schema.attention_check).toBe('boolean');
      expect(schema.expected_signal).toBeDefined();
      expect(Object.keys(schema.expected_signal)).toHaveLength(4);
    }
  });

  test('every scenario covers all four choice options in expected_signal', () => {
    for (const schema of SCENARIO_SCHEMAS) {
      expect(['A', 'B', 'C', 'D'].every((c) => c in schema.expected_signal)).toBe(true);
    }
  });

  test('all expected_signal values are valid labels', () => {
    const valid = new Set(['high', 'mid-high', 'mid-low', 'low']);
    for (const schema of SCENARIO_SCHEMAS) {
      for (const signal of Object.values(schema.expected_signal)) {
        expect(valid.has(signal)).toBe(true);
      }
    }
  });

  test('each scenario has a non-empty measurementIntent', () => {
    for (const schema of SCENARIO_SCHEMAS) {
      expect(schema.measurementIntent.length).toBeGreaterThan(3);
    }
  });

  test('no scenario has more than one secondary dimension', () => {
    // secondary_dimension is optional and at most one
    for (const schema of SCENARIO_SCHEMAS) {
      if (schema.secondary_dimension !== undefined) {
        expect(typeof schema.secondary_dimension).toBe('string');
      }
    }
  });
});

// ─────────────────────────────────────────────────────────────
// 2. vector_patch signal direction contract
//    For numeric-score scenarios only (emotion is categorical)
// ─────────────────────────────────────────────────────────────

describe('vector_patch signal direction', () => {
  const numericScenarios = SCENARIO_SCHEMAS.filter(
    (s) => s.id !== 'emotion' && !s.attention_check,
  );

  for (const schema of numericScenarios) {
    test(`${schema.id}: "high" signal choices score higher than "low" signal choices`, () => {
      const highChoices = (['A', 'B', 'C', 'D'] as const).filter(
        (c) => schema.expected_signal[c] === 'high',
      );
      const lowChoices = (['A', 'B', 'C', 'D'] as const).filter(
        (c) => schema.expected_signal[c] === 'low',
      );

      if (highChoices.length === 0 || lowChoices.length === 0) return; // skip if not applicable

      const highScores = highChoices.map((c) => patchScore(schema.id, c)).filter((v) => v !== null) as number[];
      const lowScores  = lowChoices.map((c) => patchScore(schema.id, c)).filter((v) => v !== null) as number[];

      if (highScores.length === 0 || lowScores.length === 0) return;

      const minHigh = Math.min(...highScores);
      const maxLow  = Math.max(...lowScores);
      expect(minHigh).toBeGreaterThan(maxLow);
    });
  }

  for (const schema of numericScenarios) {
    test(`${schema.id}: each choice score falls in its expected signal range`, () => {
      for (const choice of ['A', 'B', 'C', 'D'] as const) {
        const score = patchScore(schema.id, choice);
        if (score === null) continue;
        const [min, max] = signalRange(schema.expected_signal[choice]);
        expect(score).toBeGreaterThanOrEqual(min);
        expect(score).toBeLessThanOrEqual(max);
      }
    });
  }
});

// ─────────────────────────────────────────────────────────────
// 3. Confidence aggregator
// ─────────────────────────────────────────────────────────────

describe('aggregateDimensionConfidence', () => {
  test('empty events returns base value and min confidence', () => {
    const result = aggregateDimensionConfidence(50, []);
    expect(result.weighted_value).toBe(50);
    expect(result.confidence).toBe(0.1);
    expect(result.evidence_count).toBe(0);
  });

  test('single event: confidence capped below 0.5 (insufficient evidence)', () => {
    const events = [makeEvidenceRow({ delta: 10, weight: 0.8, confidence: 0.9 })];
    const result = aggregateDimensionConfidence(50, events);
    // With 1 event out of 5 needed: evidence_scale = 0.2, so base = 0.2 * 0.9 = 0.18
    expect(result.confidence).toBeLessThan(0.5);
  });

  test('five events with consistent direction: confidence is reasonable', () => {
    const events = Array.from({ length: 5 }, (_, i) =>
      makeEvidenceRow({ delta: 8 + i, weight: 0.6, confidence: 0.65 }),
    );
    const result = aggregateDimensionConfidence(50, events);
    expect(result.confidence).toBeGreaterThan(0.3);
    expect(result.conflict_detected).toBe(false);
  });

  test('contradictory events: conflict detected and confidence penalised', () => {
    const events = [
      makeEvidenceRow({ delta: 25, weight: 0.7, confidence: 0.7 }),
      makeEvidenceRow({ delta: 25, weight: 0.7, confidence: 0.7 }),
      makeEvidenceRow({ delta: -25, weight: 0.7, confidence: 0.7 }),
      makeEvidenceRow({ delta: -25, weight: 0.7, confidence: 0.7 }),
      makeEvidenceRow({ delta: 25, weight: 0.7, confidence: 0.7 }),
    ];
    const consistent = Array.from({ length: 5 }, () =>
      makeEvidenceRow({ delta: 15, weight: 0.7, confidence: 0.7 }),
    );
    const conflictResult   = aggregateDimensionConfidence(50, events);
    const consistentResult = aggregateDimensionConfidence(50, consistent);

    expect(conflictResult.conflict_detected).toBe(true);
    expect(conflictResult.confidence).toBeLessThan(consistentResult.confidence);
  });

  test('single extreme delta is clamped to ±30', () => {
    const extremePos = [makeEvidenceRow({ delta: 80, weight: 1.0, confidence: 0.8 })];
    const extremeNeg = [makeEvidenceRow({ delta: -80, weight: 1.0, confidence: 0.8 })];
    const resultPos = aggregateDimensionConfidence(50, extremePos);
    const resultNeg = aggregateDimensionConfidence(50, extremeNeg);

    // Value should not exceed 50+30=80 or go below 50-30=20
    expect(resultPos.weighted_value).toBeLessThanOrEqual(80);
    expect(resultNeg.weighted_value).toBeGreaterThanOrEqual(20);
  });

  test('output confidence always within [0.1, 0.95]', () => {
    // Edge case: many contradictory events
    const events = Array.from({ length: 20 }, (_, i) =>
      makeEvidenceRow({ delta: i % 2 === 0 ? 30 : -30, weight: 1.0, confidence: 1.0 }),
    );
    const result = aggregateDimensionConfidence(50, events);
    expect(result.confidence).toBeGreaterThanOrEqual(0.1);
    expect(result.confidence).toBeLessThanOrEqual(0.95);
  });

  test('aggregateAllDimensions groups events by dimension', () => {
    const events: EvidenceEventRow[] = [
      makeEvidenceRow({ dimension: 'trustBoundaries', delta: 10 }),
      makeEvidenceRow({ dimension: 'trustBoundaries', delta: 5 }),
      makeEvidenceRow({ dimension: 'attachment', delta: -8 }),
    ];
    const results = aggregateAllDimensions(
      { trustBoundaries: 50, attachment: 50 },
      events,
    );
    expect(results.has('trustBoundaries')).toBe(true);
    expect(results.has('attachment')).toBe(true);
    expect(results.get('trustBoundaries')!.evidence_count).toBe(2);
    expect(results.get('attachment')!.evidence_count).toBe(1);
  });
});

// ─────────────────────────────────────────────────────────────
// 4. Correction analytics
// ─────────────────────────────────────────────────────────────

describe('computeCorrectionSignals', () => {
  test('empty input returns empty array', () => {
    expect(computeCorrectionSignals([])).toHaveLength(0);
  });

  test('low correction rate produces zero penalty', () => {
    const corrections = [
      { id: '1', user_id: 'u1', dimension: 'trustBoundaries',
        source_type: 'chat_claim' as const,
        original_text: 'x', corrected_text: 'y', created_at: new Date() },
    ];
    // 1 correction / 10 assumed baseline = 0.1 rate (below 0.3 threshold)
    const signals = computeCorrectionSignals(corrections);
    expect(signals[0]!.confidence_penalty).toBe(0);
    expect(signals[0]!.suggest_retest).toBe(false);
  });

  test('correction_rate > 0.3 produces a positive penalty', () => {
    const corrections = Array.from({ length: 4 }, (_, i) => ({
      id: String(i), user_id: 'u1', dimension: 'attachment',
      source_type: 'report_claim' as const,
      original_text: 'x', corrected_text: 'y', created_at: new Date(),
    }));
    // 4 / 10 = 0.4 rate → exceeds threshold
    const signals = computeCorrectionSignals(corrections);
    expect(signals[0]!.confidence_penalty).toBeGreaterThan(0);
  });

  test('3 or more corrections trigger suggest_retest', () => {
    const corrections = Array.from({ length: 3 }, (_, i) => ({
      id: String(i), user_id: 'u1', dimension: 'conflictResponse',
      source_type: 'chat_claim' as const,
      original_text: 'x', corrected_text: 'y', created_at: new Date(),
    }));
    const signals = computeCorrectionSignals(corrections);
    expect(signals[0]!.suggest_retest).toBe(true);
  });

  test('applyCorrectionsToConfidence clamps output to [0.1, 0.95]', () => {
    const signals = computeCorrectionSignals(
      Array.from({ length: 10 }, (_, i) => ({
        id: String(i), user_id: 'u1', dimension: 'socialEnergy',
        source_type: 'report_claim' as const,
        original_text: 'x', corrected_text: 'y', created_at: new Date(),
      })),
    );
    const result = applyCorrectionsToConfidence({ socialEnergy: 0.15 }, signals);
    expect(result['socialEnergy']).toBeGreaterThanOrEqual(0.1);
    expect(result['socialEnergy']).toBeLessThanOrEqual(0.95);
  });
});

// ─────────────────────────────────────────────────────────────
// 5. Confidence decay
// ─────────────────────────────────────────────────────────────

describe('applyConfidenceDecay', () => {
  test('no decay when elapsed time is zero', () => {
    const now = Date.now();
    const dim = makeBeliefDim({ confidence: 0.7, last_evidence_at: now });
    const result = applyConfidenceDecay(dim, now);
    expect(result.confidence).toBe(0.7);
  });

  test('state dim: confidence halves after 7 days', () => {
    const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const dim = makeBeliefDim({ confidence: 0.6, kind: 'state', last_evidence_at: sevenDaysAgo });
    const result = applyConfidenceDecay(dim, Date.now());
    // Should be approximately 0.6 * 0.5 = 0.3
    expect(result.confidence).toBeGreaterThan(0.25);
    expect(result.confidence).toBeLessThan(0.35);
  });

  test('trait dim: confidence at 30 days is ~79% of original (2^(1/3) ≈ 0.79)', () => {
    const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
    const dim = makeBeliefDim({ confidence: 0.8, kind: 'trait', last_evidence_at: thirtyDaysAgo });
    const result = applyConfidenceDecay(dim, Date.now());
    // 0.8 * 0.5^(30/90) = 0.8 * 0.794 ≈ 0.635
    expect(result.confidence).toBeGreaterThan(0.59);
    expect(result.confidence).toBeLessThan(0.68);
  });

  test('signal dim: confidence halves after 1 day', () => {
    const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
    const dim = makeBeliefDim({ confidence: 0.8, kind: 'signal', last_evidence_at: oneDayAgo });
    const result = applyConfidenceDecay(dim, Date.now());
    expect(result.confidence).toBeGreaterThan(0.35);
    expect(result.confidence).toBeLessThan(0.45);
  });

  test('confidence never drops below DECAY_FLOOR (0.1)', () => {
    const longAgo = Date.now() - 365 * 24 * 60 * 60 * 1000; // 1 year
    const dim = makeBeliefDim({ confidence: 0.5, kind: 'state', last_evidence_at: longAgo });
    const result = applyConfidenceDecay(dim, Date.now());
    expect(result.confidence).toBeGreaterThanOrEqual(0.1);
  });

  test('applyDecayToAll processes all dimensions in record', () => {
    const longAgo = Date.now() - 10 * 24 * 60 * 60 * 1000;
    const dims = {
      trustBoundaries: makeBeliefDim({ confidence: 0.7, kind: 'trait', last_evidence_at: longAgo }),
      socialEnergy: makeBeliefDim({ confidence: 0.6, kind: 'trait', last_evidence_at: longAgo }),
    };
    const result = applyDecayToAll(dims, Date.now());
    // Both should have decayed
    expect(result.trustBoundaries.confidence).toBeLessThan(0.7);
    expect(result.socialEnergy.confidence).toBeLessThan(0.6);
  });
});

// ─────────────────────────────────────────────────────────────
// 6. DIMENSION_KIND_MAP completeness
// ─────────────────────────────────────────────────────────────

describe('DIMENSION_KIND_MAP', () => {
  const L1_DIMS = [
    'trustBoundaries', 'conflictResponse', 'attachment', 'emotionRegulation',
    'stressResponse', 'achievementMotivation', 'selfCognition', 'socialEnergy',
  ];

  test('all L1 dimensions are classified as trait', () => {
    for (const dim of L1_DIMS) {
      expect(DIMENSION_KIND_MAP[dim]).toBe('trait');
    }
  });

  test('linguisticExtraversion and narrativeCoherence are signals', () => {
    expect(DIMENSION_KIND_MAP['linguisticExtraversion']).toBe('signal');
    expect(DIMENSION_KIND_MAP['narrativeCoherence']).toBe('signal');
  });
});

// ─────────────────────────────────────────────────────────────
// 7. PersonalityVector → UBV mapping completeness
// ─────────────────────────────────────────────────────────────

describe('PersonalityVector to UBV mapping', () => {
  test('follow-up vector updates all 8 core UBV dimensions', () => {
    const memory = createMemory('user-1');
    const updated = applyPersonalityVectorUpdate(memory, makePersonalityVector());

    const coreDims = [
      'trustBoundaries',
      'conflictResponse',
      'attachment',
      'emotionRegulation',
      'stressResponse',
      'achievementMotivation',
      'selfCognition',
      'socialEnergy',
    ] as const;

    for (const key of coreDims) {
      expect(updated.ubv?.[key].evidence_count).toBeGreaterThan(0);
    }

    expect(updated.ubv?.selfCognition.value).toBeGreaterThan(50);
    expect(updated.ubv?.socialEnergy.value).toBeGreaterThan(50);
    expect(updated.ubv?.achievementMotivation.value).toBeGreaterThan(50);
  });
});

// ─────────────────────────────────────────────────────────────
// 8. ALL_SCENARIO_SCHEMAS — supplementary schema coverage
//    Acceptance criteria: ≥3 schemas per core dimension,
//    ≥2 reverse_scored, ≥1 attention_check.
// ─────────────────────────────────────────────────────────────

describe('ALL_SCENARIO_SCHEMAS supplementary coverage', () => {
  const CORE_DIMENSIONS = [
    'trustBoundaries', 'conflictResponse', 'attachment', 'emotionRegulation',
    'stressResponse', 'achievementMotivation', 'selfCognition', 'socialEnergy',
  ];

  test('every supplementary schema has all required accuracy fields', () => {
    const valid = new Set(['high', 'mid-high', 'mid-low', 'low']);
    for (const schema of ALL_SCENARIO_SCHEMAS) {
      expect(typeof schema.id).toBe('string');
      expect(typeof schema.dimension).toBe('string');
      expect(typeof schema.reverse_scored).toBe('boolean');
      expect(typeof schema.attention_check).toBe('boolean');
      expect(Array.isArray(schema.confounders)).toBe(true);
      expect(schema.measurementIntent.length).toBeGreaterThan(3);
      expect(Object.keys(schema.expected_signal)).toHaveLength(4);
      for (const signal of Object.values(schema.expected_signal)) {
        expect(valid.has(signal as string)).toBe(true);
      }
    }
  });

  test('every core dimension has at least 3 total schemas', () => {
    for (const dim of CORE_DIMENSIONS) {
      const count = ALL_SCENARIO_SCHEMAS.filter((s) => s.dimension === dim).length;
      expect(count).toBeGreaterThanOrEqual(3);
    }
  });

  test('at least 2 schemas are reverse_scored across ALL_SCENARIO_SCHEMAS', () => {
    const count = ALL_SCENARIO_SCHEMAS.filter((s) => s.reverse_scored).length;
    expect(count).toBeGreaterThanOrEqual(2);
  });

  test('at least 1 schema is an attention_check across ALL_SCENARIO_SCHEMAS', () => {
    const count = ALL_SCENARIO_SCHEMAS.filter((s) => s.attention_check).length;
    expect(count).toBeGreaterThanOrEqual(1);
  });

  test('every schema id is unique', () => {
    const ids = ALL_SCENARIO_SCHEMAS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  test('vector_patch covers all four choices for every schema', () => {
    for (const schema of ALL_SCENARIO_SCHEMAS) {
      for (const choice of ['A', 'B', 'C', 'D'] as const) {
        expect(schema.vector_patch[choice]).toBeDefined();
      }
    }
  });
});

describe('dynamic micro-sandbox schema validation', () => {
  test('accepts a valid dynamic scenario payload', async () => {
    const llm = async () => JSON.stringify([
      {
        id: 'dyn-1',
        title: 'Pressure Scene',
        setup: 'A concrete high-pressure setup.',
        prompt: 'What do you do now?',
        options: {
          A: { text: 'A1', label: 'Aggressive', feedback: 'fb-a' },
          B: { text: 'B1', label: 'Defensive', feedback: 'fb-b' },
          C: { text: 'C1', label: 'Strategic', feedback: 'fb-c' },
          D: { text: 'D1', label: 'Avoidant', feedback: 'fb-d' },
        },
        vector_patch: {
          A: { conflict_score: 0.8 },
          B: { trust_threshold: 0.7 },
          C: { attachment_pattern: 'secure' },
          D: { stress_score: 0.6 },
        },
      },
    ]);

    const out = await generateDynamicScenarios(
      {
        trust_threshold: 0.5,
        boundary_strength: 0.5,
        conflict_style: 'analytical',
        conflict_score: 0.5,
        attachment_pattern: 'secure',
        attachment_score: 0.6,
        emotional_regulation: 'rational',
        stress_response: 'mindfulness',
        stress_score: 0.3,
        achievement_drive: 'flow_state',
        perfectionism_score: 0.5,
        selfview_pattern: 'growth_minded',
        growth_mindset_score: 0.6,
        social_energy_style: 'adaptive',
        social_energy_score: 0.5,
        openness_score: 0.5,
        stability_score: 0.6,
        neuroticism_score: 0.4,
        confidence: {
          trust: 0.6,
          conflict: 0.6,
          attachment: 0.6,
          emotion: 0.6,
          stress: 0.6,
          achievement: 0.6,
          selfview: 0.6,
          socialenergy: 0.6,
        },
      },
      [],
      llm,
      'zh-CN',
    );

    expect(out).toHaveLength(1);
    expect(out[0]?.vector_patch?.A?.conflict_score).toBe(0.8);
  });

  test('rejects invalid dynamic scenario payload', async () => {
    const llm = async () => JSON.stringify([
      {
        id: 'dyn-2',
        title: 'Bad Scene',
        setup: 'Missing vector patch fields',
        prompt: 'Choose one',
        options: {
          A: { text: 'A1', label: 'A', feedback: 'fa' },
          B: { text: 'B1', label: 'B', feedback: 'fb' },
          C: { text: 'C1', label: 'C', feedback: 'fc' },
          D: { text: 'D1', label: 'D', feedback: 'fd' },
        },
        vector_patch: {
          A: {},
          B: { unknown_key: 1 },
          C: { trust_threshold: 0.2 },
          D: { stress_score: 0.6 },
        },
      },
    ]);

    await expect(
      generateDynamicScenarios(
        {
          trust_threshold: 0.5,
          boundary_strength: 0.5,
          conflict_style: 'analytical',
          conflict_score: 0.5,
          attachment_pattern: 'secure',
          attachment_score: 0.6,
          emotional_regulation: 'rational',
          stress_response: 'mindfulness',
          stress_score: 0.3,
          achievement_drive: 'flow_state',
          perfectionism_score: 0.5,
          selfview_pattern: 'growth_minded',
          growth_mindset_score: 0.6,
          social_energy_style: 'adaptive',
          social_energy_score: 0.5,
          openness_score: 0.5,
          stability_score: 0.6,
          neuroticism_score: 0.4,
          confidence: {
            trust: 0.6,
            conflict: 0.6,
            attachment: 0.6,
            emotion: 0.6,
            stress: 0.6,
            achievement: 0.6,
            selfview: 0.6,
            socialenergy: 0.6,
          },
        },
        [],
        llm,
        'zh-CN',
      ),
    ).rejects.toThrow('LLM returned format error');
  });
});
