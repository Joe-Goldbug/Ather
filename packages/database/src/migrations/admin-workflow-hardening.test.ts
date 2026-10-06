import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const sql = readFileSync(resolve(__dirname, '2026-09-02-admin-workflow-hardening.sql'), 'utf8');

describe('admin workflow hardening migration', () => {
  it('keeps a feedback transition history without replacing business tables', () => {
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS product_feedback_status_history/i);
    expect(sql).not.toMatch(/DROP\s+TABLE/i);
    expect(sql).toMatch(/admin_users_role_check/i);
  });
});
