import { BadRequestException, ConflictException, GoneException, Injectable, NotFoundException } from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import type { UnderstandingAction, UnderstandingOutput, UnderstandingSourceRef } from '@eva/core';
import { Database } from '../../common/database.js';
import { UnderstandingSourceService, type ResolvedUnderstandingSource } from './understanding-source.js';
import { generateUnderstanding, UNDERSTANDING_PROMPT_VERSION } from './understanding.generator.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const LOCALES = new Set(['zh-CN', 'en', 'ja', 'es']);
const ACTIONS = new Set<UnderstandingAction>(['message', 'correction', 'summarize', 'skip']);

type SessionRow = {
  id: string; user_id: string; source_ref: UnderstandingSourceRef; source_snapshot: Record<string, unknown>;
  locale: string; state: 'open' | 'closed'; version: number; revoked_at: string | null;
  saved_turn_id: string | null; saved_at: string | null; expires_at: string | null;
  active_turn_id: string | null; generation_token: string | null; lease_until: string | null;
  created_at: string; updated_at?: string;
};
export type UnderstandingTurn = {
  id: string; seq: number; action: UnderstandingAction; text: string | null;
  parent_turn_id: string | null; status: 'pending' | 'generating' | 'complete' | 'failed' | 'cancelled';
  output: UnderstandingOutput | null; error_code: string | null; model: string | null;
  prompt_version: string | null; attempt_count: number; created_at: string; completed_at: string | null;
};
export type UnderstandingSessionView = Omit<SessionRow, 'user_id' | 'generation_token'> & {
  turns?: UnderstandingTurn[];
  capabilities: { can_generate: boolean; can_save: boolean; can_reopen: boolean };
};
export type CreateUnderstandingCommand = {
  operation_id: string; source_ref: UnderstandingSourceRef; locale?: string; processing_consent: boolean;
};
export type AppendUnderstandingTurnCommand = {
  operation_id: string; expected_version: number; action: UnderstandingAction; text?: string; parent_turn_id?: string;
};

function hash(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}
function assertUuid(value: unknown, code = 'invalid_input'): asserts value is string {
  if (typeof value !== 'string' || !UUID.test(value.trim())) throw new BadRequestException({ code });
}
function assertVersion(value: unknown): asserts value is number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1) throw new BadRequestException({ code: 'invalid_input' });
}
function assertText(action: UnderstandingAction, value: unknown): string | null {
  if (action === 'message' || action === 'correction') {
    if (typeof value !== 'string' || value.trim().length < 1 || value.trim().length > 2_000) {
      throw new BadRequestException({ code: 'invalid_input' });
    }
    return value.trim();
  }
  if (value !== undefined && value !== null && value !== '') throw new BadRequestException({ code: 'invalid_input' });
  return null;
}
function isExpired(value: string | null): boolean { return value !== null && new Date(value).getTime() <= Date.now(); }

@Injectable()
export class UnderstandingService {
  constructor(private readonly db: Database, private readonly sources: UnderstandingSourceService) {}

  private view(row: SessionRow, turns?: UnderstandingTurn[]): UnderstandingSessionView {
    const latest = turns?.at(-1);
    return {
      id: row.id, source_ref: row.source_ref, source_snapshot: row.source_snapshot, locale: row.locale,
      state: row.state, version: row.version, revoked_at: row.revoked_at, saved_turn_id: row.saved_turn_id,
      saved_at: row.saved_at, expires_at: row.expires_at, active_turn_id: row.active_turn_id,
      lease_until: row.lease_until, created_at: row.created_at, updated_at: row.updated_at,
      ...(turns ? { turns } : {}),
      capabilities: {
        can_generate: row.state === 'open' && !row.revoked_at && !isExpired(row.expires_at) && !!latest && latest.status === 'pending',
        can_save: row.state === 'open' && !row.revoked_at && !!latest?.output && latest.output.kind === 'understanding',
        can_reopen: row.state === 'closed' && !row.revoked_at && !isExpired(row.expires_at),
      },
    };
  }

