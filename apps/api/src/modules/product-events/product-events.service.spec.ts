import { BadRequestException, ConflictException } from '@nestjs/common';
import { ProductEventsService } from './product-events.service.js';

describe('ProductEventsService', () => {
  const event = {
    eventId: 'evt-1',
    roundId: 'round-1',
    eventName: 'round_started' as const,
    contentVersion: 'theme-v1',
    occurredAt: '2026-09-02T00:00:00.000Z',
  };

  it('persists the authenticated user instead of a client supplied identity', async () => {
    const query = jest.fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: 'event-row-1' }] });
    const service = new ProductEventsService({ pool: { query } } as never);

    await service.record('user-from-session', event);

    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO product_events'),
      expect.arrayContaining(['evt-1', 'user-from-session', 'round-1']),
    );
  });

  it('rejects an event id reused with different content', async () => {
    const query = jest.fn().mockResolvedValue({
      rows: [{
        event_id: 'evt-1',
        round_id: 'different-round',
        event_name: 'round_started',
        content_version: 'theme-v1',
        payload_hash: 'different',
      }],
    });
    const service = new ProductEventsService({ pool: { query } } as never);

    await expect(service.record('user-from-session', event)).rejects.toBeInstanceOf(ConflictException);
  });

  it('rejects a malformed optional session id before it can become a database error', async () => {
    const service = new ProductEventsService({ pool: { query: jest.fn() } } as never);

    await expect(service.record('user-from-session', { ...event, sessionId: 'not-a-uuid' }))
      .rejects.toBeInstanceOf(BadRequestException);
  });
});
