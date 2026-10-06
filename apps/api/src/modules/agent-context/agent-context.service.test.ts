import { ForbiddenException, GoneException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { AgentContextService } from './agent-context.service.js';
import { AgentContextController } from './agent-context.controller.js';
import { AgentContextV1Controller } from './agent-context-v1.controller.js';

describe('agent context authorization', () => {
  function fixture({ sharing = true, evidence = true, grant = true, scopes = ['evidence:read'] } = {}) {
    const query = vi.fn(async (sql: string, _params?: unknown[]) => {
      if (sql.includes('FROM consent_grants')) return { rows: [
        { consent_type: 'third_party_sharing', granted: sharing, revoked_at: sharing ? null : new Date() },
        { consent_type: 'weekly_review_analysis', granted: true, revoked_at: null },
        { consent_type: 'evidence_collection', granted: evidence, revoked_at: evidence ? null : new Date() },
      ] };
      if (sql.includes('FROM agent_scope_grants')) return { rows: grant ? [{ scopes }] : [] };
      if (sql.includes('portrait_eligible_evidence_v2')) return { rows: [{ dimension: 'work', count: '2', latest_at: null }] };
      return { rows: [] };
    });
    const release = vi.fn();
    const service = new AgentContextService({ pool: { connect: async () => ({ query, release }) } } as never);
    return { service, query, release };
  }

  it('does not disclose evidence when DB consent was revoked after an earlier snapshot', async () => {
    const { service, query, release } = fixture({ sharing: false });
    await expect(service.buildAuthorizedContext('u', 'agent', 'weekly_review_analysis', {
      third_party_sharing: true, weekly_review_analysis: true, evidence_collection: true,
    }))
      .rejects.toThrow(ForbiddenException);
    expect(query.mock.calls.map(([sql]) => sql)).toEqual([
      'BEGIN', expect.stringContaining('FROM consent_grants'), 'ROLLBACK',
    ]);
    expect(release).toHaveBeenCalledOnce();
  });

  it('retires legacy full and scope endpoints', async () => {
    const controller = new AgentContextController();
    await expect(controller.getFullContext({ user: { id: 'u' } } as never)).rejects.toThrow(GoneException);
    await expect(controller.checkScope({ user: { id: 'u' } } as never)).rejects.toThrow(GoneException);
  });

  it('denies invalid purpose before querying grant or evidence', async () => {
    const { service, query } = fixture();
    await expect(service.buildAuthorizedContext('u', 'agent', 'unknown')).rejects.toThrow(ForbiddenException);
    await expect(service.buildAuthorizedContext('u', '', 'weekly_review_analysis')).rejects.toThrow(ForbiddenException);
    expect(query).not.toHaveBeenCalled();
  });

  it('omits evidence when the approved grant lacks evidence:read or evidence consent', async () => {
    const { service, query } = fixture({ scopes: [] });
    const result = await service.buildAuthorizedContext('u', 'agent', 'weekly_review_analysis');
    expect(result.formal_evidence_summary).toEqual({});
    expect(result.consent).toEqual({ weekly_review_analysis: true });
    expect(query.mock.calls.some(([sql]) => sql.includes('portrait_eligible_evidence_v2'))).toBe(false);
  });

  it('denies an absent approved agent grant', async () => {
    const { service, query } = fixture({ grant: false });
    await expect(service.buildAuthorizedContext('u', 'agent', 'weekly_review_analysis')).rejects.toThrow(ForbiddenException);
    expect(query.mock.calls.at(-1)?.[0]).toBe('ROLLBACK');
  });

  it('locks current consent and approved grant until the formal evidence read commits', async () => {
    const { service, query } = fixture();
    const result = await service.buildAuthorizedContext('u', 'agent', 'weekly_review_analysis');
    expect(result.formal_evidence_summary.work.count).toBe(2);
    expect(result.consent).toEqual({ weekly_review_analysis: true, evidence_collection: true });
    expect(query.mock.calls.map(([sql]) => sql)).toEqual([
      'BEGIN', expect.stringContaining('FROM consent_grants'),
      expect.stringContaining('FROM agent_scope_grants'),
      expect.stringContaining('portrait_eligible_evidence_v2'), 'COMMIT',
    ]);
    expect(query.mock.calls[1][0]).toContain('FOR SHARE');
    expect(query.mock.calls[2][0]).toContain("r.status = 'approved'");
    expect(query.mock.calls[2][0]).toContain('FOR SHARE OF g, r');
    expect(query.mock.calls[2][1]).toEqual(['u', 'agent', 'weekly_review_analysis']);
  });

  it('omits evidence when its DB consent is revoked without denying an allowed purpose', async () => {
    const { service, query } = fixture({ evidence: false });
    const result = await service.buildAuthorizedContext('u', 'agent', 'weekly_review_analysis');
    expect(result.formal_evidence_summary).toEqual({});
    expect(result.consent).toEqual({ weekly_review_analysis: true });
    expect(query.mock.calls.some(([sql]) => sql.includes('portrait_eligible_evidence_v2'))).toBe(false);
  });

  it('v1 controller passes identity and purpose without a consent snapshot', async () => {
    const buildAuthorizedContext = vi.fn(async () => ({}));
    const controller = new AgentContextV1Controller({ buildAuthorizedContext } as never);
    await controller.getContext({ user: { id: 'u' } } as never, 'agent', 'weekly_review_analysis');
    expect(buildAuthorizedContext).toHaveBeenCalledWith('u', 'agent', 'weekly_review_analysis');
  });
});
