export * from './chat-engine.js';
export { buildChatPrompt, buildProbePrompt, buildExtendPrompt, buildCheckinPrompt,
  buildWeeklyReviewPrompt, buildEntityExtractionPrompt, buildPatternDetectionPrompt,
  buildRefutationPrompt, buildDynamicScriptPrompt, buildTimeCapsulePrompt } from './prompts.js';

// Calibration engine (S1) — attachment-test follow-up rounds
export {
  buildCalibrationRound,
  advanceCalibrationRound,
  isCalibrationComplete,
  MAX_CALIBRATION_FOLLOWUPS,
  MIN_CALIBRATION_FOLLOWUPS,
  type CalibrationFollowup,
  type CalibrationRound,
  type CalibrationRoundOptions,
} from './calibration-engine.js';
