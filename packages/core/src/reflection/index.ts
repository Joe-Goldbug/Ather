// packages/core/src/reflection/index.ts
// Reflection Funnel — public API surface

export * from './question-contract.js';
export * from './evidence-contract.js';
export * from './profile-delta-contract.js';
export * from './llm-explanation-contract.js';
export * from './archetype-decision.js';
export * from './constants.js';
export * from './understanding.js';

export {
  validateLLMExplanation,
  type ValidationGateResult,
  type ValidationGateInput,
  type ValidationError,
  type ValidationErrorCode,
} from './validation-gate.js';

export {
  validateQuestionContract,
  type QuestionValidationResult,
  type QuestionValidationError,
  type QuestionValidationErrorCode,
} from './validate-question.js';

export {
  decideNextQuestion,
  safeQuestionKind,
  type RouterDecision,
  type RouterReason,
  type RouterInput,
  type RouterInputDimension,
  type QuestionKind,
  type UserTier,
} from './next-question-router.js';

export {
  scenarioToContract,
  answerToEvidence,
  computeProfileDelta,
  extractPrimaryNumericDelta,
  dimensionDirection,
  type CopyLookup,
} from './scenario-bridge.js';

export {
  buildProfileDeltaContract,
  type BuildProfileDeltaInput,
} from './profile-delta-builder.js';
