// packages/core/src/evidence/assessment-evidence.ts
// Pure functions — no DB, no network
// Generates evidence events from a completed assessment (ScriptResult)

import type { ScriptResult } from '../shared/types.js';
import type { WriteEvidenceParams, EvidenceDimension } from './evidence-types.js';
import { DIMENSION_KEYS } from '../assessment/constants.js';

// Mapping: which script choice triggered this dimension (for quote extraction)
const DIMENSION_SCENARIO_MAP: Record<string, string> = {
  trustBoundaries: 'trust',
  conflictResponse: 'conflict',
  attachment: 'attachment',
  emotionRegulation: 'emotion',
  stressResponse: 'stress',
  achievementMotivation: 'achievement',
  selfCognition: 'selfview',
  socialEnergy: 'socialenergy',
};

// Which ChoiceOption to reference for the dimension's representative choice
// We pick the choice with the largest vector_patch delta for this dimension
function getDimensionQuote(result: ScriptResult, dimension: string): string {
  const evidenceHit = result.evidence_log?.find((e) => e.dimensionId === dimension);
  if (evidenceHit) {
    return `${evidenceHit.scenarioId}:${evidenceHit.choice}`;
  }

  const scenarioId = DIMENSION_SCENARIO_MAP[dimension];
  if (!scenarioId) return '';

  const choice = result.choices.find((c) => c.scenarioId === scenarioId);
  if (!choice) return '';

  // Use the scenario id + choice as a compact quote identifier
  return `${scenarioId}:${choice.choice}`;
}

// Get confidence for a dimension from the script result
function getDimensionConfidence(result: ScriptResult, dimension: string): number {
  const evidenceHit = result.evidence_log?.find((e) => e.dimensionId === dimension);
  if (evidenceHit) {
    const expected = evidenceHit.expectedSignal;
    if (expected === 'high') return 0.85;
    if (expected === 'mid-high') return 0.7;
    if (expected === 'mid-low') return 0.55;
    return 0.4;
  }

  const scenarioId = DIMENSION_SCENARIO_MAP[dimension];
  if (!scenarioId || !result.vector.confidence) return 0.3;

  const confidenceMap: Record<string, keyof typeof result.vector.confidence> = {
    trustBoundaries: 'trust',
    conflictResponse: 'conflict',
    attachment: 'attachment',
    emotionRegulation: 'emotion',
    stressResponse: 'stress',
    achievementMotivation: 'achievement',
    selfCognition: 'selfview',
    socialEnergy: 'socialenergy',
  };

  const key = confidenceMap[dimension];
  if (!key) return 0.3;
  return result.vector.confidence?.[key] ?? 0.3;
}

// Compute delta for a dimension from the script vector
// Returns null if the dimension is not directly measured by the script
function getDimensionDelta(result: ScriptResult, dimension: string): number | null {
  const evidenceHit = result.evidence_log?.find((e) => e.dimensionId === dimension);
  if (evidenceHit) {
    const patch = evidenceHit.vectorPatch as Record<string, unknown>;
    const value = patch[dimension === 'trustBoundaries'
      ? 'trust_threshold'
      : dimension === 'conflictResponse'
        ? 'conflict_score'
        : dimension === 'attachment'
          ? 'attachment_score'
          : dimension === 'emotionRegulation'
            ? 'emotional_regulation'
            : dimension === 'stressResponse'
              ? 'stress_score'
              : dimension === 'achievementMotivation'
                ? 'perfectionism_score'
                : dimension === 'selfCognition'
                  ? 'growth_mindset_score'
                  : dimension === 'socialEnergy'
                    ? 'social_energy_score'
                    : ''];
    if (typeof value === 'number') {
      const raw = value <= 1 ? value * 100 : value;
      return Math.round(raw - 50);
    }
  }

  const v = result.vector;
  let raw: number | null = null;

  switch (dimension) {
    case 'trustBoundaries':
      // trust_threshold: 0=open, 1=guarded → invert: high trust → high value
      raw = (1 - v.trust_threshold) * 100;
      break;
    case 'conflictResponse':
      // conflict_score: 0-1
      raw = v.conflict_score * 100;
      break;
    case 'attachment':
      // attachment_score: 0=low security, 1=high
      raw = v.attachment_score * 100;
      break;
    case 'emotionRegulation': {
      // Categorical → numeric
      const map: Record<string, number> = { internalizing: 30, externalizing: 60, rational: 70, deflecting: 40 };
      raw = map[v.emotional_regulation] ?? 50;
      break;
    }
    case 'stressResponse': {
      // Blend behavioral score (0.6) + categorical pattern (0.4)
      const stressMap: Record<string, number> = { rumination: 30, activation: 60, suppression: 40, mindfulness: 75 };
      const patternVal = stressMap[v.stress_response] ?? 50;
      raw = v.stress_score * 100 * 0.6 + patternVal * 0.4;
      break;
    }
    case 'achievementMotivation':
      // achievement_drive: categorical
      const achieveMap: Record<string, number> = { high_standards: 80, recognition_seeking: 65, avoidance: 35, flow_state: 60 };
      raw = achieveMap[v.achievement_drive] ?? 50;
      break;
    case 'selfCognition':
      // growth_mindset_score → selfCognition proxy
      raw = v.growth_mindset_score * 100;
      break;
    case 'socialEnergy':
      // social_energy_score: 0-1
      raw = v.social_energy_score * 100;
      break;
    default:
      return null;
  }

  if (raw === null) return null;
  return Math.round(raw - 50); // delta from baseline 50
}

