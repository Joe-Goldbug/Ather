import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const sql = readFileSync(resolve(__dirname, '2026-09-01-guest-opening.sql'), 'utf8');

describe('guest opening migration acceptance', () => {
  it('keeps authenticated ownership and adds bounded guest claim metadata', () => {
    expect(sql).toMatch(/entry_source\s+text\s+not null\s+default\s+'registered_theme'/i);
    expect(sql).toMatch(/guest_run_id\s+uuid\s+null/i);
    expect(sql).toContain("CHECK (entry_source IN ('registered_theme', 'guest_opening_claim'))");
    expect(sql).toMatch(/unique index[^;]+guest_run_id[^;]+where guest_run_id is not null/is);
    expect(sql).not.toMatch(/ALTER\s+COLUMN\s+user_id\s+DROP\s+NOT\s+NULL/i);
  });
});
