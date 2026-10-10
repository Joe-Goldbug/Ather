export type UnderstandingAction = 'message' | 'correction' | 'summarize' | 'skip';

export type UnderstandingSourceRef =
  | { kind: 'theme_result'; round_id: string; result_revision_id: string; observation_id: string; feedback_ids: string[] }
  | { kind: 'dynamic_result'; generation_id: string; script_id: string; observation_id: string; playback_hash: string }
  | { kind: 'free_entry' };

export type UnderstandingEvidence = {
  id: string;
  kind: 'simulation_context' | 'simulation_choice' | 'user_statement';
  text: string;
};

export type UnderstandingCitation = { source_id: string; quote: string };
export type UnderstandingParagraph = { text: string; evidence: UnderstandingCitation[] };

export type UnderstandingOutput =
  | { kind: 'question' | 'refocus' | 'safety'; text: string }
  | {
    kind: 'understanding';
    reaction: UnderstandingParagraph;
    possible_meaning: UnderstandingParagraph | null;
    uncertainty: string;
    change: { prior_turn_id: string; text: string; evidence: UnderstandingCitation[] } | null;
  };

const BANNED_ASSERTIONS = /回避型人格|讨好型人格|人格类型|你天生|你总是|永远|一定会|诊断为|潜意识/i;

function invalid(): never {
  throw new Error('invalid_understanding_output');
}

function validText(value: unknown, min: number, max: number): value is string {
  return typeof value === 'string' && value.trim().length >= min && value.trim().length <= max;
}

function validateCitations(value: unknown, sources: Map<string, string>, required: boolean): asserts value is UnderstandingCitation[] {
  if (!Array.isArray(value) || (required && value.length === 0) || value.length > 6) invalid();
  for (const citation of value) {
    if (!citation || !validText(citation.source_id, 1, 200) || !validText(citation.quote, 1, 500)) invalid();
    if (!sources.get(citation.source_id)?.includes(citation.quote)) invalid();
  }
}

function validateParagraph(value: unknown, sources: Map<string, string>): asserts value is UnderstandingParagraph {
  if (!value || typeof value !== 'object') invalid();
  const paragraph = value as UnderstandingParagraph;
  if (!validText(paragraph.text, 1, 450) || BANNED_ASSERTIONS.test(paragraph.text)) invalid();
  validateCitations(paragraph.evidence, sources, true);
}

export function validateUnderstandingOutput(
  value: unknown,
  evidence: UnderstandingEvidence[],
  action: UnderstandingAction,
  correctedTurnId?: string,
): UnderstandingOutput {
  if (!value || typeof value !== 'object' || !Array.isArray(evidence)) invalid();
  const output = value as UnderstandingOutput;
  const sources = new Map(evidence.map((item) => [item.id, item.text]));
  if (output.kind === 'question' || output.kind === 'refocus' || output.kind === 'safety') {
    if (!validText(output.text, 1, 240)) invalid();
    return { kind: output.kind, text: output.text.trim() };
  }
  if (output.kind !== 'understanding') invalid();
  validateParagraph(output.reaction, sources);
  if (output.possible_meaning !== null) validateParagraph(output.possible_meaning, sources);
  if (!validText(output.uncertainty, 1, 300)) invalid();
  if (output.change !== null) {
    if (!validText(output.change.prior_turn_id, 1, 200) || !validText(output.change.text, 1, 450)) invalid();
    validateCitations(output.change.evidence, sources, true);
  }
  if (action === 'correction') {
    if (!correctedTurnId || output.change === null || output.change.prior_turn_id !== correctedTurnId) invalid();
  }
  return output;
}
