import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard.js';
import type { AuthUser } from '../auth/auth.service.js';
import { ProductEventsService, type CreateProductEvent } from './product-events.service.js';

@Controller('product-events')
@UseGuards(AuthGuard)
export class ProductEventsController {
  constructor(private readonly events: ProductEventsService) {}

  @Post()
  record(@Req() req: { user: AuthUser }, @Body() body: CreateProductEvent) {
    return this.events.record(req.user.id, body);
  }
}
