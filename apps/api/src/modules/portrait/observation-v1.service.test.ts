import { describe, expect, it } from 'vitest';
import { ObservationV1Service } from './observation-v1.service.js';

describe('ObservationV1Service', () => {
  it('withholds rationale when a claim has no linked evidence', async () => {
    const service = new ObservationV1Service({
      pool: { query: async () => ({ rows: [{
        claim_id: 'claim-1', canonical_claim: { text: 'Unsupported' },
        limitations: [], linked_evidence: 0, formal_evidence: 0,
      }] }) },
    } as never);

    await expect(service.getRationale('user-1', 'observation-1', 'revision-1')).resolves.toBeNull();
  });

  it('does not publish synthetic scene observations or unsupported revisions', async () => {
    let sql = '';
    const service = new ObservationV1Service({
      pool: { query: async (statement: string) => { sql = statement; return { rows: [] }; } },
    } as never);

    await expect(service.list('user-1')).resolves.toEqual([]);
    expect(sql).toContain('r.id = o.current_revision_id');
    expect(sql).toContain('r.candidate_id IS NOT NULL');
    expect(sql).toContain('JOIN portrait_eligible_evidence_v2 formal');
    expect(sql).toContain('AND NOT EXISTS');
    expect(sql).toContain('formal.user_id = o.user_id');
    expect(sql).toContain('observation_responses');
    expect(sql).toContain('theme_assessment_result_responses');
  });

  it('marks a refuted revision as needing follow-up without removing its source text', async () => {
    const service = new ObservationV1Service({
      pool: { query: async () => ({ rows: [{
        observation_id: 'observation-1', revision_id: 'revision-1', final_text: '原观察',
        fallback_text: null, published_at: null, latest_response_action: 'refute',
      }] }) },
    } as never);

    await expect(service.list('user-1')).resolves.toEqual([{
      observation_id: 'observation-1', revision_id: 'revision-1', text: '原观察',
      published_at: null, feedback_state: 'needs_follow_up',
    }]);
  });

  it('counts only evidence owned by the observation user in rationale', async () => {
    let sql = '';
    const service = new ObservationV1Service({
      pool: { query: async (statement: string) => {
        sql = statement;
        return { rows: [] };
      } },
    } as never);

    await service.getRationale('user-1', 'observation-1', 'revision-1');
    expect(sql).toContain('formal.user_id = o.user_id');
  });

  it('withholds a rationale if any linked evidence is no longer formal', async () => {
    const service = new ObservationV1Service({
      pool: {
        query: async () => ({
          rows: [{
            claim_id: 'claim-1',
            canonical_claim: { text: 'A bounded observation.' },
            limitations: [],
            linked_evidence: 2,
            formal_evidence: 1,
          }],
        }),
      },
    } as never);

    await expect(service.getRationale('user-1', 'observation-1', 'revision-1')).resolves.toBeNull();
  });

  it('returns only canonical claims and limitations, never raw evidence text', async () => {
    const service = new ObservationV1Service({
      pool: {
        query: async () => ({
          rows: [{
            claim_id: 'claim-1',
            canonical_claim: { text: 'A bounded observation.' },
            limitations: ['insufficient_evidence'],
            linked_evidence: 1,
            formal_evidence: 1,
          }],
        }),
      },
    } as never);

    await expect(service.getRationale('user-1', 'observation-1', 'revision-1')).resolves.toEqual({
      observation_id: 'observation-1',
      revision_id: 'revision-1',
      feedback_state: 'uncontested',
      claims: [{
        claim_id: 'claim-1',
        canonical_claim: { text: 'A bounded observation.' },
        limitations: ['insufficient_evidence'],
      }],
    });
  });
});
