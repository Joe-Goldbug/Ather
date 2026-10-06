// apps/api/src/modules/captures/captures.service.ts
// Captures service — three-layer separation:
//   1. raw_text in captures (user's original expression)
//   2. Rule-based interpretation in capture_interpretations (hypothesis, pending)
//   3. Confirmed candidate evidence in evidence_events (not a formal portrait claim)

import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import {
  processCapture,
  type CaptureInput,
  type ProcessMode,
  type Modality,
  type EntryType,
  MODALITY_WEIGHT,
  type InterpretationResult,
} from '@eva/core';
import { Database } from '../../common/database.js';

export interface CreateCaptureBody {
  entryType: EntryType;
  processMode: ProcessMode;
  modality: Modality;
  rawText?: string;
  mediaUrl?: string;
  moodLabel?: string;
  moodIntensity?: number;
  localDate?: string;
  timezone?: string;
  allowWeeklyReview?: boolean;
}

export interface CaptureRow {
  id: string;
  user_id: string;
  entry_type: string;
  process_mode: string;
  allow_weekly_review: boolean;
  modality: string;
  raw_text: string | null;
  media_url: string | null;
  source_weight: number;
  captured_at: string;
  local_date: string | null;
  timezone: string | null;
  mood_label: string | null;
  mood_intensity: number | null;
  created_at: string;
  interpretations?: InterpretationRow[];
}

export interface InterpretationRow {
  id: string;
  capture_id: string;
  user_id: string;
  dimension: string;
  ai_explanation: string;
  proposed_delta: number | null;
  ai_confidence: number;
  status: string;
  support_count: number;
  emitted_evidence_id: string | null;
  created_at: string;
}

@Injectable()
export class CapturesService {
  constructor(private readonly db: Database) {}

  private interpretRawText(
    text: string,
    entryType: EntryType,
    moodLabel?: string,
  ): InterpretationResult[] {
    const normalized = text.toLowerCase();
    const interpretations: InterpretationResult[] = [];
    const seen = new Set<string>();

    const pushInterpretation = (
      dimension: string,
      aiExplanation: string,
      proposedDelta: number,
      aiConfidence: number,
    ) => {
      if (seen.has(dimension)) return;
      seen.add(dimension);
      interpretations.push({
        dimension,
        aiExplanation,
        proposedDelta,
        aiConfidence,
        status: 'pending',
      });
    };

    const hasAny = (patterns: string[]) => patterns.some((pattern) => normalized.includes(pattern));

    if (hasAny(['边界', '拒绝', '说不', 'no ', 'boundary', 'trust'])) {
      pushInterpretation('trustBoundaries', 'This fragment may reflect how you set trust and boundary thresholds.', 4, 0.62);
    }
    if (hasAny(['冲突', '争吵', '对质', 'conflict', 'argu', 'fight'])) {
      pushInterpretation('conflictResponse', 'This fragment may reflect your default response under interpersonal conflict.', 4, 0.6);
    }
    if (hasAny(['不回', '冷淡', '忽略', 'ghost', 'ignored', 'rejected'])) {
      pushInterpretation('attachment', 'This fragment may reflect how you interpret distance or rejection in relationships.', 4, 0.58);
    }
    if (hasAny(['焦虑', '崩溃', '平静', '愤怒', '情绪', 'anxious', 'overwhelmed', 'angry', 'calm'])) {
      pushInterpretation('emotionRegulation', 'This fragment may reflect how you notice, label, or regulate emotion in the moment.', 3, 0.57);
    }
    if (hasAny(['压力', '睡不着', 'deadline', 'stress', 'burnout', '疲惫'])) {
      pushInterpretation('stressResponse', 'This fragment may reflect your stress response under load or uncertainty.', 4, 0.61);
    }
    if (hasAny(['目标', '绩效', '完美', '工作', 'goal', 'deadline', 'performance', 'perfect'])) {
      pushInterpretation('achievementMotivation', 'This fragment may reflect the standards or performance pressure guiding your decisions.', 3, 0.56);
    }
    if (hasAny(['我是不是', '自我', '怀疑自己', 'who am i', 'self-worth', 'identity'])) {
      pushInterpretation('selfCognition', 'This fragment may reflect how stable or self-critical your self-understanding feels.', 3, 0.55);
    }
    if (hasAny(['社交', '朋友', '聚会', '独处', 'party', 'friends', 'alone', 'social'])) {
      pushInterpretation('socialEnergy', 'This fragment may reflect whether social contact gives or drains your energy.', 3, 0.55);
    }

    if (entryType === 'emotion_log' && interpretations.length === 0 && moodLabel) {
      pushInterpretation('emotionRegulation', `This emotion log may reflect your recent emotional regulation pattern around "${moodLabel}".`, 2, 0.52);
    }

    if (entryType === 'decision_log' && interpretations.length === 0) {
      pushInterpretation('selfCognition', 'This decision log may reflect an emerging decision-making pattern worth verifying.', 2, 0.5);
    }

    return interpretations.slice(0, 2);
  }

