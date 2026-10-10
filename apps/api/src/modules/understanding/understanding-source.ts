import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { UnderstandingEvidence, UnderstandingSourceRef } from '@eva/core';
import { createHash } from 'node:crypto';
import { Database } from '../../common/database.js';
import { buildDynamicResult } from '../assessment/services/micro-sandbox/dynamic-result.js';

type ThemeResult = {
  observations?: Array<{ focus?: string; text?: string; evidence_question_id?: string }>;
  evidence?: Array<{ question_id?: string; focus_label?: string; context_label?: string; choice_text?: string }>;
};

export type UnderstandingSourceSnapshot = {
  source_kind: 'theme_result' | 'dynamic_result' | 'free_entry';
  observation_text: string | null;
  observation_focus: string | null;
  result_revision_id?: string;
  round_id?: string;
};

export type ResolvedUnderstandingSource = {
  sourceRef: UnderstandingSourceRef;
  snapshot: UnderstandingSourceSnapshot;
  evidence: UnderstandingEvidence[];
};

@Injectable()
export class UnderstandingSourceService {
  constructor(private readonly db: Database) {}

  async resolve(userId: string, sourceRef: UnderstandingSourceRef): Promise<ResolvedUnderstandingSource> {
    if (sourceRef.kind === 'free_entry') {
      return {
        sourceRef,
        snapshot: { source_kind: 'free_entry', observation_text: null, observation_focus: null },
        evidence: [],
      };
    }
    if (sourceRef.kind !== 'theme_result') {
      if (sourceRef.kind !== 'dynamic_result') throw new BadRequestException({ code: 'unsupported_source' });
      return this.resolveDynamic(userId, sourceRef);
    }
    const rows = await this.db.pool.query<{ result: ThemeResult }>(
      `SELECT revision.result
         FROM theme_assessment_result_revisions revision
         JOIN theme_assessment_rounds round ON round.id = revision.round_id
        WHERE round.id = $1 AND revision.id = $2 AND round.user_id = $3
          AND revision.invalidated_at IS NULL`,
      [sourceRef.round_id, sourceRef.result_revision_id, userId],
    );
    const result = rows.rows[0]?.result;
    const observation = result?.observations?.find((item) => item.evidence_question_id === sourceRef.observation_id);
    const selectedEvidence = result?.evidence?.filter((item) => item.question_id === sourceRef.observation_id) ?? [];
    if (!observation?.text || selectedEvidence.length === 0) {
      throw new NotFoundException({ code: 'source_not_found' });
    }
    const evidence: UnderstandingEvidence[] = [];
    for (const item of selectedEvidence) {
      if (item.context_label?.trim()) {
        evidence.push({
          id: `theme:${sourceRef.result_revision_id}:${sourceRef.observation_id}:context`,
          kind: 'simulation_context', text: item.context_label.trim(),
        });
      }
      if (item.choice_text?.trim()) {
        evidence.push({
          id: `theme:${sourceRef.result_revision_id}:${sourceRef.observation_id}:choice`,
          kind: 'simulation_choice', text: item.choice_text.trim(),
        });
      }
    }
    if (evidence.length === 0) throw new NotFoundException({ code: 'source_not_found' });

    if (sourceRef.feedback_ids.length > 0) {
      const feedback = await this.db.pool.query<{ id: string; explanation: string | null }>(
        `SELECT id, explanation
           FROM theme_assessment_result_responses
          WHERE id = ANY($1::uuid[]) AND result_revision_id = $2 AND user_id = $3
            AND evidence_question_id = $4`,
        [sourceRef.feedback_ids, sourceRef.result_revision_id, userId, sourceRef.observation_id],
      );
      if (feedback.rows.length !== new Set(sourceRef.feedback_ids).size) {
        throw new NotFoundException({ code: 'source_not_found' });
      }
      for (const entry of feedback.rows) {
        if (entry.explanation?.trim()) {
          evidence.push({ id: `feedback:${entry.id}`, kind: 'user_statement', text: entry.explanation.trim() });
        }
      }
    }
    return {
      sourceRef,
      snapshot: {
        source_kind: 'theme_result',
        observation_text: observation.text,
        observation_focus: observation.focus?.trim() || null,
        result_revision_id: sourceRef.result_revision_id,
        round_id: sourceRef.round_id,
      },
      evidence,
    };
  }

  private async resolveDynamic(userId: string, sourceRef: Extract<UnderstandingSourceRef, { kind: 'dynamic_result' }>): Promise<ResolvedUnderstandingSource> {
    const rows = await this.db.pool.query<{ scenes: Array<{ scene_id: string; scene_number: number; narrative: string; choices: Array<{ choice_id: string; text: string }> }>; played_path: Array<{ scene_id: string; choice_id: string }> }>(
      `SELECT d.scenes, d.played_path
         FROM dynamic_scripts d
         JOIN dynamic_script_generations g ON g.id = d.generation_id
        WHERE d.id = $1 AND d.generation_id = $2 AND d.user_id = $3
          AND d.play_completed_at IS NOT NULL AND g.status = 'ready'`,
      [sourceRef.script_id, sourceRef.generation_id, userId],
    );
    const row = rows.rows[0];
    if (!row?.played_path?.length || createHash('sha256').update(JSON.stringify(row.played_path)).digest('hex') !== sourceRef.playback_hash) {
      throw new NotFoundException({ code: 'source_not_found' });
    }
    const observation = buildDynamicResult(row.scenes, row.played_path).observations.find((item) => item.id === sourceRef.observation_id);
    if (!observation) throw new NotFoundException({ code: 'source_not_found' });
    return {
      sourceRef,
      snapshot: { source_kind: 'dynamic_result', observation_text: observation.text, observation_focus: observation.title },
      evidence: [
        { id: `dynamic:${sourceRef.script_id}:${observation.id}:context`, kind: 'simulation_context', text: observation.evidence.situation },
        { id: `dynamic:${sourceRef.script_id}:${observation.id}:choice`, kind: 'simulation_choice', text: observation.evidence.choice_text },
      ],
    };
  }
}
