import { Injectable } from '@nestjs/common';
import { Database } from '../../common/database.js';
import { FORMAL_EVIDENCE_VIEW } from '../../common/formal-evidence.js';

@Injectable()
export class ObservationV1Service {
  constructor(private readonly db: Database) {}

  async list(userId: string) {
    const rows = await this.db.pool.query<{
      observation_id: string;
      revision_id: string;
      final_text: string | null;
      fallback_text: string | null;
      published_at: string | null;
      latest_response_action: string | null;
    }>(
      `SELECT o.id AS observation_id, r.id AS revision_id, r.final_text, r.fallback_text, r.published_at,
              latest_response.action AS latest_response_action
       FROM published_observations o
       JOIN published_observation_revisions r ON r.published_observation_id = o.id
       LEFT JOIN LATERAL (
         SELECT response.action FROM observation_responses response
         WHERE response.user_id = o.user_id AND response.published_observation_revision_id = r.id
         ORDER BY response.created_at DESC, response.id DESC LIMIT 1
       ) latest_response ON true
       WHERE o.user_id = $1
         AND r.id = o.current_revision_id
         AND r.candidate_id IS NOT NULL
         AND r.publication_status IN ('published', 'fallback')
         AND EXISTS (
           SELECT 1 FROM observation_claims claim
           JOIN observation_claim_evidence linked ON linked.claim_id = claim.id
           JOIN ${FORMAL_EVIDENCE_VIEW} formal ON formal.id = linked.evidence_event_id AND formal.user_id = o.user_id
           WHERE claim.candidate_id = r.candidate_id
         )
         AND NOT EXISTS (
           SELECT 1 FROM observation_claims claim
           LEFT JOIN observation_claim_evidence linked ON linked.claim_id = claim.id
           LEFT JOIN ${FORMAL_EVIDENCE_VIEW} formal ON formal.id = linked.evidence_event_id AND formal.user_id = o.user_id
           WHERE claim.candidate_id = r.candidate_id AND formal.id IS NULL
         )
       ORDER BY r.published_at DESC NULLS LAST, r.created_at DESC`,
      [userId],
    );
    return rows.rows.map((row) => ({
      observation_id: row.observation_id,
      revision_id: row.revision_id,
      text: row.final_text ?? row.fallback_text,
      published_at: row.published_at,
      feedback_state: row.latest_response_action && row.latest_response_action !== 'confirm'
        ? 'needs_follow_up' : 'uncontested',
    }));
  }

  async getRationale(userId: string, observationId: string, revisionId: string) {
    const claims = await this.db.pool.query<{
      claim_id: string;
      canonical_claim: Record<string, unknown>;
      limitations: unknown;
      linked_evidence: number;
      formal_evidence: number;
      latest_response_action: string | null;
    }>(
      `SELECT c.id AS claim_id,
              c.canonical_claim,
              c.limitations,
              latest_response.action AS latest_response_action,
              COUNT(linked.evidence_event_id)::int AS linked_evidence,
              COUNT(formal.id)::int AS formal_evidence
       FROM published_observations o
       JOIN published_observation_revisions r ON r.published_observation_id = o.id
       JOIN observation_candidates candidate ON candidate.id = r.candidate_id
       JOIN observation_claims c ON c.candidate_id = candidate.id
       LEFT JOIN LATERAL (
         SELECT response.action FROM observation_responses response
         WHERE response.user_id = o.user_id AND response.published_observation_revision_id = r.id
         ORDER BY response.created_at DESC, response.id DESC LIMIT 1
       ) latest_response ON true
       LEFT JOIN observation_claim_evidence linked ON linked.claim_id = c.id
       LEFT JOIN ${FORMAL_EVIDENCE_VIEW} formal ON formal.id = linked.evidence_event_id AND formal.user_id = o.user_id
       WHERE o.id = $1 AND r.id = $2 AND o.user_id = $3
         AND r.id = o.current_revision_id
         AND r.candidate_id IS NOT NULL
         AND r.publication_status IN ('published', 'fallback')
       GROUP BY c.id, c.canonical_claim, c.limitations, latest_response.action
       ORDER BY c.ordinal`,
      [observationId, revisionId, userId],
    );

    if (!claims.rows.length || claims.rows.some((claim) =>
      claim.linked_evidence === 0 || claim.linked_evidence !== claim.formal_evidence)) {
      return null;
    }
    return {
      observation_id: observationId,
      revision_id: revisionId,
      feedback_state: claims.rows[0].latest_response_action && claims.rows[0].latest_response_action !== 'confirm'
        ? 'needs_follow_up' : 'uncontested',
      claims: claims.rows.map((claim) => ({
        claim_id: claim.claim_id,
        canonical_claim: claim.canonical_claim,
        limitations: claim.limitations,
      })),
    };
  }
}