  /**
   * Create a capture and process it through the pipeline.
   * - save_only: just stores the raw capture
   * - organize: produces a summary (stored in raw_text as annotation)
   * - analyze: produces pending interpretations in capture_interpretations
   */
  async create(userId: string, body: CreateCaptureBody): Promise<{
    capture: CaptureRow;
    interpretations: InterpretationRow[];
    summary?: string;
  }> {
    const sourceWeight = MODALITY_WEIGHT[body.modality];
    if (typeof body.allowWeeklyReview !== 'undefined' && typeof body.allowWeeklyReview !== 'boolean') {
      throw new BadRequestException({ code: 'invalid_weekly_review_permission' });
    }
    if (body.processMode === 'save_only' && body.allowWeeklyReview) {
      throw new BadRequestException({ code: 'save_only_cannot_allow_weekly_review' });
    }

    // Step 1: Insert the capture record (raw_text preserved as-is)
    const captureResult = await this.db.pool.query<CaptureRow>(
      `INSERT INTO captures (user_id, entry_type, process_mode, modality, raw_text, media_url, source_weight, local_date, timezone, mood_label, mood_intensity, allow_weekly_review)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       RETURNING *`,
      [
        userId,
        body.entryType,
        body.processMode,
        body.modality,
        body.rawText ?? null,
        body.mediaUrl ?? null,
        sourceWeight,
        body.localDate ?? null,
        body.timezone ?? null,
        body.moodLabel ?? null,
        body.moodIntensity ?? null,
        body.allowWeeklyReview === true,
      ],
    );
    const capture = captureResult.rows[0];

    // Step 2: Run through core pipeline (pure function — no DB/network)
    const input: CaptureInput = {
      userId,
      entryType: body.entryType,
      processMode: body.processMode,
      modality: body.modality,
      rawText: body.rawText,
      mediaUrl: body.mediaUrl,
      moodLabel: body.moodLabel,
      moodIntensity: body.moodIntensity,
      localDate: body.localDate,
      timezone: body.timezone,
    };

    // For analyze mode, provide a simple interpret callback
    // In production, this would integrate with actual AI service
    const result = processCapture(input, (text: string) =>
      this.interpretRawText(text, body.entryType, body.moodLabel),
    );

    // Step 3: If analyze mode produced interpretations, insert them
    const interpretations: InterpretationRow[] = [];
    if (result.interpretations.length > 0) {
      for (const interp of result.interpretations) {
        const interpResult = await this.db.pool.query<InterpretationRow>(
          `INSERT INTO capture_interpretations (capture_id, user_id, dimension, ai_explanation, proposed_delta, ai_confidence, status)
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           RETURNING *`,
          [
            capture.id,
            userId,
            interp.dimension,
            interp.aiExplanation,
            interp.proposedDelta,
            interp.aiConfidence,
            'pending',
          ],
        );
        interpretations.push(interpResult.rows[0]);
      }
    }

    return { capture, interpretations, summary: result.summary };
  }

