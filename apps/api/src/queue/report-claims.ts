import { FORMAL_EVIDENCE_VIEW } from '../common/formal-evidence.js';

export interface ReportClaimRow {
  claim_id: string;
  revision_id: string;
  claim_text: string;
  evidence_ids: string[];
  counterevidence_ids: string[];
  limitations: string[] | null;
}

const REPORT_CLAIMS_SELECT = `
  SELECT c.id::text AS claim_id, revision.id::text AS revision_id,
         COALESCE(c.canonical_claim ->> 'text', c.canonical_claim ->> 'summary',
                  c.canonical_claim ->> 'observation', '一条已关联的记录') AS claim_text,
         array_agg(DISTINCT formal.id::text ORDER BY formal.id::text)
           FILTER (WHERE linked.role = 'support') AS evidence_ids,
         COALESCE(array_agg(DISTINCT formal.id::text ORDER BY formal.id::text)
           FILTER (WHERE linked.role = 'counterevidence'), ARRAY[]::text[]) AS counterevidence_ids,
         c.limitations
  FROM published_observations observation
  JOIN published_observation_revisions revision ON revision.id = observation.current_revision_id
  LEFT JOIN LATERAL (
    SELECT response.action FROM observation_responses response
    WHERE response.user_id = observation.user_id
      AND response.published_observation_revision_id = revision.id
    ORDER BY response.created_at DESC, response.id DESC LIMIT 1
  ) latest_response ON true
  JOIN observation_candidates candidate ON candidate.id = revision.candidate_id
  JOIN observation_claims c ON c.candidate_id = candidate.id
  LEFT JOIN observation_claim_evidence linked ON linked.claim_id = c.id
  LEFT JOIN ${FORMAL_EVIDENCE_VIEW} formal
    ON formal.id = linked.evidence_event_id AND formal.user_id = observation.user_id
  WHERE observation.user_id = $1 AND revision.publication_status IN ('published', 'fallback')
    AND (latest_response.action IS NULL OR latest_response.action = 'confirm')`;

const REPORT_CLAIMS_GROUPING = `
  GROUP BY c.id, revision.id, c.canonical_claim, c.limitations
  HAVING COUNT(linked.evidence_event_id) = COUNT(formal.id)
     AND COUNT(*) FILTER (WHERE linked.role = 'support') > 0
  ORDER BY c.id`;

export const REPORT_CLAIMS_QUERY = `${REPORT_CLAIMS_SELECT}${REPORT_CLAIMS_GROUPING} LIMIT 12`;

export const REPORT_SOURCE_CLAIMS_QUERY =
  `${REPORT_CLAIMS_SELECT} AND c.id = ANY($2::uuid[])${REPORT_CLAIMS_GROUPING}`;
