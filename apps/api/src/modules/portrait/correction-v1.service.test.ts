import { describe, expect, it, vi } from 'vitest';
import { CorrectionV1Service } from './correction-v1.service.js';

const USER_ID = '00000000-0000-4000-8000-000000000001';
const CORRECTION_ID = '00000000-0000-4000-8000-000000000002';
const OPERATION_ID = '00000000-0000-4000-8000-000000000003';

function createClient() {
  const query = vi.fn(async (sql: string) => {
    if (sql.includes('FROM correction_record_revisions')) return { rows: [] };
    if (sql.includes('FROM correction_records')) {
      return {
        rows: [{
          id: CORRECTION_ID,
          current_revision_number: 1,
          state: 'pending_validation',
          candidate_evidence_id: '00000000-0000-4000-8000-000000000004',
        }],
      };
    }
    return { rows: [] };
  });
  return { query, release: vi.fn() };
}

describe('CorrectionV1Service', () => {
  it('withdraws only through a new immutable revision and retires the candidate evidence', async () => {
    const client = createClient();
    const service = new CorrectionV1Service({ pool: { connect: async () => client } } as never);

    const result = await service.withdraw(USER_ID, CORRECTION_ID, {
      operation_id: OPERATION_ID,
      revision_number: 1,
    });

    expect(result).toEqual({ correction_id: CORRECTION_ID, revision_number: 2, state: 'withdrawn', replayed: false });
    const sql = client.query.mock.calls.map(([statement]) => statement).join('\n');
    expect(sql).toContain('INSERT INTO correction_record_revisions');
    expect(sql).toContain("SET portrait_status = 'withdrawn'");
    expect(sql).not.toContain('correction.validation_requested');
    expect(sql).toContain("jsonb_build_object('correction_id', $1::uuid, 'evidence_id', $2::uuid)");
  });

  it('retries as pending validation without promoting candidate evidence', async () => {
    const client = createClient();
    const service = new CorrectionV1Service({ pool: { connect: async () => client } } as never);

    const result = await service.retry(USER_ID, CORRECTION_ID, {
      operation_id: OPERATION_ID,
      revision_number: 1,
    });

    expect(result.state).toBe('pending_validation');
    const sql = client.query.mock.calls.map(([statement]) => statement).join('\n');
    expect(sql).toContain("'correction.validation_requested'");
    expect(sql).not.toContain("portrait_status = 'formal'");
    expect(sql).toContain("jsonb_build_object('correction_id', $1::uuid, 'revision_number', $2::integer)");
  });
});
