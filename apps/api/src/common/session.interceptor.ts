// apps/api/src/common/session.interceptor.ts
// Wraps each authenticated request in an AsyncLocalStorage context so that
// Database.pool.query/connect automatically injects app.session_token on
// every DB connection — making audit_trigger and RLS reliable across a
// connection pool without requiring per-service changes.

import { Injectable, NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common';
import { Observable, from, firstValueFrom } from 'rxjs';
import { Request } from 'express';
import { Database } from './database.js';

@Injectable()
export class SessionInterceptor implements NestInterceptor {
  constructor(private readonly db: Database) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest<Request>();
    const token = (req as any).sessionToken as string | undefined;
    // No token = unauthenticated route (health check, send-code, etc.) — skip
    if (!token) return next.handle();
    return from(this.db.runWithToken(token, () => firstValueFrom(next.handle())));
  }
}
