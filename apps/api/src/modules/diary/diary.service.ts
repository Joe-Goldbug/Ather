// apps/api/src/modules/diary/diary.service.ts
// Legacy diary archive service.
// Keeps diary_entries readable and optionally writable in legacy mode, while
// the current formal record flow writes to captures instead.

import { BadRequestException, Injectable } from '@nestjs/common';
import { z } from 'zod';
import { Database } from '../../common/database.js';
import {
  buildArchiveEntry,
  buildDiaryEntryFields,
  computeDiaryEvidenceEvents,
  normalizeDiaryEventType,
  type DiaryRealitySyncEventType,
} from '@eva/core';

const UpsertDiarySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  answers: z.record(z.string(), z.string()).optional().default({'Empty': 'No comment'}),
  timezone: z.string().optional(),
  locale: z.enum(['zh-CN', 'en', 'ja', 'es']).optional().default('en'),
});

export type UpsertDiaryDto = z.infer<typeof UpsertDiarySchema>;

/** Derive mood label from legacy diary answer keywords — multilingual */
function inferMoodLabel(answers: Record<string, string>): { label: string | null; intensity: number } {
  const combined = Object.values(answers).join('');

  const positivePatterns: Record<string, number> = {
    开心: 1, 兴奋: 1, 满足: 1, 感恩: 1, 成就感: 1, 突破: 1, 进步: 1,
    happy: 1, excited: 1, grateful: 1, accomplished: 1, breakthrough: 1, progress: 1,
    嬉しい: 1, 達成感: 1, 面白: 1,
    feliz: 1, emocionado: 1, agradecido: 1,
  };
  const negativePatterns: Record<string, number> = {
    难过: 1, 失落: 1, 沮丧: 1, 焦虑: 1, 压力: 1, 疲惫: 1, 崩溃: 1,
    sad: 1, anxious: 1, stressed: 1, exhausted: 1, overwhelmed: 1,
    心配: 1, 压力大: 1, 疲れた: 1,
    triste: 1, ansioso: 1, estresado: 1,
  };

  let positive = 0, negative = 0;
  for (const [k, v] of Object.entries(positivePatterns)) {
    if (combined.includes(k)) positive += v;
  }
  for (const [k, v] of Object.entries(negativePatterns)) {
    if (combined.includes(k)) negative += v;
  }

  const total = positive + negative;
  if (total === 0) return { label: null, intensity: 0 };
  return {
    label: positive > negative ? 'positive' : 'negative',
    intensity: Math.min(5, Math.round(total * 1.5)),
  };
}

/** Extract anchor text from structured answer keys */
function extractAnchor(answers: Record<string, string>): string | null {
  const keys = ['detail', 'high_point', 'highPoint', 'low_point', 'lowPoint', 'highlight', 'peak'];
  for (const k of keys) {
    const v = answers[k]?.trim();
    if (v) return v.slice(0, 160);
  }
  return null;
}

@Injectable()
export class DiaryService {
  constructor(private readonly db: Database) {}

