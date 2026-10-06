import { describe, expect, it, vi } from 'vitest';
import { createCorrectionWithdrawalHandler } from './correction-withdrawal-handler.js';

const event = {
  id: 'event-1',
  event_type: 'correction.withdraw_processed',
  aggregate_id: 'correction-1',
  payload_minimized: { evidence_id: 'evidence-1' },
};

describe('correction withdrawal outbox handler', () => {
  it('invalidates derived portrait revisions and clears a stale current pointer', async () => {
    const query = vi.fn(async () => ({ rows: [] }));
    const handler = createCorrectionWithdrawalHandler({ query });

    await handler(event);

    expect(query).toHaveBeenCalledWith(expect.stringContaining('JOIN portrait_revision_evidence'), ['evidence-1']);
    expect(query.mock.calls[0]?.[0]).toContain("SET state = 'invalidated'");
    expect(query.mock.calls[0]?.[0]).toContain('SET current_revision_id = NULL');
  });

  it('leaves malformed events pending by rejecting them', async () => {
    const query = vi.fn(async () => ({ rows: [] }));
    const handler = createCorrectionWithdrawalHandler({ query });

    await expect(handler({ ...event, payload_minimized: {} })).rejects.toThrow('missing evidence_id');
    expect(query).not.toHaveBeenCalled();
  });
});