  async setWeeklyReviewPermission(userId: string, captureId: string, allowed: boolean): Promise<CaptureRow> {
    if (typeof allowed !== 'boolean') {
      throw new BadRequestException({ code: 'invalid_weekly_review_permission' });
    }
    const result = await this.db.pool.query<CaptureRow>(
      `UPDATE captures SET allow_weekly_review = $3
       WHERE id = $1 AND user_id = $2 AND (process_mode <> 'save_only' OR $3 = false)
       RETURNING *`,
      [captureId, userId, allowed],
    );
    if (!result.rows[0]) throw new NotFoundException({ code: 'capture_not_found_or_ineligible' });
    return result.rows[0];
  }

  /**
   * Confirm an interpretation: updates status to 'confirmed', writes evidence_events
   * as candidate evidence, not a formal portrait claim.
   */
  async confirmInterpretation(
    userId: string,
    captureId: string,
    interpretationId: string,
    attribution: 'self' | 'about_other' | 'hypothetical' | 'unknown' = 'unknown',
  ): Promise<{ interpretation: InterpretationRow; evidenceId: string }> {
    if (!['self', 'about_other', 'hypothetical', 'unknown'].includes(attribution)) {
      throw new BadRequestException({ code: 'invalid_attribution' });
    }
    // P1-6 修复：把 SELECT / INSERT / UPDATE 包进同一事务，并加 FOR UPDATE 防并发重复生成 evidence
    // P1-8 修复：accept attribution 参数；写入 evidence_events.quality_metadata.attribution
    const client = await this.db.pool.connect();
    try {
      await client.query('BEGIN');
      // Verify ownership and existence; FOR UPDATE 锁住这一行防止并发 confirm
      const interpResult = await client.query<InterpretationRow & { proposed_delta: number | null; dimension: string; ai_explanation: string }>(
        `SELECT * FROM capture_interpretations
         WHERE id = $1 AND capture_id = $2 AND user_id = $3
         FOR UPDATE
         LIMIT 1`,
        [interpretationId, captureId, userId],
      );

      if (!interpResult.rows[0]) {
        await client.query('ROLLBACK');
        throw new Error('Interpretation not found, not owned by user, or already confirmed/refuted');
      }

      const interp = interpResult.rows[0];

      if (interp.status === 'confirmed') {
        if (!interp.emitted_evidence_id) {
          throw new ConflictException({ code: 'confirmation_evidence_missing' });
        }
        const existing = await client.query<{ attribution: string }>(
          `SELECT COALESCE(quality_metadata->>'attribution', 'unknown') AS attribution
           FROM evidence_events WHERE id = $1 AND user_id = $2 AND source_id = $3 FOR SHARE`,
          [interp.emitted_evidence_id, userId, captureId],
        );
        if (!existing.rows[0]) throw new ConflictException({ code: 'confirmation_evidence_missing' });
        if (existing.rows[0].attribution !== attribution) {
          throw new ConflictException({ code: 'confirmation_attribution_changed' });
        }
        await client.query('COMMIT');
        return { interpretation: interp, evidenceId: interp.emitted_evidence_id };
      }
      if (interp.status !== 'pending') throw new ConflictException({ code: 'interpretation_not_pending' });

      // User confirmation creates only candidate evidence, not a formal portrait claim.
      // quality_metadata.attribution 让下游能区分 self / about_other / hypothetical / unknown
      const evidenceResult = await client.query<{ id: string }>(
        `INSERT INTO evidence_events (user_id, source_type, source_id, dimension, delta, weight, confidence, explanation, evidence_kind, candidate, local_date, quality_metadata, epistemic_source, content_kind, source_independence_group)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb, $13, $14, $15)
         RETURNING id`,
        [
          userId,
          'capture',                       // source_type (legacy compat label)
          captureId,                       // source_id
          interp.dimension,
          interp.proposed_delta,
          1.0,                             // confirmed = full weight
          interp.ai_confidence,
          interp.ai_explanation,
          'reality',                       // evidence_kind (authoritative classification)
          true,                            // bounded observation, not a stable trait
          null,                            // local_date (inherit from capture if needed)
          JSON.stringify({ attribution }), // P1-8：主体归因
          'user_self_report',
          'recalled_event',
          `capture:${captureId}`,
        ],
      );

      const evidenceId = evidenceResult.rows[0].id;

      // Update interpretation status to confirmed + link emitted evidence
      const updatedResult = await client.query<InterpretationRow>(
        `UPDATE capture_interpretations
         SET status = 'confirmed', confirmed_at = NOW(), emitted_evidence_id = $1
         WHERE id = $2
         RETURNING *`,
        [evidenceId, interpretationId],
      );

      await client.query('COMMIT');
      return { interpretation: updatedResult.rows[0], evidenceId };
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      throw error;
    } finally {
      client.release();
    }
  }

