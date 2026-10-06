import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard.js';
import type { AuthUser } from '../auth/auth.service.js';
import { ProductFeedbackService, type SubmitProductFeedback } from './product-feedback.service.js';

@Controller('product-feedback')
@UseGuards(AuthGuard)
export class ProductFeedbackController {
  constructor(private readonly feedback: ProductFeedbackService) {}

  @Post()
  submit(@Req() req: { user: AuthUser }, @Body() body: SubmitProductFeedback) {
    return this.feedback.submit(req.user.id, body);
  }
}
