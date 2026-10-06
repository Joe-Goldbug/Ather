// apps/api/src/modules/evidence/evidence.service.ts
// Evidence module — Phase 7 + S1 extensions
// Persists and queries evidence_events table (populated by chat, diary, assessment, captures)

import { Injectable } from '@nestjs/common';
import type { WriteEvidenceParams, EvidenceEventRow, EvidenceKind } from '@eva/core';
import {
  buildInsightCandidates,
  computeDimensionConfidence,
  aggregateDimensionConfidence,
  type InsightDimensionInput,
  type DimensionConfidenceResult,
} from '@eva/core';
import { Database } from '../../common/database.js';
import type { PoolClient } from '../../common/pool.js';
import { EVA_STRUCTURED_REFLECTION_V1 } from '../../common/feature-flags.js';
import { FORMAL_EVIDENCE_VIEW } from '../../common/formal-evidence.js';
import type { EpistemicSource, EvidenceContentKind, SubjectAttribution } from '@eva/core';

/** Extended params for S1 evidence write path (evidence_kind as authoritative classification) */
export interface WriteEvidenceExtendedParams {
  userId: string;
  /** Legacy compat label — not used for weight/frequency/coverage logic */
  sourceType?: 'test' | 'chat' | 'diary' | 'user_correction' | 'capture';
  sourceId?: string | null;
  dimension: string;
  delta?: number | null;
  weight?: number;
  confidence?: number;
  quote?: string | null;
  explanation: string;
  /** [S1] Authoritative classification — drives weight, frequency, coverage */
  evidenceKind: EvidenceKind;
  /** [S1] How the evidence was produced: choice selection or free-text input. Default 'choice' */
  evidenceMode?: 'choice' | 'input';
  /** [S1] Whether this is candidate evidence (not in formal aggregation). Default false */
  candidate?: boolean;
  /** [S1] Local date string (YYYY-MM-DD) for same-day diminishing logic */
  localDate?: string | null;
  epistemicSource?: EpistemicSource;
  contentKind?: EvidenceContentKind;
  sourceIndependenceGroup?: string;
  attribution?: SubjectAttribution;
}

const MAX_RETRIES = 3;

/**
 * 判断错误是否值得重试。
 *
 * 此前对**所有**错误无差别重试 3 次：一次"已提交但响应丢失"的网络抖动会
 * 导致 INSERT 重放 → 重复证据 → 重复计入 confidence。自愈式重试本该只针对
 * 瞬态故障，因此按 SQLSTATE / 错误信息分类：
 *   可重试：08xxx 连接异常、57P0x 服务端关闭、40001 序列化失败、40P01 死锁、网络类错误
 *   不重试：23xxx 约束违反、42xxx 语法/权限、数据错误 —— 重试不会变好，只会放大副作用
 *
 * 注：无法用 UNIQUE 约束兜底 —— 现有数据中 (user_id, source_type, source_id)
 * 已有 12 组重复（涉 144 行），同一次测评本就产生多条同 source_id 证据，
 * 该键加不上；只能从"不重试非瞬态错误"这一侧消除重复来源。
 */
function isRetryableError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const code = (err as { code?: string }).code;
  if (typeof code === 'string' && code.length > 0) {
    if (/^08/.test(code)) return true;
    if (['57P01', '57P02', '57P03', '40001', '40P01'].includes(code)) return true;
    return false;
  }
  const message = err instanceof Error ? err.message : String(err);
  return /ECONNRESET|ETIMEDOUT|EPIPE|ECONNREFUSED|socket hang up|Connection terminated|connection timeout/i.test(
    message,
  );
}

async function withRetry<T>(fn: () => Promise<T>, context: string): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (attempt < MAX_RETRIES && isRetryableError(err)) {
        await new Promise((r) => setTimeout(r, 50 * attempt)); // backoff: 50, 100, 150ms
        continue;
      }
      break; // 非瞬态错误 → 立即失败，避免重复写入
    }
  }
  console.error(`[EvidenceService] ${context} failed:`, lastError);
  throw lastError;
}

@Injectable()
export class EvidenceService {
  constructor(private readonly db: Database) {}

  private normalizeWeightedDelta(raw: string | null | undefined): number {
    const value = Number(raw ?? 0);
    if (!Number.isFinite(value)) return 0;
    // Evidence deltas are stored as point deltas around baseline 50.
    // Insight candidates expose a compact [-1, 1] direction for prompts/UI.
    return Math.max(-1, Math.min(1, value / 50));
  }