  async create(userId: string, command: CreateUnderstandingCommand): Promise<UnderstandingSessionView> {
    if (command?.processing_consent !== true) throw new BadRequestException({ code: 'processing_consent_required' });
    assertUuid(command?.operation_id);
    const locale = LOCALES.has(command.locale ?? 'zh-CN') ? command.locale ?? 'zh-CN' : 'zh-CN';
    const source = await this.sources.resolve(userId, command.source_ref);
    const requestHash = hash({ source_ref: source.sourceRef, locale, processing_consent: true });
    const inserted = await this.db.pool.query<SessionRow>(
      `INSERT INTO understanding_sessions
        (id, user_id, create_operation_id, create_request_hash, source_ref, source_snapshot, locale,
         state, version, processing_authorized_at, expires_at)
       VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7, 'open', 1, NOW(), NOW() + INTERVAL '24 hours')
       ON CONFLICT (user_id, create_operation_id)
       DO UPDATE SET id = understanding_sessions.id
       WHERE understanding_sessions.create_request_hash = EXCLUDED.create_request_hash
       RETURNING id, user_id, source_ref, source_snapshot, locale, state, version, revoked_at, saved_turn_id,
                 saved_at, expires_at, active_turn_id, generation_token, lease_until, created_at, updated_at`,
      [randomUUID(), userId, command.operation_id, requestHash, JSON.stringify(source.sourceRef), JSON.stringify(source.snapshot), locale],
    );
    const row = inserted.rows[0];
    if (!row) throw new ConflictException({ code: 'operation_conflict' });
    return this.view(row);
  }

  async appendTurn(userId: string, sessionId: string, command: AppendUnderstandingTurnCommand): Promise<UnderstandingTurn> {
    assertUuid(sessionId); assertUuid(command?.operation_id); assertVersion(command?.expected_version);
    if (!ACTIONS.has(command?.action)) throw new BadRequestException({ code: 'invalid_input' });
    const text = assertText(command.action, command.text);
    if (command.parent_turn_id !== undefined) assertUuid(command.parent_turn_id);
    if (command.action === 'correction' && !command.parent_turn_id) {
      throw new BadRequestException({ code: 'correction_parent_required' });
    }
    const requestHash = hash({ action: command.action, text, parent_turn_id: command.parent_turn_id ?? null });
    const client = await this.db.pool.connect();
    try {
      await client.query('BEGIN');
      const sessions = await client.query<SessionRow>(
        `SELECT id, user_id, source_ref, source_snapshot, locale, state, version, revoked_at, saved_turn_id,
                saved_at, expires_at, active_turn_id, generation_token, lease_until, created_at, updated_at
           FROM understanding_sessions WHERE id = $1 AND user_id = $2 FOR UPDATE`, [sessionId, userId],
      );
      const session = sessions.rows[0];
      if (!session) throw new NotFoundException({ code: 'understanding_not_found' });
      if (isExpired(session.expires_at)) throw new GoneException({ code: 'understanding_expired' });
      if (session.revoked_at) throw new ConflictException({ code: 'processing_consent_revoked' });
      if (session.state !== 'open') throw new ConflictException({ code: 'understanding_closed' });
      const existing = await client.query<UnderstandingTurn & { request_hash: string }>(
        `SELECT id, seq, action, text, parent_turn_id, status, output, error_code, model, prompt_version,
                attempt_count, created_at, completed_at, request_hash
           FROM understanding_turns WHERE session_id = $1 AND operation_id = $2`, [sessionId, command.operation_id],
      );
      if (existing.rows[0]) {
        if (existing.rows[0].request_hash !== requestHash) throw new ConflictException({ code: 'operation_conflict' });
        await client.query('COMMIT');
        return existing.rows[0];
      }
      if (session.version !== command.expected_version) throw new ConflictException({ code: 'version_conflict' });
      const count = await client.query<{ seq: number }>(
        `SELECT COALESCE(MAX(seq), 0) + 1 AS seq FROM understanding_turns WHERE session_id = $1`, [sessionId],
      );
      if ((count.rows[0]?.seq ?? 1) > 40) throw new BadRequestException({ code: 'turn_limit_reached' });
      if (command.parent_turn_id) {
        const parent = await client.query<{ id: string }>(
          `SELECT id FROM understanding_turns WHERE id = $1 AND session_id = $2 AND output->>'kind' = 'understanding'`,
          [command.parent_turn_id, sessionId],
        );
        if (!parent.rows[0]) throw new BadRequestException({ code: 'invalid_input' });
      }
      await client.query(
        `UPDATE understanding_sessions SET version = version + 1, active_turn_id = NULL,
           generation_token = NULL, lease_until = NULL, updated_at = NOW() WHERE id = $1 AND user_id = $2`,
        [sessionId, userId],
      );
      const turn = await client.query<UnderstandingTurn>(
        `INSERT INTO understanding_turns
          (id, session_id, user_id, seq, operation_id, request_hash, action, text, parent_turn_id, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'pending')
         RETURNING id, seq, action, text, parent_turn_id, status, output, error_code, model, prompt_version,
                   attempt_count, created_at, completed_at`,
        [randomUUID(), sessionId, userId, count.rows[0]?.seq ?? 1, command.operation_id, requestHash,
          command.action, text, command.parent_turn_id ?? null],
      );
      await client.query('COMMIT');
      return turn.rows[0]!;
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      throw error;
    } finally { client.release(); }
  }

