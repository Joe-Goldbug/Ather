// packages/core/src/reflection/validation-gate.ts
// LLM output validation gate — prevents overreach, fabrication, and overconfidence.

import type { LLMExplanationContract } from './llm-explanation-contract.js';
import {
  ALLOWED_NEXT_ACTIONS_FREE,
  ALLOWED_NEXT_ACTIONS_PAID,
  type NextStepActionType,
} from './llm-explanation-contract.js';
import { CORE_DIMENSION_KEYS } from './constants.js';

export type ValidationErrorCode =
  | 'schema_invalid'
  | 'unknown_dimension'
  | 'invented_fact'
  | 'overconfident_claim'
  | 'diagnostic_language'
  | 'unauthorized_next_action'
  | 'archetype_changed_by_llm';

export type ValidationError = {
  code: ValidationErrorCode;
  message: string;
};

export type ValidationGateResult = {
  ok: boolean;
  errors: ValidationError[];
};

export type ValidationGateInput = {
  allowed_dimensions: string[];
  user_tier: 'guest' | 'registered_free' | 'paid';
  allowed_archetype_id?: string;
  confidence_by_dim: Record<string, number>;
};

const LOW_CONFIDENCE_THRESHOLD = 0.45;

const OVERCONFIDENT_PATTERNS = [
  /确定/,
  /绝对/,
  /毫无疑问/,
  /已经证明/,
  /可以断定/,
  /必然是/,
  /一定是/,
  /肯定是/,
  /无疑是/,
  /definitely/i,
  /certainly/i,
  /undoubtedly/i,
  /proven/i,
  /without\s+doubt/i,
  /absolutely/i,
];

const DIAGNOSTIC_PATTERNS: Array<{ name: string; pattern: RegExp }> = [
  { name: 'chinese-type', pattern: /你是[^。.!！?\n]*型/ },
  {
    name: 'chinese-disorder',
    pattern: /你有[^。.!！?\n]*(障碍|缺失|缺陷|疾病|症)/,
  },
  { name: 'personality-disorder', pattern: /人格障碍/ },
  { name: 'mental-illness', pattern: /心理疾病/ },
  { name: 'mental-issue', pattern: /精神问题/ },
  { name: 'pathological', pattern: /病态/ },
  { name: 'english-have-a', pattern: /you\s+(have|are)\s+a\s+/i },
  { name: 'english-disorder', pattern: /personality\s+disorder/i },
  { name: 'english-mental', pattern: /mental\s+illness/i },
  { name: 'english-suffer', pattern: /you\s+suffer\s+from/i },
];

const FABRICATED_EVENT_PATTERNS: Array<{ name: string; pattern: RegExp }> = [
  { name: 'that-day', pattern: /那天/ },
  { name: 'last-time-when', pattern: /上次[^，,\s]*的时候/ },
  { name: 'you-once-was', pattern: /你曾经[^是]/ },
  { name: 'earlier-happened', pattern: /之前.*发生[^了]/ },
  { name: 'you-fought-with', pattern: /你跟.*吵架/ },
  { name: 'you-disputed', pattern: /你和.*争执/ },
  { name: 'you-last-not', pattern: /你上次[^的]/ },
  { name: 'you-encountered', pattern: /你遇到[^了]/ },
  { name: 'you-experienced', pattern: /你经历[^了]/ },
];

const GUEST_ALLOWED_ACTIONS: ReadonlySet<NextStepActionType> = new Set([
  'next_test',
  'profile_view',
]);

function collectDimensionRefs(
  expl: LLMExplanationContract,
): Set<string> {
  const refs = new Set<string>();
  for (const d of expl.changed_dimensions) {
    refs.add(d.dimension);
  }
  for (const d of expl.stable_dimensions) {
    refs.add(d.dimension);
  }
  for (const d of expl.uncertainty_notes) {
    refs.add(d.dimension);
  }
  return refs;
}

function checkSchema(expl: LLMExplanationContract): ValidationError[] {
  const errors: ValidationError[] = [];

  if (!expl.headline || expl.headline.trim().length === 0) {
    errors.push({
      code: 'schema_invalid',
      message: 'headline is empty',
    });
  }

  if (!expl.summary || expl.summary.trim().length === 0) {
    errors.push({
      code: 'schema_invalid',
      message: 'summary is empty',
    });
  }

  return errors;
}

function checkDimensions(
  expl: LLMExplanationContract,
  allowed: string[],
): ValidationError[] {
  const errors: ValidationError[] = [];
  const allowedSet = new Set(allowed);
  const refs = collectDimensionRefs(expl);

  for (const dim of refs) {
    if (!allowedSet.has(dim)) {
      errors.push({
        code: 'unknown_dimension',
        message: `LLM referenced dimension "${dim}" which is not in the allowed set`,
      });
    }
  }

  return errors;
}