  /** Write a single evidence event */
  async write(params: WriteEvidenceParams): Promise<string> {
    const { userId, sourceType, sourceId, dimension, delta, weight = 1, confidence = 0.5, quote, explanation } = params;
    // Verify source ownership for chat/diary types before writing
    if (sourceId && (sourceType === 'chat' || sourceType === 'diary')) {
      const table = sourceType === 'chat' ? 'conversations' : 'diary_entries';
      const row = await this.db.pool.query<{ id: string }>(
        `SELECT id FROM ${table} WHERE id = $1 AND user_id = $2 LIMIT 1`,
        [sourceId, userId],
      );
      if (!row.rows[0]) {
        throw new Error(`Source ${sourceType}:${sourceId} not owned by user`);
      }
    }
    const rows = await this.db.pool.query<{ id: string }>(
      `INSERT INTO evidence_events (user_id, source_type, source_id, dimension, delta, weight, confidence, quote, explanation)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING id`,
      [userId, sourceType, sourceId ?? null, dimension, delta ?? null, weight, confidence, quote ?? null, explanation],
    );
    return rows.rows[0].id;
  }

  /** Batch-write multiple evidence events in a single round-trip */
  async writeMany(params: WriteEvidenceParams[], client?: PoolClient): Promise<string[]> {
    if (!params.length) return [];
    const queryable = client ?? this.db.pool;

    // Verify source ownership for chat/diary types before writing anything
    await Promise.all(
      params
        .filter((p) => p.sourceId && (p.sourceType === 'chat' || p.sourceType === 'diary'))
        .map(async (p) => {
          const table = p.sourceType === 'chat' ? 'conversations' : 'diary_entries';
          const row = await queryable.query<{ id: string }>(
            `SELECT id FROM ${table} WHERE id = $1 AND user_id = $2 LIMIT 1`,
            [p.sourceId, p.userId],
          );
          if (!row.rows[0]) throw new Error(`Source ${p.sourceType}:${p.sourceId} not owned by user`);
        }),
    );

    const values: unknown[] = [];
    const placeholders: string[] = [];
    let paramIndex = 1;

    for (const p of params) {
      placeholders.push(
        `($${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++})`,
      );
      values.push(
        p.userId,
        p.sourceType,
        p.sourceId ?? null,
        p.dimension,
        p.delta ?? null,
        p.weight ?? 1,
        p.confidence ?? 0.5,
        p.quote ?? null,
        p.explanation ?? null,
      );
    }

    const insert = async () => {
      const rows = await queryable.query<{ id: string }>(
        `INSERT INTO evidence_events (user_id, source_type, source_id, dimension, delta, weight, confidence, quote, explanation)
         VALUES ${placeholders.join(', ')}
         RETURNING id`,
        values,
      );
      return rows.rows.map((r) => r.id);
    };
    // A failed transaction must be retried as a whole, not just its INSERT.
    return client ? insert() : withRetry(insert, `writeMany(${params.length} events)`);
  }

  /** Get all formal evidence for a user (excludes candidate evidence) */
  async getByUser(userId: string, limit = 50, includeCandidates = false) {
    const candidateFilter = includeCandidates ? '' : 'AND COALESCE(candidate, false) = false';
    const rows = await this.db.pool.query(
      `SELECT id, source_type, source_id, dimension, delta, weight, confidence, quote, explanation, created_at
       FROM evidence_events WHERE user_id = $1 ${candidateFilter} ORDER BY created_at DESC LIMIT $2`,
      [userId, limit],
    );
    return rows.rows;
  }

  /**
   * Data for the current portrait UI. It intentionally reads only the
   * governance-approved formal view; legacy and candidate rows may be
   * inspectable through compatibility/archive surfaces but are not counts that
   * imply a current trait.
   */
  async getByDimension(userId: string) {
    const rows = await this.db.pool.query(
       `SELECT dimension,
              COUNT(*) as total,
              AVG(confidence) as avg_confidence,
              SUM(delta * weight) / NULLIF(SUM(weight), 0) as weighted_delta,
              SUM(weight) as weight_sum,
              MAX(created_at) as latest_at
       FROM ${FORMAL_EVIDENCE_VIEW}
       WHERE user_id = $1
       GROUP BY dimension
       ORDER BY total DESC`,
      [userId],
    );
    return rows.rows;
  }

  /** Get distinct dimensions with user corrections in the last 14 days (for YouShifted gating) */
  async getRecentCorrections(userId: string): Promise<string[]> {
    const rows = await this.db.pool.query<{ dimension: string }>(
      `SELECT DISTINCT dimension FROM user_corrections
       WHERE user_id = $1 AND created_at > NOW() - INTERVAL '14 days'`,
      [userId],
    );
    return rows.rows.map((r) => r.dimension);
  }
  async getBySource(sourceType: string, sourceId: string, userId: string) {
    const rows = await this.db.pool.query(
      `SELECT id, user_id, dimension, delta, weight, confidence, quote, explanation, created_at
       FROM evidence_events
       WHERE source_type = $1 AND source_id = $2 AND user_id = $3
       ORDER BY created_at DESC`,
      [sourceType, sourceId, userId],
    );
    return rows.rows;
  }

