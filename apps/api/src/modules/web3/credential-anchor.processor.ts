import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Database } from '../../common/database.js';
import { BaseService, type AnchorStatusResult } from './base.service.js';
import { baseConfig } from '../../config/web3.config.js';
import type { CredentialAnchorJob } from '../../queue/queue.js';

@Injectable()
export class CredentialAnchorProcessor {
  private readonly logger = new Logger(CredentialAnchorProcessor.name);

  constructor(
    private readonly db: Database,
    private readonly baseService: BaseService,
  ) {}

  /**
   * Processes credential anchor job with idempotency and crash recovery.
   * Prevents duplicate transactions on worker retries or timeouts by
   * checking existing on_chain_tx_hash before submitting.
   */
  async processAnchorJob(job: CredentialAnchorJob): Promise<AnchorStatusResult> {
    const { credentialId } = job;

    // 1. Load latest credential state from database
    const credRes = await this.db.pool.query(
      `SELECT id, user_id, content_digest, on_chain_status, on_chain_tx_hash, on_chain_anchor_id
       FROM issued_credentials
       WHERE id = $1`,
      [credentialId],
    );

    if (credRes.rows.length === 0) {
      throw new NotFoundException(`Credential ${credentialId} not found for anchoring`);
    }

    const cred = credRes.rows[0];

    // 2. Idempotency check: already confirmed or finalized
    if (cred.on_chain_status === 'confirmed' || cred.on_chain_status === 'finalized') {
      this.logger.log(`Credential ${credentialId} already anchored (${cred.on_chain_status}) at tx: ${cred.on_chain_tx_hash}`);
      return {
        chain: 'base',
        chainId: baseConfig.chainId,
        status: cred.on_chain_status,
        txHash: cred.on_chain_tx_hash,
      };
    }

    // 3. Crash recovery: transaction was already broadcast in previous attempt
    let txHash = cred.on_chain_tx_hash;

    if (txHash) {
      this.logger.log(`Credential ${credentialId} has existing txHash ${txHash}, checking on-chain status`);
      const statusResult = await this.baseService.queryAnchorStatus(txHash);

      if (statusResult.status === 'confirmed' || statusResult.status === 'finalized') {
        await this.db.pool.query(
          `UPDATE issued_credentials
           SET on_chain_status = $1, updated_at = NOW()
           WHERE id = $2`,
          [statusResult.status, credentialId],
        );
        return statusResult;
      }

      if (statusResult.status === 'failed') {
        await this.db.pool.query(
          `UPDATE issued_credentials
           SET on_chain_status = 'failed', updated_at = NOW()
           WHERE id = $1`,
          [credentialId],
        );
        return statusResult;
      }

      return statusResult;
    }

    // 4. Initial broadcast: submit anchor hash to Base
    const anchorId = `0x${cred.content_digest}`;
    const submission = await this.baseService.submitCredentialAnchor(cred.content_digest);
    txHash = submission.txHash;

    // Persist txHash immediately so any subsequent crash/retry will query rather than re-broadcast
    await this.db.pool.query(
      `UPDATE issued_credentials
       SET on_chain_status = 'submitted',
           on_chain_network = 'base-sepolia',
           on_chain_chain_id = $1,
           on_chain_contract = $2,
           on_chain_anchor_id = $3,
           on_chain_tx_hash = $4,
           updated_at = NOW()
       WHERE id = $5`,
      [baseConfig.chainId, baseConfig.anchorContract, anchorId, txHash, credentialId],
    );

    // 5. Query confirmation status
    const statusResult = await this.baseService.queryAnchorStatus(txHash);
    if (statusResult.status === 'confirmed' || statusResult.status === 'finalized') {
      await this.db.pool.query(
        `UPDATE issued_credentials
         SET on_chain_status = $1, updated_at = NOW()
         WHERE id = $2`,
        [statusResult.status, credentialId],
      );
    }

    return statusResult;
  }
}
