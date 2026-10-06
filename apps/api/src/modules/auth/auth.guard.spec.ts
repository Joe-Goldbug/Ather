import { UnauthorizedException } from '@nestjs/common';
import { AuthGuard } from './auth.guard.js';

function context(request: Record<string, unknown>) {
  return {
    switchToHttp: () => ({ getRequest: () => request }),
  } as never;
}

describe('AuthGuard pending account deletion boundary', () => {
  it('allows includeDeleting only on the account deletion retry route', async () => {
    const auth = { validateToken: jest.fn(async () => ({ id: 'user-1' })) };
    const guard = new AuthGuard(auth as never);
    const request = {
      method: 'DELETE', path: '/consent/delete', originalUrl: '/consent/delete',
      cookies: { eva_session: 'token' }, headers: {},
    };

    await expect(guard.canActivate(context(request))).resolves.toBe(true);
    expect(auth.validateToken).toHaveBeenCalledWith('token', { includeDeleting: true });
  });

  it('keeps pending-deletion sessions blocked on every other route', async () => {
    const auth = { validateToken: jest.fn(async () => null) };
    const guard = new AuthGuard(auth as never);
    const request = {
      method: 'GET', path: '/consent/export', originalUrl: '/consent/export',
      cookies: { eva_session: 'token' }, headers: {},
    };

    await expect(guard.canActivate(context(request))).rejects.toBeInstanceOf(UnauthorizedException);
    expect(auth.validateToken).toHaveBeenCalledWith('token', { includeDeleting: false });
  });
});
