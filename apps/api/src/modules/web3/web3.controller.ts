import { Controller, Post, Get, Body, Param, UseGuards, Req, BadRequestException } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard.js';
import type { AuthUser } from '../auth/auth.service.js';
import { WalletService } from './wallet.service.js';
import { CredentialAnchorProcessor } from './credential-anchor.processor.js';
import { baseConfig } from '../../config/web3.config.js';
import { Database } from '../../common/database.js';

@Controller('web3')
export class Web3Controller {
  constructor(
    private readonly walletService: WalletService,
    private readonly anchorProcessor: CredentialAnchorProcessor,
    private readonly db: Database,
  ) {}

  @Get('config')
  getConfig() {
    return {
      chain: 'base',
      chainId: baseConfig.chainId,
      rpcUrl: baseConfig.rpcUrl,
      anchorContract: baseConfig.anchorContract,
      explorerUrl: baseConfig.explorerUrl,
    };
  }

  @Post('wallet/challenge')
  @UseGuards(AuthGuard)
  async createChallenge(
    @Body() body: { purpose?: 'bind_wallet' | 'authorize_action' | 'anchor_credential'; chainId?: number },
    @Req() req: { user: AuthUser },
  ) {
    return this.walletService.createChallenge(req.user.id, body?.purpose, body?.chainId);
  }

  @Post('wallet/bind')
  @UseGuards(AuthGuard)
  async bindWallet(
    @Body() body: { address: string; signature: string; nonce: string; chainId?: number },
    @Req() req: { user: AuthUser },
  ) {
    return this.walletService.bindWallet(req.user.id, body);
  }

  @Post('wallet/unbind')
  @UseGuards(AuthGuard)
  async unbindWallet(
    @Body() body: { address: string; chainId?: number },
    @Req() req: { user: AuthUser },
  ) {
    return this.walletService.unbindWallet(req.user.id, body.address, body.chainId);
  }

  @Get('wallet/list')
  @UseGuards(AuthGuard)
  async listWallets(@Req() req: { user: AuthUser }) {
    return this.walletService.listWallets(req.user.id);
  }

  @Post('anchor/:credentialId')
  @UseGuards(AuthGuard)
  async triggerAnchor(
    @Param('credentialId') credentialId: string,
    @Req() req: { user: AuthUser },
  ) {
    // Check ownership of credential
    const res = await this.db.pool.query(
      `SELECT id, user_id, content_digest, record_id, revision_id
       FROM issued_credentials
       WHERE id = $1`,
      [credentialId],
    );

    if (res.rows.length === 0) {
      throw new BadRequestException('Credential not found');
    }

    if (res.rows[0].user_id !== req.user.id) {
      throw new BadRequestException('Unauthorized to anchor credential of another user');
    }

    const cred = res.rows[0];
    const result = await this.anchorProcessor.processAnchorJob({
      credentialId: cred.id,
      userId: req.user.id,
      recordId: cred.record_id,
      revisionId: cred.revision_id,
      contentDigest: cred.content_digest,
    });

    return {
      credentialId,
      ...result,
      explorerUrl: result.txHash ? `${baseConfig.explorerUrl}/tx/${result.txHash}` : undefined,
    };
  }
}
