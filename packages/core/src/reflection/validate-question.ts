// packages/core/src/reflection/validate-question.ts
// Dynamic question validation — ensures LLM-generated questions are safe.

import type { QuestionContract } from './question-contract.js';
import { VALID_VECTOR_PATCH_KEYS } from './constants.js';

export type QuestionValidationErrorCode =
  | 'unauthorized_question_source'
  | 'unauthorized_evidence_kind'
  | 'missing_vector_patch'
  | 'invalid_vector_patch_key'
  | 'invalid_option_count'
  | 'missing_target_dimension'
  | 'diagnostic_question_content';

export type QuestionValidationError = {
  code: QuestionValidationErrorCode;
  message: string;
};

export type QuestionValidationResult = {
  valid: boolean;
  errors: QuestionValidationError[];
};

const FREE_FORBIDDEN_SOURCES: ReadonlySet<string> = new Set([
  'calibration',
]);

const DIAGNOSTIC_QUESTION_PATTERNS = [
  /障碍/,
  /疾病/,
  /症状/,
  /创伤/,
  /自杀/,
  /自残/,
  /disorder/i,
  /trauma/i,
  /suicide/i,
];

export function validateQuestionContract(
  question: QuestionContract,
  userTier: 'guest' | 'registered_free' | 'paid',
): QuestionValidationResult {
  const errors: QuestionValidationError[] = [];

  // Check source authorization
  if (userTier !== 'paid' && FREE_FORBIDDEN_SOURCES.has(question.source)) {
    errors.push({
      code: 'unauthorized_question_source',
      message: `Source "${question.source}" requires paid tier, but user is "${userTier}"`,
    });
  }

  // Check evidence_kind authorization (separate from source)
  if (userTier !== 'paid' && question.evidence_kind === 'calibration') {
    errors.push({
      code: 'unauthorized_evidence_kind',
      message: `Evidence kind "calibration" requires paid tier, but user is "${userTier}"`,
    });
  }

  // Check target_dimension present
  if (!question.target_dimension || question.target_dimension.trim().length === 0) {
    errors.push({
      code: 'missing_target_dimension',
      message: 'Question must have a non-empty target_dimension',
    });
  }

  // Check option count
  if (!question.options || question.options.length !== 4) {
    errors.push({
      code: 'invalid_option_count',
      message: `Expected exactly 4 options, got ${question.options?.length ?? 0}`,
    });
  }

  // Check each option has vector_patch with at least one entry
  for (const opt of question.options) {
    if (!opt.vector_patch || Object.keys(opt.vector_patch).length === 0) {
      errors.push({
        code: 'missing_vector_patch',
        message: `Option "${opt.id}" has no vector_patch entries`,
      });
      continue;
    }

    // Check vector_patch keys are in whitelist
    for (const key of Object.keys(opt.vector_patch)) {
      if (!VALID_VECTOR_PATCH_KEYS.has(key)) {
        errors.push({
          code: 'invalid_vector_patch_key',
          message: `Option "${opt.id}" vector_patch key "${key}" is not in the allowed whitelist`,
        });
      }
    }
  }

  // Check for diagnostic question content
  for (const pattern of DIAGNOSTIC_QUESTION_PATTERNS) {
    if (pattern.test(question.prompt)) {
      errors.push({
        code: 'diagnostic_question_content',
        message: `Question prompt contains diagnostic/medical language: "${question.prompt.slice(0, 80)}"`,
      });
    }
  }

  return { valid: errors.length === 0, errors };
}