  async get(userId: string, sessionId: string): Promise<UnderstandingSessionView> {
    assertUuid(sessionId);
    const session = await this.db.pool.query<SessionRow>(
      `SELECT id, user_id, source_ref, source_snapshot, locale, state, version, revoked_at, saved_turn_id,
              saved_at, expires_at, active_turn_id, generation_token, lease_until, created_at, updated_at
         FROM understanding_sessions WHERE id = $1 AND user_id = $2`, [sessionId, userId],
    );
    if (!session.rows[0]) throw new NotFoundException({ code: 'understanding_not_found' });
    const turns = await this.db.pool.query<UnderstandingTurn>(
      `SELECT id, seq, action, text, parent_turn_id, status, output, error_code, model, prompt_version,
              attempt_count, created_at, completed_at
         FROM understanding_turns WHERE session_id = $1 AND user_id = $2 ORDER BY seq ASC`, [sessionId, userId],
    );
    return this.view(session.rows[0], turns.rows);
  }

  async listSaved(userId: string): Promise<UnderstandingSessionView[]> {
    const sessions = await this.db.pool.query<SessionRow>(
      `SELECT id, user_id, source_ref, source_snapshot, locale, state, version, revoked_at, saved_turn_id,
              saved_at, expires_at, active_turn_id, generation_token, lease_until, created_at, updated_at
         FROM understanding_sessions WHERE user_id = $1 AND saved_at IS NOT NULL
         ORDER BY saved_at DESC LIMIT 50`, [userId],
    );
    return sessions.rows.map((session) => this.view(session));
  }

  async generate(userId: string, sessionId: string, turnId: string): Promise<UnderstandingTurn> {
    assertUuid(sessionId); assertUuid(turnId);
    const lease = randomUUID();
    const claim = await this.db.pool.query<SessionRow>(
      `UPDATE understanding_sessions
          SET active_turn_id = $3, generation_token = $4, lease_until = NOW() + INTERVAL '45 seconds', updated_at = NOW()
        WHERE id = $1 AND user_id = $2 AND state = 'open' AND revoked_at IS NULL
          AND (expires_at IS NULL OR expires_at > NOW())
          AND (active_turn_id IS NULL OR lease_until < NOW())
      RETURNING id, user_id, source_ref, source_snapshot, locale, state, version, revoked_at, saved_turn_id,
                saved_at, expires_at, active_turn_id, generation_token, lease_until, created_at, updated_at`,
      [sessionId, userId, turnId, lease],
    );
    const session = claim.rows[0];
    if (!session) throw new ConflictException({ code: 'generation_busy_or_unavailable' });
    const current = await this.db.pool.query<UnderstandingTurn>(
      `UPDATE understanding_turns SET status = 'generating', attempt_count = attempt_count + 1
        WHERE id = $1 AND session_id = $2 AND user_id = $3 AND status = 'pending'
      RETURNING id, seq, action, text, parent_turn_id, status, output, error_code, model, prompt_version,
                attempt_count, created_at, completed_at`, [turnId, sessionId, userId],
    );
    if (!current.rows[0]) {
      await this.releaseLease(userId, sessionId, turnId, lease);
      throw new ConflictException({ code: 'turn_not_pending' });
    }
    try {
      const source = await this.sources.resolve(userId, session.source_ref);
      const history = await this.db.pool.query<UnderstandingTurn>(
        `SELECT id, seq, action, text, parent_turn_id, status, output, error_code, model, prompt_version,
                attempt_count, created_at, completed_at
           FROM understanding_turns WHERE session_id = $1 AND user_id = $2 AND seq <= $3 ORDER BY seq ASC`,
        [sessionId, userId, current.rows[0].seq],
      );
      const evidence = [...source.evidence, ...history.rows
        .filter((item) => (item.action === 'message' || item.action === 'correction') && item.text)
        .map((item) => ({ id: `turn:${item.id}`, kind: 'user_statement' as const, text: item.text! }))];
      const parent = current.rows[0].parent_turn_id
        ? history.rows.find((item) => item.id === current.rows[0].parent_turn_id && item.output)?.output ?? null
        : null;
      const generated = await generateUnderstanding({
        action: current.rows[0].action, text: current.rows[0].text, locale: session.locale, evidence,
        prior_turn: parent && current.rows[0].parent_turn_id ? { id: current.rows[0].parent_turn_id, output: parent } : null,
      });
      const stored = await this.db.pool.query<UnderstandingTurn>(
        `UPDATE understanding_turns SET status = 'complete', output = $4::jsonb, model = $5, prompt_version = $6,
           completed_at = NOW(), error_code = NULL
         WHERE id = $1 AND session_id = $2 AND user_id = $3
         RETURNING id, seq, action, text, parent_turn_id, status, output, error_code, model, prompt_version,
                   attempt_count, created_at, completed_at`,
        [turnId, sessionId, userId, JSON.stringify(generated.output), generated.model, UNDERSTANDING_PROMPT_VERSION],
      );
      await this.releaseLease(userId, sessionId, turnId, lease);
      return stored.rows[0]!;
    } catch (error) {
      await this.db.pool.query(
        `UPDATE understanding_turns SET status = 'failed', error_code = 'generation_failed', completed_at = NOW()
          WHERE id = $1 AND session_id = $2 AND user_id = $3`, [turnId, sessionId, userId],
      ).catch(() => {});
      await this.releaseLease(userId, sessionId, turnId, lease);
      throw error;
    }
  }

