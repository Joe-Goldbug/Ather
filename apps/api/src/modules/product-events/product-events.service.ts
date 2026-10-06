import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { Database } from '../../common/database.js';

export const PRODUCT_EVENT_NAMES = [
  'round_started',
  'node_presented',
  'choice_selected',
  'answer_submitted',
  'branch_entered',
  'node_abandoned',
  'round_completed',
  'result_viewed',
  'result_confirmed',
  'result_refuted',
  'feedback_submitted',
] as const;

export type ProductEventName = (typeof PRODUCT_EVENT_NAMES)[number];

export interface CreateProductEvent {
  eventId: string;
  roundId: string;
  eventName: ProductEventName;
  contentVersion: string;
  occurredAt: string;
  sessionId?: string;
  nodeId?: string;
  sceneId?: string;
  choiceId?: string;
  pathId?: string;
  previousNodeId?: string;
  nextNodeId?: string;
  durationMs?: number;
  metadata?: Record<string, unknown>;
}

type ExistingEvent = {
  event_id: string;
  user_id: string;
  round_id: string;
  event_name: ProductEventName;
  content_version: string;
};

@Injectable()
export class ProductEventsService {
  constructor(private readonly db: Database) {}

  async record(userId: string, event: CreateProductEvent): Promise<{ id: string; replayed: boolean }> {
    this.validate(event);

    const existing = await this.db.pool.query<ExistingEvent>(
      `SELECT event_id, user_id, round_id, event_name, content_version
       FROM product_events
       WHERE event_id = $1
       LIMIT 1`,
      [event.eventId],
    );

    if (existing.rows[0]) {
      const row = existing.rows[0];
      if (
        row.user_id !== userId ||
        row.round_id !== event.roundId ||
        row.event_name !== event.eventName ||
        row.content_version !== event.contentVersion
      ) {
        throw new ConflictException('event_id_reused_with_different_payload');
      }
      return { id: event.eventId, replayed: true };
    }

    const inserted = await this.db.pool.query<{ id: string }>(
      `INSERT INTO product_events (
         event_id, user_id, round_id, session_id, event_name, content_version,
         node_id, scene_id, choice_id, path_id, previous_node_id, next_node_id,
         duration_ms, metadata, occurred_at
       )
       VALUES ($1, $2, $3, $4::uuid, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14::jsonb, $15)
       ON CONFLICT (event_id) DO NOTHING
       RETURNING id`,
      [
        event.eventId,
        userId,
        event.roundId,
        event.sessionId ?? null,
        event.eventName,
        event.contentVersion,
        event.nodeId ?? null,
        event.sceneId ?? null,
        event.choiceId ?? null,
        event.pathId ?? null,
        event.previousNodeId ?? null,
        event.nextNodeId ?? null,
        event.durationMs ?? null,
        JSON.stringify(event.metadata ?? {}),
        new Date(event.occurredAt),
      ],
    );

    if (inserted.rows[0]) return { id: inserted.rows[0].id, replayed: false };
    return this.record(userId, event);
  }

  private validate(event: CreateProductEvent) {
    if (!event.eventId?.trim() || event.eventId.length > 128) {
      throw new BadRequestException('invalid_event_id');
    }
    if (!event.roundId?.trim() || event.roundId.length > 128) {
      throw new BadRequestException('invalid_round_id');
    }
    if (!PRODUCT_EVENT_NAMES.includes(event.eventName)) {
      throw new BadRequestException('invalid_event_name');
    }
    if (!event.contentVersion?.trim() || event.contentVersion.length > 128) {
      throw new BadRequestException('invalid_content_version');
    }
    const occurredAt = new Date(event.occurredAt);
    if (Number.isNaN(occurredAt.getTime())) throw new BadRequestException('invalid_occurred_at');
    if (!Number.isInteger(event.durationMs) && event.durationMs !== undefined) {
      throw new BadRequestException('invalid_duration_ms');
    }
    if (event.durationMs !== undefined && (event.durationMs < 0 || event.durationMs > 86_400_000)) {
      throw new BadRequestException('invalid_duration_ms');
    }
    if (event.sessionId && !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(event.sessionId)) {
      throw new BadRequestException('invalid_session_id');
    }
  }
}
