export interface PortraitEvidenceItem {
  id: string;
  sourceType: string;
  evidenceKind: string;
  quote: string | null;
  explanation: string;
  createdAt: string;
}

export interface PortraitObservation {
  id: string;
  dimension: string;
  status: 'insufficient_evidence';
  evidence: PortraitEvidenceItem[];
  limitation: '目前无法判断长期模式。';
}

/**
 * The current scientific approval register does not authorize stable trait
 * claims or numeric thresholds. Keep the browser contract evidence-first and
 * explicitly bounded until those parameters are approved.
 */
export function buildPortraitObservations(
  evidenceByDimension: Record<string, PortraitEvidenceItem[]>,
): PortraitObservation[] {
  return Object.entries(evidenceByDimension)
    .filter(([, evidence]) => evidence.length > 0)
    .map(([dimension, evidence]) => ({
      id: `observation:${dimension}:${evidence.map((item) => item.id).join(',')}`,
      dimension,
      status: 'insufficient_evidence' as const,
      evidence,
      limitation: '目前无法判断长期模式。' as const,
    }));
}