  async getInsightCandidates(userId: string) {
    const [memoryRows, evidenceRows, correctionRows] = await Promise.all([
      this.db.pool.query<{ memory_state: unknown }>(
        `SELECT memory_state FROM users WHERE id = $1 LIMIT 1`,
        [userId],
      ),
      this.db.pool.query<{
        dimension: string;
        total: string;
        avg_confidence: string | null;
        weighted_delta: string | null;
        min_delta: string | null;
        max_delta: string | null;
        latest_at: string | null;
      }>(
       `SELECT
          dimension,
          COUNT(*)::text AS total,
          AVG(confidence)::text AS avg_confidence,
          (SUM(COALESCE(delta, 0) * weight) / NULLIF(SUM(weight), 0))::text AS weighted_delta,
          MIN(COALESCE(delta, 0))::text AS min_delta,
          MAX(COALESCE(delta, 0))::text AS max_delta,
          MAX(created_at)::text AS latest_at
        FROM evidence_events
        WHERE user_id = $1
          AND COALESCE(candidate, false) = false
          AND created_at >= NOW() - INTERVAL '7 days'
        GROUP BY dimension`,
        [userId],
      ),
      this.db.pool.query<{ dimension: string; total: string }>(
        `SELECT dimension, COUNT(*)::text AS total
         FROM user_corrections
         WHERE user_id = $1 AND created_at >= NOW() - INTERVAL '14 days'
         GROUP BY dimension`,
        [userId],
      ),
    ]);

    const rawMemory = memoryRows.rows[0]?.memory_state;
    const memory = (typeof rawMemory === 'string' ? JSON.parse(rawMemory) : rawMemory ?? {}) as {
      ubv?: Record<string, { confidence?: number }>;
    };

    const evidenceMap = new Map(evidenceRows.rows.map((r) => [r.dimension, r]));
    const correctionMap = new Map(correctionRows.rows.map((r) => [r.dimension, Number(r.total) || 0]));

    const dimensions = new Set<string>([
      ...Object.keys(memory.ubv ?? {}),
      ...evidenceRows.rows.map((r) => r.dimension),
      ...correctionRows.rows.map((r) => r.dimension),
    ]);

    const inputs: InsightDimensionInput[] = [...dimensions].map((dimension) => {
      const ev = evidenceMap.get(dimension);
      const ubvConf = memory.ubv?.[dimension]?.confidence;
      const minD = Number(ev?.min_delta ?? 0);
      const maxD = Number(ev?.max_delta ?? 0);
      const hasOpposing = (minD < 0 && maxD > 0) || (maxD - minD >= 20);

      return {
        dimension,
        confidence: typeof ubvConf === 'number'
          ? ubvConf
          : Number(ev?.avg_confidence ?? 0.4),
        evidence_count_7d: Number(ev?.total ?? 0),
        correction_count_14d: correctionMap.get(dimension) ?? 0,
        weighted_delta_7d: this.normalizeWeightedDelta(ev?.weighted_delta),
        conflict_detected: hasOpposing,
        last_evidence_at: ev?.latest_at ?? null,
      };
    });

    const candidates = buildInsightCandidates(inputs);
    const visible = candidates.filter((c) => c.show_in_ui);

    return {
      generated_at: new Date().toISOString(),
      total_candidates: candidates.length,
      visible_candidates: visible.length,
      candidates,
    };
  }

  // ─────────────────────────────────────────────────────────────
  // [S1] Extended write path — evidence_kind as authoritative classification
  // ─────────────────────────────────────────────────────────────

