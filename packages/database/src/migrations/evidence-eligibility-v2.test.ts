import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const sql = readFileSync(resolve(import.meta.dirname, '2026-09-26-evidence-eligibility-v2.sql'), 'utf8');

describe('evidence eligibility migration', () => {
  it('retires automatic promotion and fails closed on provenance', () => {
    expect(sql).toContain('DROP TRIGGER IF EXISTS trg_promote_formal_evidence');
    expect(sql).toContain('DROP FUNCTION IF EXISTS promote_formal_evidence_v1');
    expect(sql).toContain("WHERE portrait_status = 'formal'");
    expect(sql).toContain("AND epistemic_source = 'unknown'");
    expect(sql).toContain("DEFAULT 'unknown'");
    expect(sql).toContain('WITH (security_barrier = true)');
    expect(sql).toContain('SELECT * FROM portrait_eligible_evidence_v2');
    expect(sql).toContain("e.portrait_status = 'formal'");
    expect(sql).toContain("e.purpose_scope = 'portrait_inference'");
    expect(sql).toContain("e.content_kind IN ('self_description', 'recalled_event', 'product_action')");
    expect(sql).toContain("e.quality_metadata->>'attribution' = 'self'");
  });
});
