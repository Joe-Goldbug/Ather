import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const migrationsDir = dirname(fileURLToPath(import.meta.url));
const filename = '2026-07-29-continuous-portrait-v1.sql';
const path = resolve(migrationsDir, filename);

describe('continuous portrait v1 migration', () => {
  it('adds a fail-closed formal evidence boundary without deleting legacy data', () => {
    expect(existsSync(path)).toBe(true);
    const sql = readFileSync(path, 'utf8');

    expect(sql).toMatch(/portrait_status/i);
    expect(sql).toMatch(/legacy_unclassified/i);
    expect(sql).toMatch(/portrait_formal_evidence_v1/i);
    expect(sql).toMatch(/security_barrier/i);
    expect(sql).toMatch(/portrait_status\s*=\s*'formal'/i);
    expect(sql).toMatch(/CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS\s+governance_rule_versions/i);
    expect(sql).not.toMatch(/DROP\s+TABLE/i);
  });

  it('persists immutable portrait, observation, correction, and outbox records', () => {
    const sql = readFileSync(path, 'utf8');

    for (const table of [
      'continuous_portraits',
      'portrait_revisions',
      'portrait_dimension_states',
      'portrait_revision_evidence',
      'observation_candidates',
      'observation_claims',
      'observation_claim_evidence',
      'published_observation_revisions',
      'correction_records',
      'correction_record_revisions',
      'portrait_outbox',
    ]) {
      expect(sql).toMatch(new RegExp(`CREATE\\s+TABLE\\s+IF\\s+NOT\\s+EXISTS\\s+${table}`, 'i'));
    }
  });
});
