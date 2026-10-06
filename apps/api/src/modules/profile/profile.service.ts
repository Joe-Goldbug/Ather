import { Injectable, NotFoundException } from '@nestjs/common';
import type { EvidenceEventRow } from '@eva/core';
import { buildDiaryEntryFields, normalizeDiaryEventType } from '@eva/core';
import { Database } from '../../common/database.js';
import { EvidenceService } from '../evidence/evidence.service.js';
import { FORMAL_EVIDENCE_VIEW } from '../../common/formal-evidence.js';
import {
  buildPortraitObservations,
  type PortraitEvidenceItem,
  type PortraitObservation,
} from './portrait-observations.js';

const CORE_DIMENSIONS = [
  'trustBoundaries',
  'conflictResponse',
  'attachment',
  'emotionRegulation',
  'stressResponse',
  'achievementMotivation',
  'selfCognition',
  'socialEnergy',
] as const;

/**
 * 画像分数开关。
 *
 * 此前 getEvolution / getCurrentVector 把 baseline/current/confidence **硬编码为
 * null**（注释：deliberately withholds scores），这是"科学参数未获批"下的主动降级，
 * 而非数据缺失。把"是否对外展示分数"从代码里挪到一个开关上：
 *   默认（关闭）→ 维持现状：只给证据、不给分数
 *   开启（=1）  → 返回 users.memory_state 中的真实值与四因子重算后的 confidence
 *
 * 这样产品决策（D-1）只需改环境变量，无需改代码与重新评审。
 * 注意：开启前应确认算法依据与阈值已获批准。
 */
const PROFILE_SCORES_ENABLED = process.env.EVA_PROFILE_SCORES_ENABLED === '1';

/** Response shape for GET /profile/portrait */
export interface ProfilePortraitResponse {
  modelStatus: 'legacy';
  deprecated: true;
  observations: PortraitObservation[];
  overallLimitation: '目前无法判断长期模式。';
}

@Injectable()
export class ProfileService {
  constructor(
    private readonly db: Database,
    private readonly evidence: EvidenceService,
  ) {}

  /**
   * 读取分数来源。仅在 EVA_PROFILE_SCORES_ENABLED=1 时读取 users.memory_state；
   * 关闭时返回 null，调用方据此回落为 null —— 与旧的硬编码 null 行为完全一致。
   */
  private async loadScoreSource(userId: string): Promise<{
    ubv: Record<string, { value?: number; confidence?: number }>;
    baseline: Record<string, { value?: number }>;
  } | null> {
    if (!PROFILE_SCORES_ENABLED) return null;
    const rows = await this.db.pool.query<{ memory_state: unknown }>(
      'SELECT memory_state FROM users WHERE id = $1 LIMIT 1',
      [userId],
    );
    const raw = rows.rows[0]?.memory_state;
    const memory = (typeof raw === 'string' ? JSON.parse(raw) : raw ?? {}) as {
      ubv?: Record<string, { value?: number; confidence?: number }>;
      baseline_ubv?: Record<string, { value?: number }>;
    };
    return { ubv: memory.ubv ?? {}, baseline: memory.baseline_ubv ?? {} };
  }

  async getEvolution(userId: string) {
    const scores = await this.loadScoreSource(userId);

    const evidence7d = await this.db.pool.query<{
      dimension: string;
      weighted_delta: string | null;
      total: string;
      latest_at: string;
    }>(
      `SELECT
         dimension,
         SUM(COALESCE(delta, 0) * weight) / NULLIF(SUM(weight), 0) AS weighted_delta,
         COUNT(*)::text AS total,
         MAX(created_at)::text AS latest_at
       FROM ${FORMAL_EVIDENCE_VIEW}
       WHERE user_id = $1
         AND created_at >= NOW() - INTERVAL '7 days'
       GROUP BY dimension`,
      [userId],
    );
    const evidenceMap = new Map(evidence7d.rows.map((r) => [r.dimension, r]));

    const corrections30d = await this.db.pool.query<{ dimension: string; total: string }>(
      `SELECT dimension, COUNT(*)::text AS total
       FROM user_corrections
       WHERE user_id = $1
         AND created_at >= NOW() - INTERVAL '30 days'
       GROUP BY dimension`,
      [userId],
    );
    const correctionMap = new Map(corrections30d.rows.map((r) => [r.dimension, Number(r.total) || 0]));

    const dimensions = CORE_DIMENSIONS.map((key) => {
      const ev = evidenceMap.get(key);
      // scores 为 null（开关关闭）时，以下字段全部回落为 null —— 与旧行为完全一致。
      const current = scores?.ubv[key];
      const baseline = scores?.baseline[key];
      const currentValue = current?.value ?? null;
      const baselineValue = baseline?.value ?? null;
      return {
        key,
        baseline: baselineValue,
        current: currentValue,
        delta_7d:
          currentValue !== null && baselineValue !== null ? currentValue - baselineValue : null,
        confidence: current?.confidence ?? null,
        evidence_count_7d: Number(ev?.total ?? 0),
        correction_count_30d: correctionMap.get(key) ?? 0,
        last_evidence_at: ev?.latest_at ?? null,
      };
    });

    return {
      model_status: 'legacy' as const,
      deprecated: true as const,
      limitation: PROFILE_SCORES_ENABLED
        ? '分数来自用户已产生证据的重算结果；样本不足的维度以 null 表示。'
        : '旧版变化分数已停用；目前没有已批准的规则可以判断变化。',
      dimensions,
      baseline_vector: Object.fromEntries(dimensions.map((d) => [d.key, d.baseline])),
      current_vector: Object.fromEntries(dimensions.map((d) => [d.key, d.current])),
      delta_7d: Object.fromEntries(dimensions.map((d) => [d.key, d.delta_7d])),
      confidence_by_dim: Object.fromEntries(dimensions.map((d) => [d.key, d.confidence])),
      last_updated_at: new Date().toISOString(),
    };
  }

