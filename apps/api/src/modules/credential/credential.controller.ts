import { Controller, Post, Get, Body, Param, UseGuards, Req } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard.js';
import { CredentialService } from './credential.service.js';
import type { AuthUser } from '../auth/auth.service.js';
import { type CredentialRecordType, verifyCredentialOffline } from '@eva/core';

@Controller('credentials')
export class CredentialController {
  constructor(private readonly credentialService: CredentialService) {}

  @Get('public-keys')
  getPublicKeys() {
    return this.credentialService.getPublicKeys();
  }

  @Post('verify')
  async verifyCredential(@Body() credential: any) {
    const offlineResult = verifyCredentialOffline(credential);
    let onlineStatus: 'valid' | 'revoked' | 'superseded' | 'unconfirmed' = 'unconfirmed';
    let anchorInfo: any = undefined;
    try {
      if (credential?.credentialId) {
        const statusRes = await this.credentialService.getCredentialStatus(credential.credentialId);
        onlineStatus = statusRes.status;
        anchorInfo = {
          onChainStatus: statusRes.onChainStatus,
          onChainTxHash: statusRes.onChainTxHash,
        };
      }
    } catch {
      onlineStatus = 'unconfirmed';
    }
    return {
      ...offlineResult,
      onlineStatus: {
        status: onlineStatus,
        queriedAt: new Date().toISOString(),
        ...anchorInfo,
      },
    };
  }

  @Post('export')
  @UseGuards(AuthGuard)
  async exportCredential(
    @Body()
    body: {
      recordId: string;
      recordType?: CredentialRecordType;
      revisionId?: string;
      includeAnchor?: boolean;
    },
    @Req() req: { user: AuthUser },
  ) {
    return this.credentialService.exportRecordCredential(req.user.id, body);
  }

  @Get(':id/status')
  async getStatus(@Param('id') id: string) {
    return this.credentialService.getCredentialStatus(id);
  }

  @Post(':id/revoke')
  @UseGuards(AuthGuard)
  async revokeCredential(@Param('id') id: string, @Req() req: { user: AuthUser }) {
    return this.credentialService.revokeCredential(req.user.id, id);
  }
}

@Controller('.well-known')
export class WellKnownCredentialController {
  constructor(private readonly credentialService: CredentialService) {}

  @Get('eva-public-keys.json')
  getPublicKeys() {
    return this.credentialService.getPublicKeys();
  }
}
