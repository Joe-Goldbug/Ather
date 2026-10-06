import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { FORMAL_EVIDENCE_VIEW } from './formal-evidence.js';

const root = resolve(import.meta.dirname, '../../../..');

describe('formal evidence boundary', () => {
  it('uses one security-barrier view for portrait, report input, and agent context', () => {
    expect(FORMAL_EVIDENCE_VIEW).toBe('portrait_eligible_evidence_v2');

    for (const path of [
      'apps/api/src/modules/profile/profile.service.ts',
      'apps/api/src/modules/evidence/evidence.service.ts',
      'apps/api/src/queue/report-claims.ts',
      'apps/api/src/modules/agent-context/agent-context.service.ts',
    ]) {
      const source = readFileSync(resolve(root, path), 'utf8');
      expect(source).toContain('FORMAL_EVIDENCE_VIEW');
    }
    expect(readFileSync(resolve(root, 'apps/api/src/queue/worker.ts'), 'utf8')).toContain('REPORT_CLAIMS_QUERY');
  });

  it('does not allow the legacy worker to create new UBV snapshots', () => {
    const worker = readFileSync(resolve(root, 'apps/api/src/queue/worker.ts'), 'utf8');

    expect(worker).toContain('legacy_ubv_aggregation_retired');
    expect(worker).not.toContain("source_type, ubv_snapshot, label)\n       VALUES ($1, $2, 'chat_turn'");
  });
});
