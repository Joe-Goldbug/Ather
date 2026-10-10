import { Body, Controller, Delete, ForbiddenException, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard.js';
import type { AuthUser } from '../auth/auth.service.js';
import { understandingCapabilities } from './understanding.flags.js';
import { UnderstandingService, type AppendUnderstandingTurnCommand, type CreateUnderstandingCommand } from './understanding.service.js';

@Controller('understandings')
@UseGuards(AuthGuard)
export class UnderstandingController {
  constructor(private readonly understandings: UnderstandingService) {}

  @Get('capabilities')
  capabilities(@Req() req: { user: AuthUser }) { return understandingCapabilities(req.user.id); }

  @Get()
  list(@Query('saved') saved: string | undefined, @Req() req: { user: AuthUser }) {
    return saved === 'true' ? this.understandings.listSaved(req.user.id) : [];
  }

  @Post()
  create(@Body() body: CreateUnderstandingCommand, @Req() req: { user: AuthUser }) {
    const capabilities = understandingCapabilities(req.user.id);
    if (body?.source_ref?.kind === 'free_entry' && !capabilities.home_chat) throw new ForbiddenException({ code: 'feature_unavailable' });
    if (body?.source_ref?.kind !== 'free_entry' && !capabilities.result_followup) throw new ForbiddenException({ code: 'feature_unavailable' });
    return this.understandings.create(req.user.id, body);
  }

  @Get(':id')
  get(@Param('id') id: string, @Req() req: { user: AuthUser }) { return this.understandings.get(req.user.id, id); }

  @Post(':id/turns')
  append(@Param('id') id: string, @Body() body: AppendUnderstandingTurnCommand, @Req() req: { user: AuthUser }) {
    return this.understandings.appendTurn(req.user.id, id, body);
  }

  @Post(':id/turns/:turnId/generate')
  generate(@Param('id') id: string, @Param('turnId') turnId: string, @Req() req: { user: AuthUser }) {
    return this.understandings.generate(req.user.id, id, turnId);
  }

  @Post(':id/close')
  close(@Param('id') id: string, @Req() req: { user: AuthUser }) { return this.understandings.setState(req.user.id, id, 'close'); }

  @Post(':id/reopen')
  reopen(@Param('id') id: string, @Req() req: { user: AuthUser }) { return this.understandings.setState(req.user.id, id, 'reopen'); }

  @Post(':id/save')
  save(@Param('id') id: string, @Req() req: { user: AuthUser }) { return this.understandings.setState(req.user.id, id, 'save'); }

  @Post(':id/revoke')
  revoke(@Param('id') id: string, @Req() req: { user: AuthUser }) { return this.understandings.setState(req.user.id, id, 'revoke'); }

  @Delete(':id')
  remove(@Param('id') id: string, @Req() req: { user: AuthUser }) { return this.understandings.remove(req.user.id, id); }
}
