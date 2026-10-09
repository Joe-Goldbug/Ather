import { describe, expect, it, vi } from 'vitest';
import { ConsentService } from './consent.service.js';
import { AgentContextService } from '../agent-context/agent-context.service.js';

describe('Authorized Sharing and Agent Grants (Phase 4)', () => {
  it('creates an agent grant and issues receipt accurately labeled "Eva 记录的用户授权"', async () => {
    const mockQuery = vi.fn()
      // 1. rule lookup
      .mockResolvedValueOnce({ rows: [{ id: 'rule-approved-uuid' }] })
      // 2. insert grant
      .mockResolvedValueOnce({ rows: [] })
      // 3. insert third_party_sharing consent
      .mockResolvedValueOnce({ rows: [] })
      // 4. insert purpose consent
      .mockResolvedValueOnce({ rows: [] });

    const service = new ConsentService(
      { pool: { query: mockQuery } } as any,
      {} as any,
      {} as any,
    );

    const receipt = await service.createAgentGrant('user-1', {
      agentId: 'agent-clinical-advisor',
      purposeScope: 'evidence_collection',
      scopes: ['evidence:read'],
      expiresInDays: 7,
    });

    expect(receipt.receiptType).toBe('Eva 记录的用户授权');
    expect(receipt.auditNotice).toContain('非用户私钥签名');
    expect(receipt.agentId).toBe('agent-clinical-advisor');
    expect(receipt.purposeScope).toBe('evidence_collection');
    expect(receipt.scopes).toEqual(['evidence:read']);
    expect(receipt.status).toBe('active');
  });

  it('rejects access when grant is revoked or purpose does not match', async () => {
    const mockQuery = vi.fn();
    const service = new AgentContextService({
      pool: {
        connect: async () => ({
          query: mockQuery,
          release: () => {},
        }),
      },
    } as any);

    // Mock BEGIN
    mockQuery.mockResolvedValueOnce({});
    // Mock consent query: revoked or missing
    mockQuery.mockResolvedValueOnce({
      rows: [
        { consent_type: 'third_party_sharing', granted: true, revoked_at: new Date() }, // revoked!
      ],
    });
    // Mock ROLLBACK
    mockQuery.mockResolvedValueOnce({});

    await expect(
      service.buildAuthorizedContext('user-1', 'agent-advisor', 'evidence_collection'),
    ).rejects.toThrow();
  });

  it('revokes an agent grant and sets revoked_at timestamp immediately', async () => {
    const now = new Date();
    const mockQuery = vi.fn().mockResolvedValueOnce({
      rows: [{ id: 'grant-123', agent_id: 'agent-1', purpose_scope: 'evidence_collection', revoked_at: now }],
    });

    const service = new ConsentService(
      { pool: { query: mockQuery } } as any,
      {} as any,
      {} as any,
    );

    const res = await service.revokeAgentGrant('user-1', 'grant-123');
    expect(res.revoked).toBe(true);
    expect(res.grantId).toBe('grant-123');
    expect(res.revokedAt).toBe(now);
  });
});