function checkOverconfidence(
  expl: LLMExplanationContract,
  confidenceByDim: Record<string, number>,
): ValidationError[] {
  const errors: ValidationError[] = [];

  for (const dim of expl.changed_dimensions) {
    const conf = confidenceByDim[dim.dimension] ?? 1.0;
    if (conf >= LOW_CONFIDENCE_THRESHOLD) continue;

    // FIX BUG-4: dedupe per dimension — at most one overconfident_claim
    // error per changed dimension, even if both confidence_phrase and
    // explanation trigger the pattern.
    const hasOverconfidentInPhrase = OVERCONFIDENT_PATTERNS.some((p) =>
      p.test(dim.confidence_phrase),
    );
    const hasOverconfidentInExplanation = OVERCONFIDENT_PATTERNS.some((p) =>
      p.test(dim.explanation),
    );

    if (hasOverconfidentInPhrase || hasOverconfidentInExplanation) {
      errors.push({
        code: 'overconfident_claim',
        message: `Dimension "${dim.dimension}" has confidence ${conf} (< ${LOW_CONFIDENCE_THRESHOLD}) but uses overconfident language in ${
          hasOverconfidentInPhrase ? 'confidence_phrase' : 'explanation'
        }`,
      });
    }
  }

  return errors;
}

function checkDiagnostic(expl: LLMExplanationContract): ValidationError[] {
  const errors: ValidationError[] = [];
  const fields: Array<{ value: string; field: string }> = [
    { value: expl.headline, field: 'headline' },
    { value: expl.summary, field: 'summary' },
  ];

  for (const dim of expl.changed_dimensions) {
    fields.push({ value: dim.explanation, field: `changed.${dim.dimension}.explanation` });
    fields.push({ value: dim.change_label, field: `changed.${dim.dimension}.change_label` });
    fields.push({ value: dim.confidence_phrase, field: `changed.${dim.dimension}.confidence_phrase` });
  }
  for (const dim of expl.stable_dimensions) {
    fields.push({ value: dim.explanation, field: `stable.${dim.dimension}.explanation` });
  }
  for (const dim of expl.uncertainty_notes) {
    fields.push({ value: dim.note, field: `uncertain.${dim.dimension}.note` });
  }

  // FIX BUG-3: report ALL matching patterns, not just the first.
  for (const { value, field } of fields) {
    if (!value) continue;
    for (const { name, pattern } of DIAGNOSTIC_PATTERNS) {
      if (pattern.test(value)) {
        errors.push({
          code: 'diagnostic_language',
          message: `Field "${field}" contains diagnostic/medical language (${name}): "${value.slice(0, 80)}"`,
        });
      }
    }
  }

  return errors;
}

function checkInventedFacts(expl: LLMExplanationContract): ValidationError[] {
  const errors: ValidationError[] = [];
  const fields: Array<{ value: string; field: string }> = [];

  for (const dim of expl.changed_dimensions) {
    fields.push({ value: dim.explanation, field: `changed.${dim.dimension}.explanation` });
  }
  for (const dim of expl.stable_dimensions) {
    fields.push({ value: dim.explanation, field: `stable.${dim.dimension}.explanation` });
  }

  for (const { value, field } of fields) {
    if (!value) continue;
    for (const { name, pattern } of FABRICATED_EVENT_PATTERNS) {
      if (pattern.test(value)) {
        errors.push({
          code: 'invented_fact',
          message: `Field "${field}" references user events not in evidence (${name}): "${value.slice(0, 80)}"`,
        });
      }
    }
  }

  return errors;
}

function checkNextAction(
  expl: LLMExplanationContract,
  tier: ValidationGateInput['user_tier'],
): ValidationError[] {
  const errors: ValidationError[] = [];
  const action = expl.next_step.action_type;
  let allowed: ReadonlySet<NextStepActionType>;

  if (tier === 'paid') {
    allowed = ALLOWED_NEXT_ACTIONS_PAID;
  } else if (tier === 'guest') {
    allowed = GUEST_ALLOWED_ACTIONS;
  } else {
    allowed = ALLOWED_NEXT_ACTIONS_FREE;
  }

  if (!allowed.has(action)) {
    errors.push({
      code: 'unauthorized_next_action',
      message: `User tier "${tier}" cannot use action "${action}"`,
    });
  }

  return errors;
}

export function validateLLMExplanation(
  explanation: LLMExplanationContract,
  input: ValidationGateInput,
): ValidationGateResult {
  const errors: ValidationError[] = [];

  errors.push(...checkSchema(explanation));
  errors.push(
    ...checkDimensions(explanation, input.allowed_dimensions),
  );
  errors.push(
    ...checkOverconfidence(explanation, input.confidence_by_dim),
  );
  errors.push(...checkDiagnostic(explanation));
  errors.push(...checkInventedFacts(explanation));
  errors.push(...checkNextAction(explanation, input.user_tier));

  return {
    ok: errors.length === 0,
    errors,
  };
}
