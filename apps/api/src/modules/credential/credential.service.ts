import { Injectable, NotFoundException, ForbiddenException, BadRequestException, Optional, Logger } from '@nestjs/common';
import { generateKeyPairSync, sign, type KeyObject } from 'node:crypto';
import { randomUUID } from 'node:crypto';
import { Database } from '../../common/database.js';
import { QueueService } from '../../queue/queue.service.js';
import { baseConfig } from '../../config/web3.config.js';
import {
  computeClaimsDigest,
  type EvaVerifiableCredential,
  type EvaCredentialClaim,
  type CredentialRecordType,
  type OnChainAnchor,
} from '@eva/core';

@Injectable()
export class CredentialService {
  private readonly logger = new Logger(CredentialService.name);
  private keyId = 'eva-ed25519-primary';
  private privateKey: KeyObject;
  private publicKeyPem: string;

  constructor(
    private readonly db: Database,
    @Optional() private readonly queueService?: QueueService,
  ) {
    // Initialize or load platform Ed25519 signing keypair
    const envPriv = process.env.EVA_CREDENTIAL_PRIVATE_KEY;
    const envPub = process.env.EVA_CREDENTIAL_PUBLIC_KEY;

    if (envPriv && envPub) {
      try {
        const { createPrivateKey } = require('node:crypto');
        this.privateKey = createPrivateKey(envPriv);
        this.publicKeyPem = envPub;
      } catch {
        const keypair = generateKeyPairSync('ed25519');
        this.privateKey = keypair.privateKey;
        this.publicKeyPem = keypair.publicKey.export({ type: 'spki', format: 'pem' }) as string;
      }
    } else {
      const keypair = generateKeyPairSync('ed25519');
      this.privateKey = keypair.privateKey;
      this.publicKeyPem = keypair.publicKey.export({ type: 'spki', format: 'pem' }) as string;
    }
  }

  getPublicKeys() {
    return {
      keys: [
        {
          id: this.keyId,
          type: 'Ed25519VerificationKey2020',
          algorithm: 'Ed25519',
          publicKeyPem: this.publicKeyPem,
        },
      ],
    };
  }

