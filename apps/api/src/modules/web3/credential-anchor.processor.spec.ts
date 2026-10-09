import { CredentialAnchorProcessor } from './credential-anchor.processor.js';
import { BaseService } from './base.service.js';
import { NotFoundException } from '@nestjs/common';

describe('CredentialAnchorProcessor', () => {
  let processor: CredentialAnchorProcessor;
  let mockDb: any;
  let mockBaseService: any;
  let dbRows: Map<string, any>;

  const credentialId = 'cred-uuid-1111';
  const testUserId = 'user-uuid-1111';

  beforeEach(() => {
    dbRows = new Map();

    mockDb = {
      pool: {
        query: jest.fn(async (sql: string, params: any[]) => {
          if (sql.includes('FROM issued_credentials') && sql.includes('SELECT')) {
            const id = params[0];
            const row = dbRows.get(id);
            return { rows: row ? [row] : [] };
          }

          if (sql.includes('UPDATE issued_credentials')) {
            // Update on_chain_status or fields
            const row = dbRows.get(credentialId);
            if (row) {
              if (sql.includes("SET on_chain_status = 'submitted'")) {
                row.on_chain_status = 'submitted';
                row.on_chain_chain_id = params[0];
                row.on_chain_contract = params[1];
                row.on_chain_anchor_id = params[2];
                row.on_chain_tx_hash = params[3];
              } else if (sql.includes('SET on_chain_status = $1')) {
                row.on_chain_status = params[0];
              }
            }
            return { rows: [] };
          }

          return { rows: [] };
        }),
      },
    };

    mockBaseService = {
      submitCredentialAnchor: jest.fn(async (digest: string) => {
        return {
          txHash: `0x${digest.slice(0, 64).padStart(64, '0')}`,
          status: 'submitted',
        };
      }),
      queryAnchorStatus: jest.fn(async (txHash: string) => {
        return {
          chain: 'base',
          chainId: 84532,
          status: 'confirmed',
          txHash,
          blockNumber: 123456n,
          confirmations: 5,
        };
      }),
    };

    processor = new CredentialAnchorProcessor(mockDb, mockBaseService as unknown as BaseService);
  });

  it('throws NotFoundException if credential does not exist', async () => {
    await expect(
      processor.processAnchorJob({
        credentialId: 'non-existent',
        userId: testUserId,
        recordId: 'rec-1',
        revisionId: '1',
        contentDigest: 'abcd',
      }),
    ).rejects.toThrow(NotFoundException);
  });

  it('is idempotent: skips broadcasting if credential is already confirmed or finalized', async () => {
    dbRows.set(credentialId, {
      id: credentialId,
      user_id: testUserId,
      content_digest: 'deadbeef12345678',
      on_chain_status: 'confirmed',
      on_chain_tx_hash: '0xconfirmedtxhash',
    });

    const result = await processor.processAnchorJob({
      credentialId,
      userId: testUserId,
      recordId: 'rec-1',
      revisionId: '1',
      contentDigest: 'deadbeef12345678',
    });

    expect(result.status).toBe('confirmed');
    expect(result.txHash).toBe('0xconfirmedtxhash');
    expect(mockBaseService.submitCredentialAnchor).not.toHaveBeenCalled();
    expect(mockBaseService.queryAnchorStatus).not.toHaveBeenCalled();
  });

  it('recovers from previous crash: queries existing txHash and prevents duplicate broadcast', async () => {
    dbRows.set(credentialId, {
      id: credentialId,
      user_id: testUserId,
      content_digest: 'deadbeef12345678',
      on_chain_status: 'submitted',
      on_chain_tx_hash: '0xpriorbroadcasttxhash', // Already submitted before worker crashed
    });

    const result = await processor.processAnchorJob({
      credentialId,
      userId: testUserId,
      recordId: 'rec-1',
      revisionId: '1',
      contentDigest: 'deadbeef12345678',
    });

    // Crucial: Must NOT call submitCredentialAnchor again (zero double-spending / zero duplicate tx)
    expect(mockBaseService.submitCredentialAnchor).not.toHaveBeenCalled();
    expect(mockBaseService.queryAnchorStatus).toHaveBeenCalledWith('0xpriorbroadcasttxhash');
    expect(result.status).toBe('confirmed');

    const updatedRow = dbRows.get(credentialId);
    expect(updatedRow.on_chain_status).toBe('confirmed');
  });

  it('initial submission: broadcasts anchor, persists txHash immediately, and queries confirmation', async () => {
    dbRows.set(credentialId, {
      id: credentialId,
      user_id: testUserId,
      content_digest: 'abcdef1234567890',
      on_chain_status: 'pending',
      on_chain_tx_hash: null,
    });

    const result = await processor.processAnchorJob({
      credentialId,
      userId: testUserId,
      recordId: 'rec-1',
      revisionId: '1',
      contentDigest: 'abcdef1234567890',
    });

    expect(mockBaseService.submitCredentialAnchor).toHaveBeenCalledWith('abcdef1234567890');
    expect(mockBaseService.queryAnchorStatus).toHaveBeenCalled();
    expect(result.status).toBe('confirmed');

    const updatedRow = dbRows.get(credentialId);
    expect(updatedRow.on_chain_status).toBe('confirmed');
    expect(updatedRow.on_chain_tx_hash).toMatch(/^0x/);
  });
});
