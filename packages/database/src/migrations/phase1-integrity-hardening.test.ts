import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const sql = readFileSync(resolve(__dirname, '2026-09-02-phase1-integrity-hardening.sql'), 'utf8');

describe('phase1 integrity hardening migration', () => {
  it('upgrades existing tables without dropping user data', () => {
    expect(sql).not.toMatch(/DROP\s+TABLE/i);
    expect(sql).toMatch(/ALTER TABLE product_events/i);
    expect(sql).toMatch(/ALTER TABLE product_feedback/i);
  });

  it('normalizes legacy rows before adding strict constraints', () => {
    expect(sql).toMatch(/UPDATE product_events/i);
    expect(sql).toMatch(/UPDATE product_feedback/i);
    expect(sql).toMatch(/event_id.*SET NOT NULL/is);
    expect(sql).toMatch(/round_id.*SET NOT NULL/is);
    expect(sql).toMatch(/content_version.*SET NOT NULL/is);
  });
});
