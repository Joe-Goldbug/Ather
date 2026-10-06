// packages/core/src/evidence/index.ts
// Evidence layer — pure domain types and pure functions
// Database operations remain in backend (NestJS)

export type {
  WriteEvidenceParams,
  EvidenceEventRow,
  DimensionEvidenceSummary,
  EvidenceDimension,
} from './evidence-types.js';
export { isPortraitSemanticsComplete } from './evidence-semantics.js';
export type { EpistemicSource, EvidenceContentKind, SubjectAttribution, EvidenceSemantics } from './evidence-semantics.js';
export { computeUBVEvidenceEvents } from './evidence-compute.js';
export { computeAssessmentEvidenceEvents } from './assessment-evidence.js';
export {
  computeDiaryEvidenceEvents,
  PATTERN_DIMENSION_MAP,
  type DiaryEntryFields,
  type DiaryRealitySyncEventType,
} from './diary-evidence.js';
// 2-A 片段定位：句子切分 + 日记字段唯一还原实现
export { locateSentences, type TextSpan } from './text-locate.js';
export { buildDiaryEntryFields, normalizeDiaryEventType } from './diary-fields.js';
export { classifyAttribution, type EvidenceAttribution } from './attribution.js';
export { buildArchiveEntry, canonicalJson, verifyArchive, type ArchiveEntry } from './archive.js';
export type { EvidenceFragment, EvidenceAttribution as EvidenceAttributionType } from './evidence-types.js';

// Accuracy layer (V1 accuracy upgrade — 2026-05-06)
export {
  aggregateDimensionConfidence,
  aggregateAllDimensions,
  type DimensionAggregation,
} from './confidence-aggregator.js';
export {
  computeCorrectionSignals,
  applyCorrectionsToConfidence,
  type CorrectionRow,
  type CorrectionSignal,
} from './correction-analytics.js';
export {
  applyConfidenceDecay,
  applyDecayToAll,
  daysUntilHalfConfidence,
  DIMENSION_KIND_MAP,
} from './confidence-decay.js';
export {
  buildInsightCandidates,
  topLowConfidenceDimensions,
  type InsightDimensionInput,
  type InsightCandidate,
  type InsightCandidateLabel,
} from './insight-candidates.js';

// Evidence weight & frequency throttle (S1)
export {
  EVIDENCE_BASE_WEIGHT,
  resolveFrequencyWeight,
  type EvidenceKind,
  type FrequencyContext,
  type FrequencyIntent,
} from './evidence-weights.js';

// Four-factor confidence engine (S1)
export {
  computeDimensionConfidence,
  type ConfidenceFactors,
  type DimensionConfidenceResult,
  type ComputeConfidenceInput,
} from './confidence-engine.js';

// Correction candidate mechanism (S1)
export {
  buildCorrectionCandidate,
  evaluateCandidateVerification,
  type CorrectionInput,
  type CorrectionCandidate,
} from './correction-candidate.js';

// Capture pipeline (S1)
export {
  processCapture,
  captureToEvidenceKind,
  shouldEmitEvidence,
  MODALITY_WEIGHT,
  type ProcessMode,
  type Modality,
  type EntryType,
  type CaptureInput,
  type InterpretationResult,
  type CaptureProcessResult,
} from './capture-pipeline.js';

// Shift detection five-gate (S1)
export {
  detectShift,
  CONFIDENCE_THRESHOLD,
  RECENT_EVIDENCE_MIN,
  NO_CORRECTION_DAYS,
  RCI_THRESHOLD,
  SHIFT_MESSAGE,
  type ShiftGateInput,
  type ShiftDetectionResult,
} from './shift-detection.js';
