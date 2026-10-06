-- Continuous Personality Portrait v1
--
-- This migration is intentionally additive. Existing UBV, archetype, report,
-- and evidence rows remain readable as legacy data, but no new formal path may
-- treat them as approved portrait evidence without explicit governance.

BEGIN;

CREATE TABLE IF NOT EXISTS governance_rule_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_key TEXT NOT NULL,
  version INTEGER NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('draft', 'approved', 'retired')),
  definition JSONB NOT NULL DEFAULT '{}'::jsonb,
  evidence_ref TEXT,
  approved_at TIMESTAMPTZ,
  retired_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (rule_key, version)
);

ALTER TABLE evidence_events
  ADD COLUMN IF NOT EXISTS portrait_status TEXT NOT NULL DEFAULT 'legacy_unclassified'
    CHECK (portrait_status IN ('legacy_unclassified', 'candidate', 'formal', 'rejected', 'withdrawn', 'revoked', 'invalidated')),
  ADD COLUMN IF NOT EXISTS status_rule_id UUID REFERENCES governance_rule_versions(id),
  ADD COLUMN IF NOT EXISTS context_key JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS source_revision TEXT,
  ADD COLUMN IF NOT EXISTS origin_operation_id UUID,
  ADD COLUMN IF NOT EXISTS quality_metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS purpose_scope TEXT,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- Existing candidates remain candidates; every other historical row remains
-- deliberately unclassified until an approved source mapping exists.
UPDATE evidence_events
SET portrait_status = CASE
  WHEN COALESCE(candidate, false) THEN 'candidate'
  ELSE 'legacy_unclassified'
END
WHERE portrait_status = 'legacy_unclassified';

CREATE INDEX IF NOT EXISTS idx_evidence_portrait_status
  ON evidence_events (user_id, portrait_status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_evidence_origin_operation
  ON evidence_events (origin_operation_id) WHERE origin_operation_id IS NOT NULL;

CREATE OR REPLACE VIEW portrait_formal_evidence_v1
WITH (security_barrier = true) AS
SELECT e.*
FROM evidence_events e
JOIN governance_rule_versions r ON r.id = e.status_rule_id
WHERE e.portrait_status = 'formal'
  AND COALESCE(e.candidate, false) = false
  AND e.purpose_scope IS NOT NULL
  AND r.status = 'approved';

CREATE TABLE IF NOT EXISTS evidence_source_fragments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  evidence_event_id UUID NOT NULL REFERENCES evidence_events(id) ON DELETE CASCADE,
  source_type TEXT NOT NULL,
  source_id UUID,
  source_revision TEXT,
  fragment_locator TEXT NOT NULL,
  consent_grant_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (evidence_event_id, fragment_locator)
);

CREATE TABLE IF NOT EXISTS evidence_relationships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  from_evidence_id UUID NOT NULL REFERENCES evidence_events(id) ON DELETE CASCADE,
  to_evidence_id UUID NOT NULL REFERENCES evidence_events(id) ON DELETE CASCADE,
  relation TEXT NOT NULL CHECK (relation IN ('supports', 'weakens', 'contradicts', 'contextualizes')),
  rule_id UUID REFERENCES governance_rule_versions(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (from_evidence_id, to_evidence_id, relation)
);

