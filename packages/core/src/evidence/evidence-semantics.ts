export type EpistemicSource = 'unknown' | 'user_self_report' | 'system_interaction' | 'authorized_external_record';
export type EvidenceContentKind = 'unknown' | 'self_description' | 'recalled_event' | 'stated_intention' | 'simulation_choice' | 'product_action' | 'user_correction';
export type SubjectAttribution = 'self' | 'about_other' | 'hypothetical' | 'quoted' | 'mixed' | 'unknown';

export interface EvidenceSemantics {
  epistemic_source: EpistemicSource;
  content_kind: EvidenceContentKind;
  source_independence_group: string;
  attribution: SubjectAttribution;
}

export function isPortraitSemanticsComplete(value: EvidenceSemantics): boolean {
  return value.epistemic_source !== 'unknown'
    && ['self_description', 'recalled_event', 'product_action'].includes(value.content_kind)
    && value.source_independence_group.trim().length > 0
    && value.attribution === 'self';
}
