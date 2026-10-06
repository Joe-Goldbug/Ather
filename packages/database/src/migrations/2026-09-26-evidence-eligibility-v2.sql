-- Historical provenance is unknown. Do not infer it from a legacy source tag.
BEGIN;

ALTER TABLE evidence_events
  ADD COLUMN IF NOT EXISTS epistemic_source TEXT NOT NULL DEFAULT 'unknown'
    CHECK (epistemic_source IN ('unknown', 'user_self_report', 'system_interaction', 'authorized_external_record')),
  ADD COLUMN IF NOT EXISTS content_kind TEXT NOT NULL DEFAULT 'unknown'
    CHECK (content_kind IN ('unknown', 'self_description', 'recalled_event', 'stated_intention', 'simulation_choice', 'product_action', 'user_correction')),
  ADD COLUMN IF NOT EXISTS source_independence_group TEXT;

-- The 2026-09-10 trigger promoted simulated choices solely on evidence_kind.
DROP TRIGGER IF EXISTS trg_promote_formal_evidence ON evidence_events;
DROP FUNCTION IF EXISTS promote_formal_evidence_v1();

-- Reclassify only rows the old rule had promoted without source semantics.
-- Keep the raw row and rule id for inspection; candidate=true also prevents
-- legacy worker counts from treating these rows as independent formal proof.
UPDATE evidence_events
SET candidate = true,
    portrait_status = 'candidate',
    updated_at = NOW()
WHERE portrait_status = 'formal'
  AND evidence_kind = 'formal'
  AND epistemic_source = 'unknown';

CREATE INDEX IF NOT EXISTS idx_evidence_independence_group
  ON evidence_events (user_id, dimension, source_independence_group)
  WHERE source_independence_group IS NOT NULL;

CREATE OR REPLACE VIEW portrait_eligible_evidence_v2
WITH (security_barrier = true) AS
SELECT e.*
FROM evidence_events e
JOIN governance_rule_versions r ON r.id = e.status_rule_id
WHERE e.portrait_status = 'formal'
  AND COALESCE(e.candidate, false) = false
  AND e.purpose_scope = 'portrait_inference'
  AND e.epistemic_source <> 'unknown'
  AND e.content_kind IN ('self_description', 'recalled_event', 'product_action')
  AND NULLIF(BTRIM(e.source_independence_group), '') IS NOT NULL
  AND e.quality_metadata->>'attribution' = 'self'
  AND r.status = 'approved';

-- Keep the legacy name fail-closed for consumers not yet migrated to v2.
CREATE OR REPLACE VIEW portrait_formal_evidence_v1
WITH (security_barrier = true) AS
SELECT * FROM portrait_eligible_evidence_v2;

COMMIT;