  async getCurrentVector(userId: string) {
    const evolution = await this.getEvolution(userId);
    const evidenceCounts = Object.fromEntries(
      evolution.dimensions.map((d) => [d.key, d.evidence_count_7d]),
    );
    const correctionCounts = Object.fromEntries(
      evolution.dimensions.map((d) => [d.key, d.correction_count_30d]),
    );
    return {
      model_status: 'legacy' as const,
      deprecated: true as const,
      limitation: evolution.limitation,
      baseline_vector: evolution.baseline_vector,
      current_vector: evolution.current_vector,
      delta_vector: evolution.delta_7d,
      confidence_vector: evolution.confidence_by_dim,
      evidence_counts_7d: evidenceCounts,
      correction_counts_30d: correctionCounts,
      last_updated_at: evolution.last_updated_at,
    };
  }

  /**
   * Evidence-first portrait. Scientific parameters for stable trait claims are
   * unapproved, so this endpoint deliberately withholds scores and labels.
   */
  async getPortrait(userId: string): Promise<ProfilePortraitResponse> {
    // Load formal evidence only. Candidate correction evidence is intentionally
    // excluded until a future approved validation rule can promote it.
    // Candidate correction evidence must not influence portrait or unlock logic.
    const eventsRes = await this.db.pool.query<EvidenceEventRow>(
      `SELECT id, user_id, source_type, source_id, dimension, delta, weight, confidence,
              quote, explanation, created_at, evidence_kind, local_date, candidate, evidence_mode
       FROM ${FORMAL_EVIDENCE_VIEW}
       WHERE user_id = $1
       ORDER BY created_at ASC`,
      [userId],
    );
    const allEvents: EvidenceEventRow[] = eventsRes.rows.map((r) => ({
      ...r,
      created_at: new Date(r.created_at),
    }));

    const evidenceByDimension: Record<string, PortraitEvidenceItem[]> = {};

    for (const dim of CORE_DIMENSIONS) {
      const dimEvents = allEvents.filter((ev) => ev.dimension === dim);

      // Return a small, inspectable evidence set. Ranking is for readability,
      // never a claim that the selected items establish a stable trait.
      const sortedEvents = [...dimEvents].sort((a, b) => {
        if (b.confidence !== a.confidence) return b.confidence - a.confidence;
        if (b.weight !== a.weight) return b.weight - a.weight;
        return b.created_at.getTime() - a.created_at.getTime();
      });

      evidenceByDimension[dim] = sortedEvents.slice(0, 3).map((ev) => ({
        id: ev.id,
        sourceType: ev.source_type,
        evidenceKind: ev.evidence_kind ?? 'formal',
        quote: ev.quote ?? null,
        explanation: ev.explanation,
        createdAt: ev.created_at.toISOString(),
      }));
    }

    return {
      modelStatus: 'legacy',
      deprecated: true,
      observations: buildPortraitObservations(evidenceByDimension),
      overallLimitation: '目前无法判断长期模式。',
    };
  }