CREATE TABLE IF NOT EXISTS continuous_portraits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  current_revision_id UUID,
  state TEXT NOT NULL DEFAULT 'active' CHECK (state IN ('active', 'quarantined', 'deleted')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS portrait_revisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  portrait_id UUID NOT NULL REFERENCES continuous_portraits(id) ON DELETE CASCADE,
  revision_number INTEGER NOT NULL,
  operation_id UUID NOT NULL,
  aggregation_rule_id UUID REFERENCES governance_rule_versions(id),
  manifest_hash TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'unknown' CHECK (state IN ('unknown', 'computed', 'withheld', 'invalidated')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (portrait_id, revision_number),
  UNIQUE (portrait_id, operation_id),
  UNIQUE (portrait_id, manifest_hash)
);

ALTER TABLE continuous_portraits
  DROP CONSTRAINT IF EXISTS continuous_portraits_current_revision_id_fkey;
ALTER TABLE continuous_portraits
  ADD CONSTRAINT continuous_portraits_current_revision_id_fkey
  FOREIGN KEY (current_revision_id) REFERENCES portrait_revisions(id);

CREATE TABLE IF NOT EXISTS portrait_dimension_states (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  portrait_revision_id UUID NOT NULL REFERENCES portrait_revisions(id) ON DELETE CASCADE,
  dimension_key TEXT NOT NULL,
  layer TEXT NOT NULL CHECK (layer IN ('tendency', 'state', 'situational')),
  context_key JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'unknown' CHECK (status IN ('unknown', 'insufficient_evidence', 'non_comparable', 'available')),
  value JSONB,
  confidence JSONB,
  limitation_codes TEXT[] NOT NULL DEFAULT '{}',
  scale_rule_id UUID REFERENCES governance_rule_versions(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (portrait_revision_id, dimension_key, layer, context_key)
);

CREATE TABLE IF NOT EXISTS portrait_revision_evidence (
  portrait_revision_id UUID NOT NULL REFERENCES portrait_revisions(id) ON DELETE CASCADE,
  evidence_event_id UUID NOT NULL REFERENCES evidence_events(id),
  dimension_key TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('input', 'counterevidence', 'limitation')),
  input_order INTEGER NOT NULL,
  PRIMARY KEY (portrait_revision_id, evidence_event_id, role)
);

CREATE TABLE IF NOT EXISTS observation_selection_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  portrait_revision_id UUID NOT NULL REFERENCES portrait_revisions(id) ON DELETE CASCADE,
  selector_rule_id UUID REFERENCES governance_rule_versions(id),
  operation_id UUID NOT NULL,
  status TEXT NOT NULL DEFAULT 'withheld' CHECK (status IN ('completed', 'withheld', 'failed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (portrait_revision_id, operation_id)
);

CREATE TABLE IF NOT EXISTS observation_candidates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  selection_run_id UUID NOT NULL REFERENCES observation_selection_runs(id) ON DELETE CASCADE,
  candidate_key TEXT NOT NULL,
  observation_type TEXT NOT NULL CHECK (observation_type IN ('pattern', 'tension', 'change', 'context_difference', 'uncertainty')),
  rank_values JSONB NOT NULL DEFAULT '{}'::jsonb,
  inclusion_status TEXT NOT NULL CHECK (inclusion_status IN ('included', 'excluded', 'withheld')),
  exclusion_code TEXT,
  canonical_scope JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (selection_run_id, candidate_key)
);

CREATE TABLE IF NOT EXISTS observation_claims (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id UUID NOT NULL REFERENCES observation_candidates(id) ON DELETE CASCADE,
  claim_key TEXT NOT NULL,
  ordinal INTEGER NOT NULL,
  canonical_claim JSONB NOT NULL,
  confidence_state TEXT NOT NULL DEFAULT 'unknown',
  time_scope JSONB NOT NULL DEFAULT '{}'::jsonb,
  context_scope JSONB NOT NULL DEFAULT '{}'::jsonb,
  limitations JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (candidate_id, claim_key),
  UNIQUE (candidate_id, ordinal)
);

CREATE TABLE IF NOT EXISTS observation_claim_evidence (
  claim_id UUID NOT NULL REFERENCES observation_claims(id) ON DELETE CASCADE,
  evidence_event_id UUID NOT NULL REFERENCES evidence_events(id),
  role TEXT NOT NULL CHECK (role IN ('support', 'counterevidence', 'limitation', 'insufficiency')),
  ordinal INTEGER NOT NULL,
  PRIMARY KEY (claim_id, evidence_event_id, role)
);

CREATE TABLE IF NOT EXISTS published_observations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  current_revision_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS published_observation_revisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  published_observation_id UUID NOT NULL REFERENCES published_observations(id) ON DELETE CASCADE,
  revision_number INTEGER NOT NULL,
  candidate_id UUID NOT NULL REFERENCES observation_candidates(id),
  rendering_rule_id UUID REFERENCES governance_rule_versions(id),
  validation_rule_id UUID REFERENCES governance_rule_versions(id),
  locale_rule_id UUID REFERENCES governance_rule_versions(id),
  publication_status TEXT NOT NULL CHECK (publication_status IN ('published', 'fallback', 'withheld')),
  final_text TEXT,
  fallback_text TEXT,
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (published_observation_id, revision_number)
);

ALTER TABLE published_observations
  DROP CONSTRAINT IF EXISTS published_observations_current_revision_id_fkey;
ALTER TABLE published_observations
  ADD CONSTRAINT published_observations_current_revision_id_fkey
  FOREIGN KEY (current_revision_id) REFERENCES published_observation_revisions(id);

CREATE TABLE IF NOT EXISTS observation_responses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  published_observation_revision_id UUID NOT NULL REFERENCES published_observation_revisions(id),
  operation_id UUID NOT NULL,
  request_fingerprint TEXT NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('confirm', 'partial', 'refute', 'clarify')),
  explanation TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, operation_id)
);

CREATE TABLE IF NOT EXISTS correction_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  response_id UUID NOT NULL UNIQUE REFERENCES observation_responses(id) ON DELETE CASCADE,
  candidate_evidence_id UUID REFERENCES evidence_events(id),
  current_revision_number INTEGER NOT NULL DEFAULT 1,
  state TEXT NOT NULL CHECK (state IN ('pending_validation', 'validating', 'recalculating', 'changed', 'stable', 'no_change', 'failed', 'withdrawn', 'superseded')),
  outcome_rule_id UUID REFERENCES governance_rule_versions(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS correction_record_revisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  correction_record_id UUID NOT NULL REFERENCES correction_records(id) ON DELETE CASCADE,
  revision_number INTEGER NOT NULL,
  state TEXT NOT NULL,
  reason_code TEXT,
  result_revision_id UUID REFERENCES portrait_revisions(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (correction_record_id, revision_number)
);

CREATE TABLE IF NOT EXISTS portrait_outbox (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type TEXT NOT NULL,
  aggregate_id UUID NOT NULL,
  payload_minimized JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  delivered_at TIMESTAMPTZ,
  attempts INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_portrait_outbox_pending
  ON portrait_outbox (created_at) WHERE delivered_at IS NULL;

CREATE TABLE IF NOT EXISTS agent_scope_grants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  agent_id TEXT NOT NULL,
  purpose_scope TEXT NOT NULL,
  scopes TEXT[] NOT NULL DEFAULT '{}',
  rule_id UUID NOT NULL REFERENCES governance_rule_versions(id),
  granted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  UNIQUE (user_id, agent_id, purpose_scope, rule_id)
);

CREATE INDEX IF NOT EXISTS idx_agent_scope_grants_lookup
  ON agent_scope_grants (user_id, agent_id, purpose_scope)
  WHERE revoked_at IS NULL;

CREATE TABLE IF NOT EXISTS legacy_archetype_references (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  source_type TEXT NOT NULL,
  source_id UUID,
  legacy_value TEXT NOT NULL,
  legacy_model_version TEXT,
  migration_batch_id UUID,
  read_only BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS historical_report_references (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  conversation_report_id UUID NOT NULL,
  serialized_checksum TEXT NOT NULL,
  legacy_notice_version TEXT NOT NULL DEFAULT 'v1',
  migration_batch_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (conversation_report_id)
);

COMMIT;