  async refuteInterpretation(
    userId: string,
    captureId: string,
    interpretationId: string,
  ): Promise<{ interpretation: InterpretationRow; evidenceId: string | null; alreadyRefuted: boolean }> {
    const client = await this.db.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await client.query<InterpretationRow>(
        `SELECT * FROM capture_interpretations
         WHERE id = $1 AND capture_id = $2 AND user_id = $3
         FOR UPDATE`,
        [interpretationId, captureId, userId],
      );
      const interpretation = result.rows[0];
      if (!interpretation) throw new NotFoundException({ code: 'interpretation_not_found' });
      if (interpretation.status === 'refuted') {
        await client.query('COMMIT');
        return { interpretation, evidenceId: interpretation.emitted_evidence_id, alreadyRefuted: true };
      }
      if (interpretation.status !== 'pending' && interpretation.status !== 'confirmed') {
        throw new ConflictException({ code: 'interpretation_status_invalid' });
      }
      if (interpretation.status === 'confirmed') {
        if (!interpretation.emitted_evidence_id) {
          throw new ConflictException({ code: 'confirmation_evidence_missing' });
        }
        const withdrawn = await client.query<{ id: string }>(
          `UPDATE evidence_events
           SET portrait_status = 'withdrawn', candidate = true, updated_at = NOW()
           WHERE id = $1 AND user_id = $2 AND source_type = 'capture' AND source_id = $3
           RETURNING id`,
          [interpretation.emitted_evidence_id, userId, captureId],
        );
        if (!withdrawn.rows[0]) throw new ConflictException({ code: 'confirmation_evidence_missing' });
      }
      const updated = await client.query<InterpretationRow>(
        `UPDATE capture_interpretations SET status = 'refuted'
         WHERE id = $1 RETURNING *`,
        [interpretationId],
      );
      await client.query('COMMIT');
      return {
        interpretation: updated.rows[0],
        evidenceId: interpretation.emitted_evidence_id,
        alreadyRefuted: false,
      };
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * List captures for a user (newest first), with pagination.
   */
  async list(userId: string, limit = 20, offset = 0): Promise<CaptureRow[]> {
    const result = await this.db.pool.query<CaptureRow>(
      `SELECT * FROM captures
       WHERE user_id = $1
       ORDER BY captured_at DESC, id DESC
       LIMIT $2 OFFSET $3`,
      [userId, limit, offset],
    );

    if (result.rows.length === 0) {
      return result.rows;
    }

    const captureIds = result.rows.map((row) => row.id);
    const interpretationsResult = await this.db.pool.query<InterpretationRow>(
      `SELECT * FROM capture_interpretations
       WHERE user_id = $1 AND capture_id = ANY($2::uuid[])
       ORDER BY created_at ASC`,
      [userId, captureIds],
    );

    const groupedInterpretations = new Map<string, InterpretationRow[]>();
    for (const interpretation of interpretationsResult.rows) {
      const existing = groupedInterpretations.get(interpretation.capture_id) ?? [];
      existing.push(interpretation);
      groupedInterpretations.set(interpretation.capture_id, existing);
    }

    return result.rows.map((capture) => ({
      ...capture,
      interpretations: groupedInterpretations.get(capture.id) ?? [],
    }));
  }
}
