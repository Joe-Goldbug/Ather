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
import { NOTE_REVIEW_DIMENSION, parseNoteReview } from './note-review.js';

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
      pushInterpretation('trustBoundaries', '这段记录提到了拒绝、信任或边界。你可以回看当时是怎样说明自己能承担的范围。', 2, 0.52);
    }
    if (hasAny(['冲突', '争吵', '对质', 'conflict', 'argu', 'fight'])) {
      pushInterpretation('conflictResponse', '这段记录提到了冲突或争吵。它记录的是一次具体经历，还不能说明你平时总会怎样面对分歧。', 2, 0.52);
    }
    if (hasAny(['不回', '冷淡', '忽略', 'ghost', 'ignored', 'rejected'])) {
      pushInterpretation('attachment', '这段记录提到了距离、忽略或被拒绝。你可以补充：当时发生了什么，以及这对你意味着什么。', 2, 0.5);
    }
    if (hasAny(['焦虑', '崩溃', '平静', '愤怒', '情绪', 'anxious', 'overwhelmed', 'angry', 'calm'])) {
      pushInterpretation('emotionRegulation', '这段记录出现了情绪词。它能帮助你回看当时的感受，不能单独说明你的情绪习惯。', 2, 0.5);
    }
    if (hasAny(['压力', '睡不着', 'deadline', 'stress', 'burnout', '疲惫'])) {
      pushInterpretation('stressResponse', '这段记录提到了压力、疲惫或时间限制。你可以回看自己当时先做了什么来应对。', 2, 0.52);
    }
    if (hasAny(['目标', '绩效', '完美', '工作', 'goal', 'deadline', 'performance', 'perfect'])) {
      pushInterpretation('achievementMotivation', '这段记录提到了目标、工作或标准。它只提示这里可能有压力来源，需要结合你的说明理解。', 2, 0.5);
    }
    if (hasAny(['我是不是', '自我', '怀疑自己', 'who am i', 'self-worth', 'identity'])) {
      pushInterpretation('selfCognition', '这段记录包含了关于自己的疑问。你可以补充：你当时想确认的，究竟是哪一件事。', 2, 0.5);
    }
    if (hasAny(['社交', '朋友', '聚会', '独处', 'party', 'friends', 'alone', 'social'])) {
      pushInterpretation('socialEnergy', '这段记录提到了社交或独处。一次记录不足以说明你的社交习惯，但可以成为你回看的起点。', 2, 0.5);
    }

    if (entryType === 'emotion_log' && interpretations.length === 0 && moodLabel) {
      pushInterpretation('emotionRegulation', `你把当时的感受记为“${moodLabel}”。这是一条关于那一刻的记录，想的话可以补充发生了什么。`, 1, 0.5);
    }

    if (entryType === 'decision_log' && interpretations.length === 0) {
      pushInterpretation('selfCognition', '这是一条关于具体事情的记录。单独一条还不能形成模式，想的话可以写下当时最在意什么。', 1, 0.5);
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
   * Analyze an already-saved record only after its owner explicitly asks for it.
   * A repeat request returns the existing cues instead of writing duplicate ones.
   */
  async analyze(userId: string, captureId: string): Promise<{
    capture: CaptureRow;
    interpretations: InterpretationRow[];
    summary?: string;
  }> {
    const client = await this.db.pool.connect();
    try {
      await client.query('BEGIN');
      const currentResult = await client.query<CaptureRow>(
        `SELECT * FROM captures
         WHERE id = $1 AND user_id = $2
         FOR UPDATE`,
        [captureId, userId],
      );
      const current = currentResult.rows[0];
      if (!current) throw new NotFoundException({ code: 'capture_not_found' });
      if (!current.raw_text?.trim()) {
        throw new BadRequestException({ code: 'capture_has_no_text_to_analyze' });
      }

      if (current.process_mode === 'analyze') {
        const existing = await client.query<InterpretationRow>(
          `SELECT * FROM capture_interpretations
           WHERE capture_id = $1 AND user_id = $2
           ORDER BY created_at ASC`,
          [captureId, userId],
        );
        await client.query('COMMIT');
        return { capture: current, interpretations: existing.rows };
      }

      const updatedResult = await client.query<CaptureRow>(
        `UPDATE captures
         SET process_mode = 'analyze', updated_at = NOW()
         WHERE id = $1 AND user_id = $2
         RETURNING *`,
        [captureId, userId],
      );
      const capture = updatedResult.rows[0];
      const input: CaptureInput = {
        userId,
        entryType: capture.entry_type as EntryType,
        processMode: 'analyze',
        modality: capture.modality as Modality,
        rawText: capture.raw_text,
        mediaUrl: capture.media_url ?? undefined,
        moodLabel: capture.mood_label ?? undefined,
        moodIntensity: capture.mood_intensity ?? undefined,
        localDate: capture.local_date ?? undefined,
        timezone: capture.timezone ?? undefined,
      };
      const result = processCapture(input, (text: string) =>
        this.interpretRawText(text, input.entryType, input.moodLabel),
      );
      const interpretations: InterpretationRow[] = [];
      for (const interpretation of result.interpretations) {
        const inserted = await client.query<InterpretationRow>(
          `INSERT INTO capture_interpretations (capture_id, user_id, dimension, ai_explanation, proposed_delta, ai_confidence, status)
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           RETURNING *`,
          [
            capture.id,
            userId,
            interpretation.dimension,
            interpretation.aiExplanation,
            interpretation.proposedDelta,
            interpretation.aiConfidence,
            'pending',
          ],
        );
        interpretations.push(inserted.rows[0]);
      }
      await client.query('COMMIT');
      return { capture, interpretations, summary: result.summary };
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      throw error;
    } finally {
      client.release();
    }
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
      if (interp.dimension === NOTE_REVIEW_DIMENSION) {
        throw new BadRequestException({ code: 'note_review_is_not_trait_evidence' });
      }

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

    return this.withInterpretations(userId, result.rows);
  }

  async get(userId: string, captureId: string): Promise<CaptureRow> {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(captureId)) throw new BadRequestException({ code: 'invalid_capture_id' });
    const result = await this.db.pool.query<CaptureRow>('SELECT * FROM captures WHERE user_id = $1 AND id = $2', [userId, captureId]);
    if (!result.rows[0]) throw new NotFoundException({ code: 'capture_not_found' });
    return (await this.withInterpretations(userId, result.rows))[0];
  }

  private async withInterpretations(userId: string, rows: CaptureRow[]): Promise<CaptureRow[]> {
    if (rows.length === 0) return rows;

    const captureIds = rows.map((row) => row.id);
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

    return rows.map((capture) => ({
      ...capture,
      interpretations: (groupedInterpretations.get(capture.id) ?? []).filter((row) => row.dimension !== NOTE_REVIEW_DIMENSION),
      note_reviews: (groupedInterpretations.get(capture.id) ?? []).filter((row) => row.dimension === NOTE_REVIEW_DIMENSION)
        .flatMap((row) => { const doc = parseNoteReview(row.ai_explanation); return doc ? [{ ...doc, id: row.id, created_at: row.created_at }] : []; }),
    }));
  }
}
