import { Injectable } from '@nestjs/common';
import { Database } from '../../common/database.js';
import { FORMAL_EVIDENCE_VIEW } from '../../common/formal-evidence.js';

export interface PortraitV1Response {
  model_status: 'unknown' | 'available';
  portrait_id: string | null;
  revision_id: string | null;
  portrait_state: 'unknown' | 'active' | 'quarantined';
  dimensions: Array<{
    dimension_key: string;
    layer: 'tendency' | 'state' | 'situational';
    status: 'unknown' | 'insufficient_evidence' | 'non_comparable' | 'available';
    context_key: Record<string, unknown>;
    limitation_codes: string[];
  }>;
  limitations: string[];
}

@Injectable()
export class PortraitV1Service {
  constructor(private readonly db: Database) {}

  async getCurrent(userId: string): Promise<PortraitV1Response> {
    const portraitResult = await this.db.pool.query<{
      id: string;
      current_revision_id: string | null;
      state: 'active' | 'quarantined' | 'deleted';
    }>(
      `SELECT id, current_revision_id, state
       FROM continuous_portraits
       WHERE user_id = $1
         AND (current_revision_id IS NULL OR NOT EXISTS (
           SELECT 1 FROM portrait_revision_evidence linked
           LEFT JOIN ${FORMAL_EVIDENCE_VIEW} eligible ON eligible.id = linked.evidence_event_id
           WHERE linked.portrait_revision_id = continuous_portraits.current_revision_id
             AND eligible.id IS NULL
         ))
       LIMIT 1`,
      [userId],
    );
    const portrait = portraitResult.rows[0];

    if (!portrait || !portrait.current_revision_id || portrait.state !== 'active') {
      return {
        model_status: 'unknown',
        portrait_id: portrait?.id ?? null,
        revision_id: portrait?.current_revision_id ?? null,
        portrait_state: portrait?.state === 'quarantined' ? 'quarantined' : 'unknown',
        dimensions: [],
        limitations: ['目前没有已批准的正式画像规则，因此无法判断长期模式。'],
      };
    }

    return this.buildRevisionResponse(portrait.id, portrait.current_revision_id, 'active');
  }

  private async buildRevisionResponse(
    portraitId: string,
    revisionId: string,
    portraitState: 'active' | 'quarantined',
  ): Promise<PortraitV1Response> {
    const states = await this.db.pool.query<{
      dimension_key: string;
      layer: 'tendency' | 'state' | 'situational';
      status: 'unknown' | 'insufficient_evidence' | 'non_comparable' | 'available';
      context_key: Record<string, unknown>;
      limitation_codes: string[];
    }>(
      `SELECT dimension_key, layer, status, context_key, limitation_codes
       FROM portrait_dimension_states
       WHERE portrait_revision_id = $1
       ORDER BY dimension_key, layer`,
      [revisionId],
    );

    const dimensions = states.rows;
    const hasAvailableDimension = dimensions.some((dimension) => dimension.status === 'available');
    return {
      model_status: hasAvailableDimension ? 'available' : 'unknown',
      portrait_id: portraitId,
      revision_id: revisionId,
      portrait_state: portraitState,
      dimensions,
      limitations: hasAvailableDimension
        ? []
        : ['目前没有已批准的正式画像规则，因此无法判断长期模式。'],
    };
  }

  async getRevision(userId: string, revisionId: string): Promise<PortraitV1Response | null> {
    const owned = await this.db.pool.query<{ portrait_id: string; state: 'active' | 'quarantined' | 'deleted' }>(
      `SELECT p.id AS portrait_id, p.state
       FROM portrait_revisions r
       JOIN continuous_portraits p ON p.id = r.portrait_id
       WHERE r.id = $1 AND p.user_id = $2 AND r.state <> 'invalidated'
         AND NOT EXISTS (
           SELECT 1 FROM portrait_revision_evidence linked
           LEFT JOIN ${FORMAL_EVIDENCE_VIEW} eligible ON eligible.id = linked.evidence_event_id
           WHERE linked.portrait_revision_id = r.id AND eligible.id IS NULL
         )
       LIMIT 1`,
      [revisionId, userId],
    );
    const portrait = owned.rows[0];
    if (!portrait || portrait.state === 'deleted') return null;
    return this.buildRevisionResponse(portrait.portrait_id, revisionId, portrait.state);
  }
}