  async exportRecordCredential(
    userId: string,
    params: {
      recordId: string;
      recordType?: CredentialRecordType;
      revisionId?: string;
      includeAnchor?: boolean;
    },
  ): Promise<EvaVerifiableCredential> {
    const recordType = params.recordType || 'observation';
    const recordId = params.recordId;
    const revisionId = params.revisionId || '1';

    const claims: EvaCredentialClaim[] = [];

    if (recordType === 'observation') {
      const captureRes = await this.db.pool.query(
        `SELECT id, user_id, raw_text, entry_type, capture_mode, captured_at
         FROM captures WHERE id = $1 AND user_id = $2`,
        [recordId, userId],
      );

      if (captureRes.rows.length === 0) {
        throw new NotFoundException('Observation record not found or unauthorized');
      }
      const capture = captureRes.rows[0];

      // Check for user corrections
      const correctionRes = await this.db.pool.query(
        `SELECT status, user_comment, updated_at
         FROM user_corrections
         WHERE user_id = $1 AND target_id = $2
         ORDER BY updated_at DESC LIMIT 1`,
        [userId, recordId],
      ).catch(() => ({ rows: [] }));

      const correction = correctionRes.rows[0];

      claims.push({
        targetId: capture.id,
        claimType: 'observation',
        title: `Observation fragment (${capture.entry_type})`,
        statement: capture.raw_text || '',
        metadata: {
          captureMode: capture.capture_mode,
          capturedAt: capture.captured_at,
        },
        userCorrection: correction
          ? {
              status: correction.status,
              userComment: correction.user_comment,
              updatedAt: new Date(correction.updated_at).toISOString(),
            }
          : undefined,
      });
    } else if (recordType === 'assessment') {
      const roundRes = await this.db.pool.query(
        `SELECT id, user_id, theme_lens, status, started_at, completed_at
         FROM theme_assessment_rounds WHERE id = $1 AND user_id = $2`,
        [recordId, userId],
      );

      if (roundRes.rows.length === 0) {
        throw new NotFoundException('Assessment round not found or unauthorized');
      }
      const round = roundRes.rows[0];

      // Fetch observation responses
      const respRes = await this.db.pool.query(
        `SELECT id, round_id, response_type, note, created_at
         FROM theme_assessment_result_responses
         WHERE round_id = $1 AND user_id = $2`,
        [recordId, userId],
      ).catch(() => ({ rows: [] }));

      claims.push({
        targetId: round.id,
        claimType: 'assessment_round',
        title: `Theme Assessment: ${round.theme_lens}`,
        statement: `Completed exploration round for theme ${round.theme_lens}`,
        metadata: {
          status: round.status,
          startedAt: round.started_at,
          completedAt: round.completed_at,
          responseCount: respRes.rows.length,
        },
      });

      for (const resp of respRes.rows) {
        claims.push({
          targetId: resp.id,
          claimType: 'observation',
          title: 'User Assessment Response',
          statement: resp.note || `Response: ${resp.response_type}`,
          userCorrection: {
            status: resp.response_type === 'dispute' ? 'disputed' : 'confirmed',
            userComment: resp.note,
            updatedAt: new Date(resp.created_at).toISOString(),
          },
        });
      }
    } else {
      throw new BadRequestException(`Unsupported recordType: ${recordType}`);
    }

    const contentDigest = computeClaimsDigest(claims);
    const signature = sign(null, Buffer.from(contentDigest, 'utf8'), this.privateKey).toString('hex');
    const credentialId = randomUUID();
    const issuedAt = new Date().toISOString();

    let onChainAnchor: OnChainAnchor | undefined;
    if (params.includeAnchor) {
      onChainAnchor = {
        chain: 'base',
        chainId: 84532, // Base Sepolia
        anchorId: `0x${contentDigest}`,
        status: 'pending',
      };
    }

    const credential: EvaVerifiableCredential = {
      schemaVersion: 'eva-credential-v1',
      credentialId,
      recordId,
      revisionId,
      recordType,
      issuedAt,
      issuer: {
        id: 'did:eva:platform',
        name: 'Eva Cognition',
        publicKeyId: this.keyId,
        publicKeyPem: this.publicKeyPem,
      },
      claims,
      contentDigest,
      signature,
      onChainAnchor,
    };

    // Store in issued_credentials table
    await this.db.pool.query(
      `INSERT INTO issued_credentials
       (id, user_id, record_id, revision_id, record_type, content_digest, signature, status, on_chain_status, payload)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'valid', $8, $9)`,
      [
        credentialId,
        userId,
        recordId,
        revisionId,
        recordType,
        contentDigest,
        signature,
        onChainAnchor ? 'pending' : 'none',
        JSON.stringify(credential),
      ],
    );

    // Phase 6: Asynchronously enqueue credential anchor job if requested
    if (params.includeAnchor && this.queueService) {
      await this.queueService
        .enqueueCredentialAnchor({
          credentialId,
          userId,
          recordId,
          revisionId,
          contentDigest,
        })
        .catch((err) => {
          this.logger.warn(`Failed to enqueue anchor job for ${credentialId}: ${err?.message}`);
        });
    }

    return credential;
  }

  async getCredentialStatus(credentialId: string) {
    const res = await this.db.pool.query(
      `SELECT id, status, superseded_by, on_chain_status, on_chain_tx_hash, on_chain_anchor_id, created_at, updated_at
       FROM issued_credentials WHERE id = $1`,
      [credentialId],
    );

    if (res.rows.length === 0) {
      throw new NotFoundException(`Credential ${credentialId} not found`);
    }

    const row = res.rows[0];
    return {
      credentialId: row.id,
      status: row.status as 'valid' | 'revoked' | 'superseded',
      supersededBy: row.superseded_by,
      queriedAt: new Date().toISOString(),
      onChainStatus: row.on_chain_status,
      onChainTxHash: row.on_chain_tx_hash,
      onChainAnchorId: row.on_chain_anchor_id,
      explorerUrl: row.on_chain_tx_hash ? `${baseConfig.explorerUrl}/tx/${row.on_chain_tx_hash}` : undefined,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  async revokeCredential(userId: string, credentialId: string) {
    const res = await this.db.pool.query(
      `SELECT id, user_id FROM issued_credentials WHERE id = $1`,
      [credentialId],
    );

    if (res.rows.length === 0) {
      throw new NotFoundException('Credential not found');
    }

    if (res.rows[0].user_id !== userId) {
      throw new ForbiddenException('Cannot revoke credential belonging to another user');
    }

    await this.db.pool.query(
      `UPDATE issued_credentials SET status = 'revoked', updated_at = NOW() WHERE id = $1`,
      [credentialId],
    );

    return {
      credentialId,
      status: 'revoked',
      revokedAt: new Date().toISOString(),
    };
  }
}
