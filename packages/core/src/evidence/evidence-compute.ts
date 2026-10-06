// packages/core/src/evidence/evidence-compute.ts
// Pure functions for computing evidence events from UBV deltas
// No DB, no network — just domain math

import type { UBV } from '../shared/types.js';
import type { WriteEvidenceParams, EvidenceDimension } from './evidence-types.js';

const DELTA_THRESHOLD = 3; // only record |delta| >= 3 to avoid noise

const DIMENSIONS: EvidenceDimension[] = [
  'trustBoundaries',
  'conflictResponse',
  'attachment',
  'emotionRegulation',
  'stressResponse',
  'achievementMotivation',
  'selfCognition',
  'socialEnergy',
  'emotionalGranularity',
  'shameSensitivity',
  'helpSeekingPattern',
  'linguisticExtraversion',
  'narrativeCoherence',
  'growthOrientation',
];

/**
 * Compute evidence events from old/new UBV comparison.
 * Pure function — caller handles DB writes.
 *
 * @param userId      user id
 * @param messageId   source message id
 * @param oldUBV      UBV before this turn
 * @param newUBV      UBV after this turn
 * @param userMessage raw user message (for quote field, max 200 chars)
 */
export function computeUBVEvidenceEvents(
  userId: string,
  messageId: string,
  oldUBV: UBV,
  newUBV: UBV,
  userMessage: string,
): WriteEvidenceParams[] {
  const events: WriteEvidenceParams[] = [];

  for (const dim of DIMENSIONS) {
    const oldVal = (oldUBV[dim as keyof UBV] as { value?: number } | undefined)?.value ?? 50;
    const newVal = (newUBV[dim as keyof UBV] as { value?: number } | undefined)?.value ?? 50;
    const delta = Math.round(newVal - oldVal);

    if (Math.abs(delta) < DELTA_THRESHOLD) continue;

    const newConfidence = (newUBV[dim as keyof UBV] as { confidence?: number } | undefined)?.confidence ?? 0.5;
    const evidenceCount = (newUBV[dim as keyof UBV] as { evidence_count?: number } | undefined)?.evidence_count ?? 0;
    // weight: higher evidence_count → higher weight, clamped to [0, 1]
    const weight = Math.min(1.0, 0.3 + evidenceCount * 0.05);

    events.push({
      userId,
      sourceType: 'chat',
      sourceId: messageId,
      dimension: dim,
      delta,
      weight,
      confidence: newConfidence,
      quote: userMessage.slice(0, 200),
      explanation: `${dim} 从 ${oldVal} 变为 ${newVal}（delta: ${delta}），置信度 ${Math.round(newConfidence * 100)}%`,
    });
  }

  return events;
}

