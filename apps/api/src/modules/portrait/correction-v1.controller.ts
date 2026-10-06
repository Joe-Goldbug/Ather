import { Body, Controller, Param, Post, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard.js';
import type { AuthUser } from '../auth/auth.service.js';
import { CorrectionV1Service } from './correction-v1.service.js';

@Controller('v1/corrections')
@UseGuards(AuthGuard)
export class CorrectionV1Controller {
  constructor(private readonly corrections: CorrectionV1Service) {}

  @Post(':correctionId/retry')
  retry(
    @Req() req: { user: AuthUser },
    @Param('correctionId') correctionId: string,
    @Body() body: { operation_id: string; revision_number: number },
  ) {
    return this.corrections.retry(req.user.id, correctionId, body);
  }

  @Post(':correctionId/withdraw')
  withdraw(
    @Req() req: { user: AuthUser },
    @Param('correctionId') correctionId: string,
    @Body() body: { operation_id: string; revision_number: number },
  ) {
    return this.corrections.withdraw(req.user.id, correctionId, body);
  }
}
