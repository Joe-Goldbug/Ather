import { describe, expect, it } from 'vitest';
import { REPORT_CLAIMS_QUERY, REPORT_SOURCE_CLAIMS_QUERY } from './report-claims.js';

describe('report claim source boundary', () => {
  it('requires the current revision, all linked formal evidence from the owner, and support', () => {
    expect(REPORT_CLAIMS_QUERY).toContain('revision.id = observation.current_revision_id');
    expect(REPORT_CLAIMS_QUERY).toContain('LEFT JOIN observation_claim_evidence linked');
    expect(REPORT_CLAIMS_QUERY).toContain('formal.user_id = observation.user_id');
    expect(REPORT_CLAIMS_QUERY).toContain('COUNT(linked.evidence_event_id) = COUNT(formal.id)');
    expect(REPORT_CLAIMS_QUERY).toContain("FILTER (WHERE linked.role = 'support')");
    expect(REPORT_CLAIMS_QUERY).toContain("FILTER (WHERE linked.role = 'counterevidence')");
    expect(REPORT_CLAIMS_QUERY).toContain('observation_responses');
    expect(REPORT_CLAIMS_QUERY).toContain("latest_response.action = 'confirm'");
  });

  it('checks stored claim IDs without the new-report top-12 limit', () => {
    expect(REPORT_SOURCE_CLAIMS_QUERY).toContain('c.id = ANY($2::uuid[])');
    expect(REPORT_SOURCE_CLAIMS_QUERY).toContain('latest_response.action');
    expect(REPORT_SOURCE_CLAIMS_QUERY).toContain('formal.user_id = observation.user_id');
    expect(REPORT_SOURCE_CLAIMS_QUERY).not.toContain('LIMIT 12');
  });
});