  private async releaseLease(userId: string, sessionId: string, turnId: string, lease: string): Promise<void> {
    await this.db.pool.query(
      `UPDATE understanding_sessions SET active_turn_id = NULL, generation_token = NULL, lease_until = NULL, updated_at = NOW()
        WHERE id = $1 AND user_id = $2 AND active_turn_id = $3 AND generation_token = $4`,
      [sessionId, userId, turnId, lease],
    );
  }

  async setState(userId: string, sessionId: string, action: 'close' | 'reopen' | 'save' | 'revoke'): Promise<UnderstandingSessionView> {
    assertUuid(sessionId);
    const clauses: Record<typeof action, string> = {
      close: "state = 'closed'",
      reopen: "state = 'open'",
      save: "saved_turn_id = (SELECT id FROM understanding_turns WHERE session_id = understanding_sessions.id AND user_id = understanding_sessions.user_id AND output->>'kind' = 'understanding' ORDER BY seq DESC LIMIT 1), saved_at = NOW()",
      revoke: "revoked_at = NOW(), state = 'closed', active_turn_id = NULL, generation_token = NULL, lease_until = NULL",
    };
    const updated = await this.db.pool.query<SessionRow>(
      `UPDATE understanding_sessions SET ${clauses[action]}, updated_at = NOW()
        WHERE id = $1 AND user_id = $2
          AND (${action === 'reopen' ? "revoked_at IS NULL AND (expires_at IS NULL OR expires_at > NOW())" : 'TRUE'})
        RETURNING id, user_id, source_ref, source_snapshot, locale, state, version, revoked_at, saved_turn_id,
                  saved_at, expires_at, active_turn_id, generation_token, lease_until, created_at, updated_at`, [sessionId, userId],
    );
    if (!updated.rows[0]) throw new NotFoundException({ code: 'understanding_not_found_or_expired' });
    if (action === 'save' && !updated.rows[0].saved_turn_id) throw new ConflictException({ code: 'no_understanding_to_save' });
    return this.get(userId, sessionId);
  }

  async remove(userId: string, sessionId: string): Promise<void> {
    assertUuid(sessionId);
    const removed = await this.db.pool.query('DELETE FROM understanding_sessions WHERE id = $1 AND user_id = $2 RETURNING id', [sessionId, userId]);
    if (!removed.rows[0]) throw new NotFoundException({ code: 'understanding_not_found' });
  }
}
