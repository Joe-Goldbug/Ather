import type { AuthUser } from './api';

export function canUseCorrections(user: AuthUser | null | undefined): boolean {
  return user?.capabilities?.canUseCorrections === true || user?.entitlement_tier === 'paid';
}