  /**
   * 用户驳回一条画像证据（前端「这条判断不对」）。
   *
   * 这是「用户第一纠偏权」在**画像路径**上的实现，也是唯一作用于用户在
   * /profile 上实际看到的那条证据的路径：
   *   1. 校验证据归属
   *   2. 标记 withdrawn（candidate=true）→ 不再参与任何计算
   *   3. 重新计算该维度置信度并写回 users.memory_state
   *
   * 与 correction-v1 的区别：correction-v1 走 published_observations 修订链
   * （面向"已发布观察"，该体系当前无任何数据）；本方法直接作用于展示中的证据，
   * evidence id 已由 GET /profile/portrait 的 observations[].evidence[].id 提供，
   * 因此**不依赖 2-A 的 fragment locator**。
   *
   * 注意：recomputeDimension 内部只统计 candidate=false 的证据，撤回后该条不再计入；
   * 但它使用独立连接执行，必须在标记提交之后调用，否则会读到未提交的旧状态。
   */
  async withdrawEvidence(userId: string, evidenceId: string) {
    const rows = await this.db.pool.query<{ dimension: string; portrait_status: string }>(
      `SELECT dimension, portrait_status FROM evidence_events
       WHERE id = $1 AND user_id = $2 LIMIT 1`,
      [evidenceId, userId],
    );
    const target = rows.rows[0];
    if (!target) throw new NotFoundException({ code: 'evidence_not_found' });

    if (target.portrait_status === 'withdrawn') {
      await this.db.pool.query(
        `UPDATE capture_interpretations
         SET status = 'refuted'
         WHERE emitted_evidence_id = $1 AND user_id = $2 AND status <> 'refuted'`,
        [evidenceId, userId],
      );
      return {
        evidence_id: evidenceId,
        dimension: target.dimension,
        portrait_status: 'withdrawn',
        recomputed: null,
        already_withdrawn: true,
      };
    }

    await this.db.pool.query(
      `WITH withdrawn AS (
         UPDATE evidence_events
         SET portrait_status = 'withdrawn', candidate = true, updated_at = NOW()
         WHERE id = $1 AND user_id = $2
         RETURNING id
       )
       UPDATE capture_interpretations
       SET status = 'refuted'
       WHERE emitted_evidence_id IN (SELECT id FROM withdrawn) AND user_id = $2`,
      [evidenceId, userId],
    );

    const recomputed = await this.evidence.recomputeDimension(userId, target.dimension);

    return {
      evidence_id: evidenceId,
      dimension: target.dimension,
      portrait_status: 'withdrawn' as const,
      recomputed,
      already_withdrawn: false,
    };
  }

  /**
   * 证据原文回溯（2-A3 后端）。
   *
   * 返回原始输入文本（按 core 的 buildDiaryEntryFields 唯一实现还原）与
   * 片段偏移；前端据此渲染"点开原文并高亮触发句"。偏移越界（原文已被
   * 编辑）时防御性地置 null，绝不返回会错位的高亮区间。
   */
  async getEvidenceSource(userId: string, evidenceId: string) {
    const rows = await this.db.pool.query<{
      id: string;
      source_type: string;
      source_id: string | null;
      fragment_locator: string | null;
    }>(
      `SELECT e.id, e.source_type, e.source_id, f.fragment_locator
       FROM evidence_events e
       LEFT JOIN evidence_source_fragments f ON f.evidence_event_id = e.id
       WHERE e.id = $1 AND e.user_id = $2
       ORDER BY f.created_at ASC
       LIMIT 1`,
      [evidenceId, userId],
    );
    const evidence = rows.rows[0];
    if (!evidence) throw new NotFoundException({ code: 'evidence_not_found' });

    let fragment: { field: string; start: number; end: number; locator: string } | null = null;
    const match = evidence.fragment_locator
      ? /^(.+):(\d+)-(\d+)$/.exec(evidence.fragment_locator)
      : null;
    if (match) {
      fragment = {
        field: match[1],
        start: Number(match[2]),
        end: Number(match[3]),
        locator: evidence.fragment_locator!,
      };
    }

    let contentText: string | null = null;
    if (fragment && evidence.source_type === 'diary' && evidence.source_id) {
      const diaryRows = await this.db.pool.query<{ content: unknown }>(
        `SELECT content FROM diary_entries WHERE id = $1 AND user_id = $2 LIMIT 1`,
        [evidence.source_id, userId],
      );
      const rawContent = diaryRows.rows[0]?.content;
      if (rawContent) {
        const answers = (
          typeof rawContent === 'string' ? JSON.parse(rawContent) : rawContent
        ) as Record<string, string>;
        const eventType = normalizeDiaryEventType(
          answers.event_type ?? answers.eventType ?? answers.tag,
        );
        const fields = buildDiaryEntryFields(answers, eventType);
        const fieldText = (fields as Record<string, string | undefined>)[fragment.field];
        // 防御：原文长度变化导致偏移失效时不下发错位区间
        if (typeof fieldText === 'string' && fragment.end <= fieldText.length) {
          contentText = fieldText;
        } else {
          fragment = null;
        }
      }
    }

    return {
      evidence_id: evidence.id,
      source_type: evidence.source_type,
      source_id: evidence.source_id,
      content_text: contentText,
      fragment,
    };
  }
}