  /**
   * Write a single evidence event using the S1 extended schema.
   * - evidenceKind is the authoritative classification (drives weight/frequency/coverage)
   * - sourceType is preserved as an optional legacy compat label
   * - free-text (evidenceMode='input') stores quote; choice stores delta
   */
  async writeEvidence(params: WriteEvidenceExtendedParams, client?: PoolClient): Promise<string> {
    const queryable = client ?? this.db.pool;
    const {
      userId,
      sourceType = 'test',
      sourceId,
      dimension,
      delta,
      weight = 1,
      confidence = 0.5,
      quote,
      explanation,
      evidenceKind,
      evidenceMode = 'choice',
      candidate = false,
      localDate,
      epistemicSource = 'unknown',
      contentKind = 'unknown',
      sourceIndependenceGroup,
      attribution = 'unknown',
    } = params;

    // Verify source ownership for chat/diary types before writing
    if (sourceId && (sourceType === 'chat' || sourceType === 'diary')) {
      const table = sourceType === 'chat' ? 'conversations' : 'diary_entries';
      const row = await queryable.query<{ id: string }>(
        `SELECT id FROM ${table} WHERE id = $1 AND user_id = $2 LIMIT 1`,
        [sourceId, userId],
      );
      if (!row.rows[0]) {
        throw new Error(`Source ${sourceType}:${sourceId} not owned by user`);
      }
    }

    const rows = await queryable.query<{ id: string }>(
      `INSERT INTO evidence_events
         (user_id, source_type, source_id, dimension, delta, weight, confidence, quote, explanation,
          evidence_kind, evidence_mode, candidate, local_date, epistemic_source, content_kind,
          source_independence_group, quality_metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17::jsonb)
       RETURNING id`,
      [
        userId,
        sourceType,
        sourceId ?? null,
        dimension,
        delta ?? null,
        weight,
        confidence,
        quote ?? null,
        explanation,
        evidenceKind,
        evidenceMode,
        candidate,
        localDate ?? null,
        epistemicSource,
        contentKind,
        sourceIndependenceGroup ?? null,
        JSON.stringify({ attribution }),
      ],
    );
    return rows.rows[0].id;
  }

  // ─────────────────────────────────────────────────────────────
  // [S1] Recompute dimension confidence — feature-flag branching
  // ─────────────────────────────────────────────────────────────

  /**
   * Recompute confidence for a single dimension.
   * - If EVA_STRUCTURED_REFLECTION_V1 = true: uses four-factor engine (computeDimensionConfidence)
   * - If false: uses the legacy aggregator (aggregateDimensionConfidence)
   *
   * Updates users.memory_state with the new confidence/value and returns the result.
   */
  async recomputeDimension(
    userId: string,
    dimension: string,
  ): Promise<DimensionConfidenceResult | { dimension: string; confidence: number; value: number }> {
    // 1. Load all evidence for this user+dimension
    const evidenceRows = await this.db.pool.query<EvidenceEventRow>(
      `SELECT id, user_id, source_type, source_id, dimension, delta, weight, confidence,
              quote, explanation, created_at, evidence_kind, local_date, candidate, evidence_mode
       FROM evidence_events
       WHERE user_id = $1
         AND dimension = $2
         AND COALESCE(candidate, false) = false
       ORDER BY created_at ASC`,
      [userId, dimension],
    );
    const events: EvidenceEventRow[] = evidenceRows.rows.map((r) => ({
      ...r,
      created_at: new Date(r.created_at),
    }));

    // 2. Load current memory_state for baseValue
    const memoryRow = await this.db.pool.query<{ memory_state: unknown }>(
      'SELECT memory_state FROM users WHERE id = $1 LIMIT 1',
      [userId],
    );
    const rawMemory = memoryRow.rows[0]?.memory_state;
    const memory = (typeof rawMemory === 'string' ? JSON.parse(rawMemory) : rawMemory ?? {}) as {
      ubv?: Record<string, { value?: number; confidence?: number }>;
    };
    const baseValue = memory.ubv?.[dimension]?.value ?? 50;

    let newConfidence: number;
    let newValue: number;
    let result: DimensionConfidenceResult | { dimension: string; confidence: number; value: number };

    if (EVA_STRUCTURED_REFLECTION_V1) {
      // 3a. Four-factor engine
      const calibrationRows = await this.db.pool.query<{ created_at: Date }>(
        `SELECT created_at FROM evidence_events
         WHERE user_id = $1 AND dimension = $2 AND evidence_kind = 'calibration'
         ORDER BY created_at ASC`,
        [userId, dimension],
      );
      const calibrationTimestamps = calibrationRows.rows.map((r) =>
        new Date(r.created_at).getTime(),
      );

      const computed = computeDimensionConfidence({
        dimension,
        baseValue,
        events,
        calibrationTimestamps,
        now: Date.now(),
      });
      newConfidence = computed.confidence;
      newValue = computed.value;
      result = computed;
    } else {
      // 3b. Legacy aggregator
      const aggregation = aggregateDimensionConfidence(baseValue, events);
      newConfidence = aggregation.confidence;
      newValue = aggregation.weighted_value;
      result = { dimension, confidence: newConfidence, value: newValue };
    }

    // 4. Update users.memory_state with new confidence/value
    const ubv = memory.ubv ?? {};
    ubv[dimension] = {
      ...(ubv[dimension] ?? {}),
      value: newValue,
      confidence: newConfidence,
    };
    const updatedMemory = { ...memory, ubv };

    await this.db.pool.query(
      `UPDATE users SET memory_state = $1 WHERE id = $2`,
      [JSON.stringify(updatedMemory), userId],
    );

    return result;
  }
}
