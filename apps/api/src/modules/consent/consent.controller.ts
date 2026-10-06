// apps/api/src/modules/consent/consent.controller.ts
// Consent endpoints — grant, revoke, status, export, delete
// Phase 4

import { Controller, Post, Get, Delete, Body, UseGuards, Req } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard.js';
import { ConsentService, validateConsentType } from './consent.service.js';
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

  @Get('export')
  async export(@Req() req: { user: AuthUser }) {
    return this.consent.exportUserData(req.user.id);
  }

  @Delete('delete')
  async deleteAccount(@Req() req: { user: AuthUser }) {
    return this.consent.deleteUserData(req.user.id);
  }
}
