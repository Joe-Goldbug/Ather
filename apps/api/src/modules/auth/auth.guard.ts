// apps/api/src/modules/auth/auth.guard.ts
import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthService } from './auth.service.js';
import { Request } from 'express';

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly auth: AuthService) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<Request>();

    // Priority: Cookie -> Authorization header
    let token = req.cookies?.['ather_session'];

    if (!token) {
      const authHeader = req.headers['authorization'];
      if (Array.isArray(authHeader)) {
        throw new UnauthorizedException('Invalid authorization header');
      }
      if (authHeader?.startsWith('Bearer ')) {
        token = authHeader.replace('Bearer ', '');
      }
    }

    if (!token) {
      throw new UnauthorizedException('Missing session token');
    }
    const requestPath = (req.originalUrl ?? req.path ?? '').split('?')[0].replace(/\/+$/, '');
    const includeDeleting = req.method === 'DELETE' && requestPath.endsWith('/consent/delete');
    const user = await this.auth.validateToken(token, { includeDeleting });
    if (!user) {
      throw new UnauthorizedException('Invalid or expired token');
    }

    (req as any).user = user;
    // Store raw token so SessionInterceptor can set AsyncLocalStorage context,
    // which propagates app.session_token to every DB connection on this request
    (req as any).sessionToken = token;
    return true;
  }
}
