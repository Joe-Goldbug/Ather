import { describe, expect, it } from 'vitest';
import type { AuthUser } from './api';
import { canUseCorrections } from './capabilities';

describe('canUseCorrections', () => {
  it('does not allow guests or free users to use correction feedback', () => {
    expect(canUseCorrections(null)).toBe(false);
    expect(canUseCorrections({ id: 'u1', email: 'free@example.com' })).toBe(false);
    expect(canUseCorrections({
      id: 'u2',
      email: 'free-capability@example.com',
      entitlement_tier: 'free',
      capabilities: { canUseCorrections: false, canContinueTesting: true },
    } satisfies AuthUser)).toBe(false);
  });

  it('allows paid users to use correction feedback', () => {
    expect(canUseCorrections({
      id: 'u3',
      email: 'paid@example.com',
      entitlement_tier: 'paid',
      capabilities: { canUseCorrections: true, canContinueTesting: true },
    } satisfies AuthUser)).toBe(true);
  });
});
