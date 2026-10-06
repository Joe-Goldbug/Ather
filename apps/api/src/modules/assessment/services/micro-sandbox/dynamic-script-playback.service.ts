import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { DIMENSION_KEYS } from '@eva/core';
import { Database } from '../../../../common/database.js';
import { EvidenceBridgeService, type PlayedChoice } from './evidence-bridge.service.js';
import type { GeneratedScene } from '../../dto/dynamic-script/shared/generated-script.dto.js';

export interface DynamicScriptPlayResponse {
  script_id: string;
  played_path: PlayedChoice[];
  completed: true;
  replayed: boolean;
}

interface PlaybackRow {
  id: string;
  scenes: GeneratedScene[];
  generation_status: string;
  session_status: string;
  played_path: PlayedChoice[] | null;
  play_completed_at: Date | null;
}

@Injectable()
export class DynamicScriptPlaybackService {
  private readonly logger = new Logger(DynamicScriptPlaybackService.name);
  constructor(private readonly db: Database, private readonly bridge: EvidenceBridgeService) {}

  async play(userId: string, scriptId: string, playedPath: PlayedChoice[]): Promise<DynamicScriptPlayResponse> {
    const result = await this.persistPlay(userId, scriptId, playedPath);
    try {
      await this.bridge.flushIfReady(userId);
    } catch (error) {
      // Answers are already durable. A flush failure must keep pending rows
      // retryable, not turn a successful answer save into a false rollback.
      this.logger.warn(`Playback saved; evidence flush remains pending for user=${userId}: ${String(error)}`);
    }
    return result;
  }

  private async persistPlay(userId: string, scriptId: string, playedPath: PlayedChoice[]): Promise<DynamicScriptPlayResponse> {
    const client = await this.db.pool.connect();
    try {
      await client.query('BEGIN');
      const loaded = await client.query<PlaybackRow>(
        `SELECT d.id, d.scenes, d.played_path, d.play_completed_at,
                g.status AS generation_status, s.status AS session_status
           FROM dynamic_scripts d
           JOIN dynamic_script_generations g ON g.id = d.generation_id
                AND g.session_id = d.session_id AND g.user_id = d.user_id
           JOIN dynamic_script_sessions s ON s.id = d.session_id AND s.user_id = d.user_id
           WHERE d.id = $1 AND d.user_id = $2 FOR UPDATE OF d`,
        [scriptId, userId],
      );
      const row = loaded.rows[0];
      if (!row) throw new NotFoundException('Script not found');
      if (row.generation_status !== 'ready' || row.session_status === 'abandoned') {
        throw new ConflictException('Script is not playable');
      }
      if (row.play_completed_at) {
        const samePath = Array.isArray(playedPath) && row.played_path?.length === playedPath.length
          && row.played_path.every((step, i) => step.scene_id === playedPath[i]?.scene_id && step.choice_id === playedPath[i]?.choice_id);
        if (!samePath) throw new ConflictException('Script was already played with a different path');
        await client.query('COMMIT');
        return { script_id: row.id, played_path: row.played_path!, completed: true, replayed: true };
      }

      this.validatePath(row.scenes, playedPath);
      const stored = await client.query<{ id: string }>(
        `UPDATE dynamic_scripts SET played_path = $3::jsonb, play_completed_at = NOW()
         WHERE id = $1 AND user_id = $2 RETURNING id`,
        [scriptId, userId, JSON.stringify(playedPath)],
      );
      if (!stored.rows[0]) throw new ConflictException('Playback could not be saved');
      // Both writes commit together before the separate candidate flush.
      await this.bridge.accumulate(userId, scriptId, row.scenes, playedPath, client);
      await client.query('COMMIT');
      return { script_id: row.id, played_path: playedPath, completed: true, replayed: false };
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      throw error;
    } finally {
      client.release();
    }
  }

  private validatePath(scenes: GeneratedScene[], path: PlayedChoice[]): void {
    const invalid = () => { throw new BadRequestException('Invalid or incomplete played path'); };
    if (!Array.isArray(scenes) || !scenes.length || !Array.isArray(path) || !path.length) invalid();
    const byId = new Map(scenes.map((scene) => [scene?.scene_id, scene]));
    if (byId.size !== scenes.length) invalid();
    const visited = new Set<string>();
    let nextId: string | undefined = scenes[0]?.scene_id;
    for (const step of path) {
      if (!step || typeof step.scene_id !== 'string' || typeof step.choice_id !== 'string'
          || !step.scene_id || !step.choice_id || step.scene_id !== nextId || visited.has(step.scene_id)) invalid();
      const scene = byId.get(step.scene_id);
      if (!scene || !Array.isArray(scene.choices)) invalid();
      const choices = scene.choices.filter((choice) => choice?.choice_id === step.choice_id);
      if (choices.length !== 1) invalid();
      const signals = choices[0].dimension_signals;
      if (!signals || typeof signals !== 'object' || Array.isArray(signals) || !Object.keys(signals).length) invalid();
      for (const [dimension, signal] of Object.entries(signals)) {
        if (!(DIMENSION_KEYS as readonly string[]).includes(dimension)
            || typeof signal !== 'number' || !Number.isFinite(signal) || signal < 0 || signal > 1) invalid();
      }
      visited.add(step.scene_id);
      const map = scene.next_scene_map;
      if (!map || typeof map !== 'object' || Array.isArray(map)) invalid();
      const next = Object.prototype.hasOwnProperty.call(map, step.choice_id) ? map[step.choice_id] : undefined;
      if (next === undefined || next === '' || next === 'end') nextId = undefined;
      else {
        if (typeof next !== 'string' || !byId.has(next) || visited.has(next)) invalid();
        nextId = next;
      }
    }
    if (nextId !== undefined) invalid();
  }
}
