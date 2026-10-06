// apps/api/src/modules/assessment/services/micro-sandbox/evidence-bridge.service.ts
//
// Bridges the dynamic-script pipeline into the existing evidence_events
// pipeline. Writes accumulate per-choice per-dimension signals to
// `pending_dynamic_script_evidence` first; flushes grouped averages to
// `evidence_events` (via EvidenceService.writeEvidence) only when enough
// pending rows have accumulated (flushThreshold) or when rows go stale
// (handled by flushStale()).

import { Inject, Injectable, Logger } from '@nestjs/common';
import { Database } from '../../../../common/database.js';
import type { PoolClient } from '../../../../common/pool.js';
import { EvidenceService } from '../../../evidence/evidence.service.js';
import { EVIDENCE_BASE_WEIGHT } from '@eva/core';
import type { GeneratedScene } from '../../dto/dynamic-script/shared/generated-script.dto.js';
import { EVIDENCE_BRIDGE_CONFIG } from '../../../assessment/dynamic-script.tokens.js';

export interface PlayedChoice {
  scene_id: string;
  choice_id: string;
}

export interface EvidenceBridgeConfig {
  /** Number of unflushed pending rows required before flushIfReady writes */
  flushThreshold: number;
}

@Injectable()
export class EvidenceBridgeService {
  private readonly logger = new Logger(EvidenceBridgeService.name);

  /**
   * Authoritative practice evidence weight. Imported from @eva/core so any
   * future change to EVIDENCE_BASE_WEIGHT.practice propagates automatically —
   * do NOT hardcode the 0.3 constant here.
   */
  private static readonly BASE_WEIGHT = EVIDENCE_BASE_WEIGHT.practice;

  constructor(
    private readonly db: Database,
    private readonly evidenceService: EvidenceService,
    @Inject(EVIDENCE_BRIDGE_CONFIG) private readonly config: EvidenceBridgeConfig,
  ) {}

  /**
   * Write one row per non-zero dimension signal — but ONLY for choices the
   * user actually played. Unchosen branches are excluded via playedPath so
   * we don't pollute evidence with branches the user never entered.
   */
  async accumulate(
    userId: string,
    scriptId: string,
    scenes: GeneratedScene[],
    playedPath: PlayedChoice[],
    query: Pick<PoolClient, 'query'> = this.db.pool,
  ): Promise<void> {
    const playedKeys = new Set<string>(
      playedPath.map((p) => `${p.scene_id}:${p.choice_id}`),
    );

    for (const scene of scenes) {
      for (const choice of scene.choices) {
        // [review-fix] Skip choices the user did NOT play
        if (!playedKeys.has(`${scene.scene_id}:${choice.choice_id}`)) continue;

        for (const [dimension, signal] of Object.entries(choice.dimension_signals)) {
          // Skip zero signals — they contribute no information
          if (signal === 0) continue;

          const metadata = {
            script_id: scriptId,
            scene_id: scene.scene_id,
            choice_id: choice.choice_id,
          };

          await query.query(
            `INSERT INTO pending_dynamic_script_evidence
               (user_id, script_id, dimension, delta, weight, metadata)
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [
              userId,
              scriptId,
              dimension,
              signal,
              EvidenceBridgeService.BASE_WEIGHT,
              JSON.stringify(metadata),
            ],
          );
        }
      }
    }
  }

  /**
   * Flush pending evidence to evidence_events when the user has accumulated
   * at least `flushThreshold` unflushed pending rows. The locked snapshot,
   * candidate writes and exact-ID marks commit together or all roll back.
   */
  async flushIfReady(userId: string): Promise<void> {
    const client = await this.db.pool.connect();
    try {
      await client.query('BEGIN');
      // Serialize before selecting: a waiting flush must read after the prior commit.
      await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [
        `dynamic-script-evidence:${userId}`,
      ]);
      const pending = await client.query<{
        id: string; script_id: string; dimension: string; delta: number | string;
      }>(
        `SELECT id, script_id, dimension, delta FROM pending_dynamic_script_evidence
         WHERE user_id = $1 AND flushed_at IS NULL ORDER BY id FOR UPDATE`,
        [userId],
      );
      if (pending.rows.length < this.config.flushThreshold || pending.rows.length === 0) {
        await client.query('COMMIT');
        return;
      }

      const groups = new Map<string, { scriptId: string; dimension: string; total: number; count: number }>();
      for (const row of pending.rows) {
        const key = JSON.stringify([row.script_id, row.dimension]);
        const group = groups.get(key) ?? { scriptId: row.script_id, dimension: row.dimension, total: 0, count: 0 };
        group.total += Number(row.delta);
        group.count++;
        groups.set(key, group);
      }
      const today = new Date().toISOString().slice(0, 10);
      for (const group of groups.values()) {
        const evidenceId = await this.evidenceService.writeEvidence({
          userId,
          dimension: group.dimension,
          delta: group.total / group.count,
          weight: EvidenceBridgeService.BASE_WEIGHT,
          sourceType: 'test',
          sourceId: group.scriptId,
          explanation: `dynamic_script_choice aggregated from ${group.count} pending rows`,
          evidenceKind: 'practice',
          candidate: true,
          localDate: today,
          epistemicSource: 'system_interaction',
          contentKind: 'simulation_choice',
          sourceIndependenceGroup: `dynamic-script:${group.scriptId}`,
          attribution: 'self',
        }, client);
        if (typeof evidenceId !== 'string' || !evidenceId.trim()) {
          throw new Error('Evidence writer returned no evidence ID');
        }
      }
      const marked = await client.query<{ id: string }>(
        `UPDATE pending_dynamic_script_evidence
           SET flushed_at = NOW()
           WHERE user_id = $1 AND id = ANY($2::uuid[]) AND flushed_at IS NULL
           RETURNING id`,
        [userId, pending.rows.map((row) => row.id)],
      );
      const markedIds = new Set(marked.rows.map((row) => row.id));
      if (markedIds.size !== pending.rows.length || pending.rows.some((row) => !markedIds.has(row.id))) {
        throw new Error('Failed to mark all selected pending evidence rows');
      }
      await client.query('COMMIT');
      this.logger.log(`Flushed evidence for user ${userId}: ${groups.size} groups`);
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * Find users with stale pending evidence (older than `olderThanDays`) and
   * try flushing them using the same threshold. No worker scheduler calls this.
   */
  async flushStale(olderThanDays: number): Promise<void> {
    const staleUsers = await this.db.pool.query<{ user_id: string }>(
      `SELECT DISTINCT user_id FROM pending_dynamic_script_evidence
         WHERE flushed_at IS NULL
           AND created_at < NOW() - ($1 || ' days')::INTERVAL`,
      [olderThanDays],
    );

    for (const row of staleUsers.rows) {
      try {
        await this.flushIfReady(row.user_id);
      } catch (err) {
        this.logger.error(
          `flushStale failed for user=${row.user_id}: ${String(err)}`,
        );
      }
    }
  }
}
