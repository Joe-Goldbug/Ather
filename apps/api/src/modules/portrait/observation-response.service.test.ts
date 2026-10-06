import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { ObservationResponseService } from './observation-response.service.js';

const operationId = '11111111-1111-4111-8111-111111111111';

describe('ObservationResponseService', () => {
  it('rejects reuse of an operation ID for a different observation', async () => {
    const client = {
      query: async (sql: string) => {
        if (sql.includes('FROM observation_responses')) return { rows: [{
          id: 'response-1', request_fingerprint: createHash('sha256').update(JSON.stringify({ action: 'confirm', explanation: '' })).digest('hex'), action: 'confirm',
          published_observation_revision_id: 'revision-1', published_observation_id: 'observation-1',
        }] };
        return { rows: [] };
      },
      release: () => undefined,
    };
    const service = new ObservationResponseService({ pool: { connect: async () => client } } as never);

    await expect(service.respond('user-1', 'observation-2', 'revision-1', {
      operation_id: operationId, action: 'confirm',
    })).rejects.toMatchObject({ response: { code: 'idempotency_key_reused' } });
  });

  it('replays a response only for the original observation and revision', async () => {
    const client = {
      query: async (sql: string) => {
        if (sql.includes('FROM observation_responses')) return { rows: [{
          id: 'response-1', request_fingerprint: createHash('sha256').update(JSON.stringify({ action: 'confirm', explanation: '' })).digest('hex'),
          action: 'confirm', published_observation_revision_id: 'revision-1', published_observation_id: 'observation-1',
        }] };
        if (sql.includes('FROM correction_records')) return { rows: [] };
        return { rows: [] };
      },
      release: () => undefined,
    };
    const service = new ObservationResponseService({ pool: { connect: async () => client } } as never);

    await expect(service.respond('user-1', 'observation-1', 'revision-1', {
      operation_id: operationId, action: 'confirm',
    })).resolves.toMatchObject({ response_id: 'response-1', state: 'confirmed', replayed: true });
  });

  it('records confirm without creating candidate evidence', async () => {
    const statements: string[] = [];
    const client = {
      query: async (sql: string) => {
        statements.push(sql);
        if (sql.includes('FROM observation_responses')) return { rows: [] };
        if (sql.includes('FROM published_observation_revisions')) return { rows: [{ id: 'revision-1' }] };
        return { rows: [] };
      },
      release: () => undefined,
    };
    const service = new ObservationResponseService({ pool: { connect: async () => client } } as never);

    const result = await service.respond('user-1', 'observation-1', 'revision-1', {
      operation_id: operationId,
      action: 'confirm',
    });

    expect(result).toMatchObject({ correction_id: null, state: 'confirmed', replayed: false });
    expect(statements.join('\n')).not.toContain('INSERT INTO evidence_events');
    expect(statements).toContain('BEGIN');
    expect(statements).toContain('COMMIT');
  });

  it('1-5：confirm 产生 outbox 事件（observation.confirmed），不再静默', async () => {
    const statements: string[] = [];
    const client = {
      query: async (sql: string) => {
        statements.push(sql);
        if (sql.includes('FROM observation_responses')) return { rows: [] };
        if (sql.includes('FROM published_observation_revisions')) return { rows: [{ id: 'revision-1' }] };
        return { rows: [] };
      },
      release: () => undefined,
    };
    const service = new ObservationResponseService({ pool: { connect: async () => client } } as never);

    await service.respond('user-1', 'observation-1', 'revision-1', {
      operation_id: operationId,
      action: 'confirm',
    });

    const allSql = statements.join('\n');
    expect(allSql).toContain('INSERT INTO portrait_outbox');
    expect(allSql).toContain('observation.confirmed');
    // outbox 事件必须在 COMMIT 前（同事务）
    expect(allSql.indexOf('INSERT INTO portrait_outbox')).toBeLessThan(allSql.lastIndexOf('COMMIT'));
  });

  it('creates only candidate evidence and an outbox event for refute', async () => {
    const statements: string[] = [];
    const client = {
      query: async (sql: string) => {
        statements.push(sql);
        if (sql.includes('FROM observation_responses')) return { rows: [] };
        if (sql.includes('FROM published_observation_revisions')) return { rows: [{ id: 'revision-1' }] };
        if (sql.includes('INSERT INTO evidence_events')) return { rows: [{ id: 'candidate-evidence-1' }] };
        return { rows: [] };
      },
      release: () => undefined,
    };
    const service = new ObservationResponseService({ pool: { connect: async () => client } } as never);

    const result = await service.respond('user-1', 'observation-1', 'revision-1', {
      operation_id: operationId,
      action: 'refute',
      explanation: '这个结论漏掉了关键情境。',
    });

    expect(result).toMatchObject({ state: 'pending_validation', replayed: false });
    const allSql = statements.join('\n');
    expect(allSql).toContain("'candidate'");
    expect(allSql).toContain('portrait_outbox');
    expect(allSql).not.toContain("portrait_status = 'formal'");
  });
});