/**
 * Compute evidence events from a completed assessment.
 * Each dimension that is directly measured by the script generates one evidence event.
 *
 * Evidence weight is high (0.8) because assessment is the most structured
 * and intentional data source — more reliable than chat or diary.
 *
 * @param userId          User id
 * @param assessmentRunId Assessment run id (written to sourceId)
 * @param result          Completed ScriptResult from the script engine
 * @param locale          Locale of the assessment (for explanation text)
 */
export function computeAssessmentEvidenceEvents(
  userId: string,
  assessmentRunId: string,
  result: ScriptResult,
  locale: string = 'zh-CN',
): WriteEvidenceParams[] {
  const events: WriteEvidenceParams[] = [];

  for (const dim of DIMENSION_KEYS) {
    const delta = getDimensionDelta(result, dim as EvidenceDimension);
    if (delta === null) continue; // Not directly measured by script

    const confidence = getDimensionConfidence(result, dim as EvidenceDimension);
    const rawValue = 50 + delta;
    const weight = 0.8; // High weight: assessment is structured evidence
    const quote = getDimensionQuote(result, dim);

    const explanation = buildExplanation(dim, rawValue, delta, confidence, locale);

    events.push({
      userId,
      sourceType: 'test',
      sourceId: assessmentRunId,
      dimension: dim as EvidenceDimension,
      delta,
      weight,
      confidence,
      quote,
      explanation,
    });
  }

  return events;
}

/**
 * Build a human-readable explanation for an assessment evidence event.
 */
function buildExplanation(
  dimension: string,
  rawValue: number,
  delta: number,
  confidence: number,
  locale: string,
): string {
  const direction = delta >= 0 ? '偏高' : '偏低';
  const dimLabels: Record<string, Record<string, string>> = {
    'zh-CN': {
      trustBoundaries:       '对人的信任度',
      conflictResponse:      '遇到冲突的反应',
      attachment:            '跟别人的亲近感',
      emotionRegulation:     '管理情绪的方式',
      stressResponse:        '压力下的状态',
      achievementMotivation: '做事的动力',
      selfCognition:         '了解自己的程度',
      socialEnergy:          '和人相处的能量',
      emotionalGranularity:  '感受情绪的细腻程度',
      shameSensitivity:      '被否定时的感受',
      helpSeekingPattern:    '遇到困难会不会求助',
      linguisticExtraversion:'说话的表达方式',
      narrativeCoherence:    '讲故事的连贯程度',
      growthOrientation:     '想要改变的意愿',
    },
    en: {
      trustBoundaries: 'Trust Boundaries',
      conflictResponse: 'Conflict Response',
      attachment: 'Attachment',
      emotionRegulation: 'Emotion Regulation',
      stressResponse: 'Stress Response',
      achievementMotivation: 'Achievement Motivation',
      selfCognition: 'Self-Cognition',
      socialEnergy: 'Social Energy',
      emotionalGranularity: 'Emotional Granularity',
      shameSensitivity: 'Shame Sensitivity',
      helpSeekingPattern: 'Help-Seeking Pattern',
      linguisticExtraversion: 'Linguistic Extraversion',
      narrativeCoherence: 'Narrative Coherence',
      growthOrientation: 'Growth Orientation',
    },
    ja: {
      trustBoundaries: '信頼境界',
      conflictResponse: '対立反応',
      attachment: '愛着',
      emotionRegulation: '感情調整',
      stressResponse: 'ストレス対応',
      achievementMotivation: '達成動機',
      selfCognition: '自己認識',
      socialEnergy: 'ソーシャルエネルギー',
    },
    es: {
      trustBoundaries: 'Frontera de Confianza',
      conflictResponse: 'Respuesta al Conflicto',
      attachment: 'Apego',
      emotionRegulation: 'Regulación Emocional',
      stressResponse: 'Respuesta al Estrés',
      achievementMotivation: 'Motivación de Logro',
      selfCognition: 'Autoconocimiento',
      socialEnergy: 'Energía Social',
    },
  };

  const labels = dimLabels[locale] ?? dimLabels['en'];
  const dimLabel = labels[dimension] ?? dimension;
  const confidencePct = Math.round(confidence * 100);

  if (locale === 'zh-CN') {
    return `${dimLabel}评分${rawValue}分（${direction}，偏离基线${Math.abs(delta)}分），测量置信度${confidencePct}%，来源于情境测试`;
  }

  return `${dimLabel}: ${rawValue}/100 (${direction}, delta ${delta} from baseline), confidence ${confidencePct}%, from structured assessment`;
}
