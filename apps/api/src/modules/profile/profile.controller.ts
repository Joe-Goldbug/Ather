import { Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard.js';
import type { AuthUser } from '../auth/auth.service.js';
import { ProfileService } from './profile.service.js';

@Controller('profile')
@UseGuards(AuthGuard)
export class ProfileController {
  constructor(private readonly profileService: ProfileService) {}

  @Get('portrait')
  async getPortrait(@Req() req: { user: AuthUser }) {
    return this.profileService.getPortrait(req.user.id);
  }

  @Get('evolution')
  async getEvolution(@Req() req: { user: AuthUser }) {
    return this.profileService.getEvolution(req.user.id);
  }

  @Get('current-vector')
  async getCurrentVector(@Req() req: { user: AuthUser }) {
    return this.profileService.getCurrentVector(req.user.id);
  }

  /**
   * 驳回一条画像证据（用户第一纠偏权）。
   * evidence id 来自 GET /profile/portrait 的 observations[].evidence[].id。
   * 效果：该证据被标记 withdrawn 且该维度置信度立即重算并写回 memory_state。
   */
  @Post('evidence/:evidenceId/withdraw')
  async withdrawEvidence(
    @Req() req: { user: AuthUser },
    @Param('evidenceId') evidenceId: string,
  ) {
    return this.profileService.withdrawEvidence(req.user.id, evidenceId);
  }

  /**
   * 证据原文回溯（2-A3 后端）：返回原始输入文本 + 片段偏移，
   * 前端据此渲染"点开原文并高亮触发句"。
   */
  @Get('evidence/:evidenceId/source')
  async getEvidenceSource(
    @Req() req: { user: AuthUser },
    @Param('evidenceId') evidenceId: string,
  ) {
    return this.profileService.getEvidenceSource(req.user.id, evidenceId);
  }
}