  async upsertDiary(userId: string, dto: UpsertDiaryDto) {
    // 运行时校验：UpsertDiarySchema 此前只用于推导 TS 类型（定义之后全文件零 .parse()），
    // 畸形输入会直达 service。这里接通校验，同时获得 schema 的默认值填充
    // （answers 默认 {}、locale 默认 'en'），使下游读取更稳健。
    const parsedResult = UpsertDiarySchema.safeParse(dto);
    if (!parsedResult.success) {
      throw new BadRequestException({
        code: 'invalid_diary_payload',
        issues: parsedResult.error.issues.map((issue) => ({
          path: issue.path.join('.'),
          message: issue.message,
        })),
      });
    }
    const { date, answers, timezone } = parsedResult.data;
    const eventType = normalizeDiaryEventType(answers.event_type ?? answers.eventType ?? answers.tag);
    const detail = (answers.detail ?? answers.note ?? answers.summary ?? '').trim();
    const content = JSON.stringify(answers);
    const { label: mood_label, intensity: mood_intensity } = inferMoodLabel(answers);
    const anchor_text = extractAnchor(answers);

    // Also extract pattern key (multilingual)
    const patternKeys = ['pattern', 'pattern_noticed', 'patternNoticed', 'patrón'];
    let pattern_text: string | null = null;
    for (const k of patternKeys) {
      const v = answers[k]?.trim();
      if (v) { pattern_text = v; break; }
    }
    if (!pattern_text && detail) {
      pattern_text = detail;
    }

    const poolAny = this.db.pool as {
      connect?: () => Promise<{
        query: <T = unknown>(text: string, params?: unknown[]) => Promise<{ rows: T[] }>;
        release: () => void;
      }>;
      query: <T = unknown>(text: string, params?: unknown[]) => Promise<{ rows: T[] }>;
    };
    const client = typeof poolAny.connect === 'function' ? await poolAny.connect() : null;
    const query = client?.query.bind(client) ?? poolAny.query.bind(poolAny);

    try {
      if (client) {
        await query('BEGIN');
      }

      const upsertedRow = (await query(
        `INSERT INTO diary_entries
           (user_id, entry_date, content, mood_label, mood_intensity, anchor_text, pattern_text, timezone, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW())
         ON CONFLICT (user_id, entry_date) DO UPDATE SET
           content = EXCLUDED.content,
           mood_label = COALESCE(EXCLUDED.mood_label, diary_entries.mood_label),
           mood_intensity = COALESCE(EXCLUDED.mood_intensity, diary_entries.mood_intensity),
           anchor_text = COALESCE(EXCLUDED.anchor_text, diary_entries.anchor_text),
           pattern_text = COALESCE(EXCLUDED.pattern_text, diary_entries.pattern_text),
           timezone = COALESCE($8, diary_entries.timezone),
           updated_at = NOW()
         RETURNING id, entry_date, mood_label, mood_intensity, created_at`,
        [userId, date, content, mood_label, mood_intensity, anchor_text, pattern_text, timezone],
      )) as {
        rows: Array<{
          id: string;
          entry_date: string;
          mood_label: string | null;
          mood_intensity: number | null;
          created_at: string;
        }>;
      };

      const saved = upsertedRow.rows[0];
      if (!saved) {
        throw new Error('Failed to save diary entry');
      }
      // 2-A3 前置：字段还原逻辑收敛到 core（buildDiaryEntryFields），
      // profile 的证据原文回溯端点用同一实现还原文本，保证 fragment 偏移不错位。
      const diaryEntryFields = {
        eventType,
        ...buildDiaryEntryFields(answers, eventType),
        moodLabel: mood_label ?? undefined,
        moodIntensity: mood_intensity > 0 ? mood_intensity : undefined,
      };

      const events = computeDiaryEvidenceEvents(
        userId,
        saved.id,
        diaryEntryFields,
        dto.locale,
      );

      if (events.length > 0) {
        const values: unknown[] = [];
        const placeholders: string[] = [];
        let idx = 1;
        for (const e of events) {
          placeholders.push(
            `($${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++})`,
          );
          // 2-B/D2-1：非 self 归因 → candidate=true（被 1-3 过滤器与 formal
          // 晋升排除出本人画像计算），归因标注进 quality_metadata，数据保留。
          const attribution = e.attribution ?? 'self';
          const quarantined = attribution !== 'self';
          values.push(
            e.userId,
            e.sourceType,
            e.sourceId ?? null,
            e.dimension,
            e.delta ?? null,
            e.weight ?? 1,
            e.confidence ?? 0.5,
            e.quote ?? null,
            e.explanation,
            quarantined,
            { attribution },
            'user_self_report',
            'recalled_event',
            `diary:${saved.id}`,
          );
        }
        // RETURNING id：片段定位（2-A1）需要回填 evidence_event_id
        const insertedEvidence = (await query(
          `INSERT INTO evidence_events (user_id, source_type, source_id, dimension, delta, weight, confidence, quote, explanation, candidate, quality_metadata, epistemic_source, content_kind, source_independence_group)
           VALUES ${placeholders.join(', ')}
           RETURNING id`,
          values,
        )) as { rows: Array<{ id: string }> };

        // 2-A1：同事务写入片段定位。PG 多行 INSERT...RETURNING 保序，
        // insertedEvidence.rows[i] 对应 events[i]。ON CONFLICT 保证同日重写幂等。
        const fragmentValues: unknown[] = [];
        const fragmentPlaceholders: string[] = [];
        let fIdx = 1;
        events.forEach((e, i) => {
          const evidenceId = insertedEvidence.rows[i]?.id;
          if (!e.fragment || !evidenceId) return;
          fragmentPlaceholders.push(`($${fIdx++}, $${fIdx++}, $${fIdx++}, $${fIdx++})`);
          fragmentValues.push(evidenceId, e.sourceType, e.sourceId ?? null, e.fragment.locator);
        });
        if (fragmentPlaceholders.length > 0) {
          await query(
            `INSERT INTO evidence_source_fragments (evidence_event_id, source_type, source_id, fragment_locator)
             VALUES ${fragmentPlaceholders.join(', ')}
             ON CONFLICT (evidence_event_id, fragment_locator) DO NOTHING`,
            fragmentValues,
          );
        }

        // 2-C1：同事务归档原始输入（SHA256 基于 canonicalJson，JSONB 读回后
        // 可重算验证）。ON CONFLICT 保证同日重写幂等。哈希输入覆盖用户提交的
        // 全部自由文本字段，使任意 evidence 可回溯到原始输入字节。
        const archive = buildArchiveEntry('diary', saved.id, {
          date,
          answers,
          eventType,
          moodLabel: mood_label,
          moodIntensity: mood_intensity,
        });
        await query(
          `INSERT INTO evidence_input_archives (user_id, source_type, source_id, content_sha256, content)
           VALUES ($1, 'diary', $2, $3, $4::jsonb)
           ON CONFLICT (source_type, source_id) DO NOTHING`,
          [userId, saved.id, archive.contentSha256, archive.content],
        );
      }

      if (client) {
        await query('COMMIT');
      }
      return saved;
    } catch (err) {
      if (client) {
        await query('ROLLBACK');
      }
      throw err;
    } finally {
      client?.release();
    }
  }

  async getRecentDiaries(userId: string, limit = 7, offset = 0) {
    const rows = await this.db.pool.query(
      `SELECT id, entry_date, content, mood_label, anchor_text, pattern_text, timezone, created_at
       FROM diary_entries
       WHERE user_id = $1
       ORDER BY entry_date DESC, id DESC
       LIMIT $2 OFFSET $3`,
      [userId, limit, offset],
    );
    return rows.rows.map((r) => ({
      ...r,
      content: typeof r.content === 'string' ? JSON.parse(r.content) : r.content,
    }));
  }
}
