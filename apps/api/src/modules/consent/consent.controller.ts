// apps/api/src/modules/consent/consent.controller.ts
// Consent endpoints — grant, revoke, status, export, delete
// Phase 4

import { Controller, Post, Get, Delete, Body, Param, UseGuards, Req } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard.js';
import { ConsentService, validateConsentType, validateRecordUsageScope } from './consent.service.js';
import type { AuthUser } from '../auth/auth.service.js';

@Controller('consent')
@UseGuards(AuthGuard)
export class ConsentController {
  constructor(private readonly consent: ConsentService) {}

  @Post('grant')
  async grant(
    @Body() body: { consent_type?: unknown },
    @Req() req: { user: AuthUser },
  ) {
    await this.consent.grant(req.user.id, validateConsentType(body?.consent_type));
    return { granted: true };
  }

  @Post('revoke')
  async revoke(
    @Body() body: { consent_type?: unknown },
    @Req() req: { user: AuthUser },
  ) {
    await this.consent.revoke(req.user.id, validateConsentType(body?.consent_type));
    return { revoked: true };
  }

  @Get('status')
  async status(@Req() req: { user: AuthUser }) {
    return this.consent.getStatus(req.user.id);
  }

  @Post('record-scope')
  async setRecordScope(
    @Body() body: { scope?: unknown },
    @Req() req: { user: AuthUser },
  ) {
    return this.consent.setRecordScope(req.user.id, validateRecordUsageScope(body?.scope));
  }

  @Get('record-scope')
  async getRecordScope(@Req() req: { user: AuthUser }) {
    return this.consent.getRecordScope(req.user.id);
  }

  @Get('export')
  async export(@Req() req: { user: AuthUser }) {
    return this.consent.exportUserData(req.user.id);
  }

  @Delete('delete')
  async deleteAccount(@Req() req: { user: AuthUser }) {
    return this.consent.deleteUserData(req.user.id);
  }

  @Post('grants/agent')
  async createAgentGrant(
    @Body()
    body: {
      agent_id: string;
      purpose_scope: string;
      scopes: string[];
      expires_in_days?: number;
    },
    @Req() req: { user: AuthUser },
  ) {
    return this.consent.createAgentGrant(req.user.id, {
      agentId: body.agent_id,
      purposeScope: body.purpose_scope,
      scopes: body.scopes,
      expiresInDays: body.expires_in_days,
    });
  }

  @Post('grants/agent/:grantId/revoke')
  async revokeAgentGrant(
    @Param('grantId') grantId: string,
    @Req() req: { user: AuthUser },
  ) {
    return this.consent.revokeAgentGrant(req.user.id, grantId);
  }

  @Get('grants/agent')
  async listAgentGrants(@Req() req: { user: AuthUser }) {
    return this.consent.listAgentGrants(req.user.id);
  }
}
