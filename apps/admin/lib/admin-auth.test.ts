import { describe, expect, it } from 'vitest';
import { hasAdminPermission } from './admin-auth';

describe('admin role permissions', () => {
  it('does not grant sensitive reveals to a product viewer', () => {
    expect(hasAdminPermission('product_viewer', 'view_masked_users')).toBe(true);
    expect(hasAdminPermission('product_viewer', 'reveal_email')).toBe(false);
    expect(hasAdminPermission('product_viewer', 'update_feedback')).toBe(false);
  });

  it('limits support to feedback work and masked user support', () => {
    expect(hasAdminPermission('support', 'update_feedback')).toBe(true);
    expect(hasAdminPermission('support', 'reveal_raw_words')).toBe(false);
  });
});
