import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { isAddress, type Address } from 'viem';
import { Database } from '../../common/database.js';
import { BaseService } from './base.service.js';
import { baseConfig } from '../../config/web3.config.js';

export interface WalletChallengeResponse {
  nonce: string;
  domain: {
    name: string;
    version: string;
    chainId: number;
    verifyingContract: Address;
  };
  types: Record<string, { name: string; type: string }[]>;
  primaryType: string;
  message: {
    userId: string;
    purpose: string;
    nonce: string;
    statement: string;
  };
  expiresAt: string;
}

export interface BindWalletParams {
  address: string;
  signature: string;
  nonce: string;
  chainId?: number;
}

@Injectable()
export class WalletService {
  constructor(
    private readonly db: Database,
    private readonly baseService: BaseService,
  ) {}

  /**
   * Generates a single-use EIP-712 challenge for wallet binding or authorization.
   * Challenge expires after 10 minutes and can only be used once (replay-protected).
   */
  async createChallenge(
    userId: string,
    purpose: 'bind_wallet' | 'authorize_action' | 'anchor_credential' = 'bind_wallet',
    chainId?: number,
  ): Promise<WalletChallengeResponse> {
    const targetChainId = chainId ?? baseConfig.chainId;
    const nonce = `0x${randomBytes(32).toString('hex')}`;
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    await this.db.pool.query(
      `INSERT INTO wallet_auth_challenges (user_id, nonce, purpose, chain_id, expires_at)
       VALUES ($1, $2, $3, $4, $5)`,
      [userId, nonce, purpose, targetChainId, expiresAt],
    );

    const statement =
      purpose === 'bind_wallet'
        ? 'I authorize binding this wallet to my Eva account.'
        : `I authorize ${purpose} on my Eva account.`;

    return {
      nonce,
      domain: {
        name: 'Eva Cognition',
        version: '1',
        chainId: targetChainId,
        verifyingContract: baseConfig.anchorContract,
      },
      types: {
        EvaWalletAuth: [
          { name: 'userId', type: 'string' },
          { name: 'purpose', type: 'string' },
          { name: 'nonce', type: 'string' },
          { name: 'statement', type: 'string' },
        ],
      },
      primaryType: 'EvaWalletAuth',
      message: {
        userId,
        purpose,
        nonce,
        statement,
      },
      expiresAt: expiresAt.toISOString(),
    };
  }

  /**
   * Validates the single-use challenge and verifies the EIP-712 signature
   * (supporting EOA, ERC-1271 Smart Wallets, and ERC-6492).
   * Binds the wallet to the user while preserving the original user account ID.
   */
  async bindWallet(userId: string, params: BindWalletParams) {
    if (!isAddress(params.address)) {
      throw new BadRequestException('Invalid Ethereum/Base address format');
    }

    const targetChainId = params.chainId ?? baseConfig.chainId;

    // 1. Fetch and atomically validate challenge
    const challengeRes = await this.db.pool.query(
      `SELECT id, consumed, expires_at, chain_id, purpose
       FROM wallet_auth_challenges
       WHERE nonce = $1 AND user_id = $2`,
      [params.nonce, userId],
    );

    if (challengeRes.rows.length === 0) {
      throw new BadRequestException('Invalid challenge nonce or mismatched user');
    }

    const challenge = challengeRes.rows[0];

    if (challenge.purpose !== 'bind_wallet') {
      throw new BadRequestException(`Invalid challenge purpose: expected bind_wallet, got ${challenge.purpose}`);
    }

    if (challenge.consumed) {
      throw new BadRequestException('Challenge nonce has already been consumed (replay detected)');
    }

    if (new Date(challenge.expires_at).getTime() < Date.now()) {
      throw new BadRequestException('Challenge nonce has expired');
    }

    // 2. Atomically consume challenge nonce
    await this.db.pool.query(
      `UPDATE wallet_auth_challenges SET consumed = true WHERE id = $1`,
      [challenge.id],
    );

    // 3. Verify EIP-712 signature (Viem handles EOA, ERC-1271, and ERC-6492)
    const isValid = await this.baseService.verifyWalletSignature({
      address: params.address,
      signature: params.signature,
      domain: {
        name: 'Eva Cognition',
        version: '1',
        chainId: challenge.chain_id,
        verifyingContract: baseConfig.anchorContract,
      },
      types: {
        EvaWalletAuth: [
          { name: 'userId', type: 'string' },
          { name: 'purpose', type: 'string' },
          { name: 'nonce', type: 'string' },
          { name: 'statement', type: 'string' },
        ],
      },
      primaryType: 'EvaWalletAuth',
      message: {
        userId,
        purpose: 'bind_wallet',
        nonce: params.nonce,
        statement: 'I authorize binding this wallet to my Eva account.',
      },
    });

    if (!isValid) {
      throw new BadRequestException('Invalid wallet signature');
    }

    // 4. Detect account type (EOA vs Smart Account)
    const bytecode = await this.baseService.getBytecode(params.address);
    const walletType = bytecode && bytecode !== '0x' ? 'smart_wallet' : 'eoa';

    // 5. Upsert wallet record (preserves original users.id, replaces prior binding if needed)
    const upsertRes = await this.db.pool.query(
      `INSERT INTO user_wallets (user_id, address, chain_id, wallet_type, verified_via, bound_at)
       VALUES ($1, $2, $3, $4, 'eip712', NOW())
       ON CONFLICT (address, chain_id)
       DO UPDATE SET user_id = $1, bound_at = NOW(), wallet_type = $4, verified_via = 'eip712'
       RETURNING id, user_id, address, chain_id, wallet_type, bound_at, verified_via`,
      [userId, params.address.toLowerCase(), targetChainId, walletType],
    );

    return {
      success: true,
      wallet: upsertRes.rows[0],
    };
  }

  /**
   * Unbinds a wallet from a user account.
   */
  async unbindWallet(userId: string, address: string, chainId?: number) {
    const targetChainId = chainId ?? baseConfig.chainId;
    const res = await this.db.pool.query(
      `DELETE FROM user_wallets
       WHERE user_id = $1 AND address = $2 AND chain_id = $3
       RETURNING id`,
      [userId, address.toLowerCase(), targetChainId],
    );

    if (res.rows.length === 0) {
      throw new NotFoundException('Wallet binding not found');
    }

    return {
      success: true,
      unboundAddress: address.toLowerCase(),
      chainId: targetChainId,
    };
  }

  /**
   * Lists all wallets bound to the given user.
   */
  async listWallets(userId: string) {
    const res = await this.db.pool.query(
      `SELECT id, address, chain_id, wallet_type, bound_at, verified_via
       FROM user_wallets
       WHERE user_id = $1
       ORDER BY bound_at DESC`,
      [userId],
    );

    return {
      wallets: res.rows,
    };
  }
}
