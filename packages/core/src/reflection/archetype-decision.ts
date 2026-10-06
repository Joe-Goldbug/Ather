// packages/core/src/reflection/archetype-decision.ts
// Archetype is code-determined, LLM can only explain it.

export type ArchetypeDecision = {
  archetype_id: string;
  archetype_label: string;
  score_rules: Array<{
    rule_id: string;
    matched: boolean;
    reason: string;
  }>;
};
