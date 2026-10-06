-- Phase 1 integrity hardening: safe upgrade for installations that already
-- applied the original Phase 1 table migration. This migration never drops
-- business tables or deletes user data.

BEGIN;

ALTER TABLE users ADD COLUMN IF NOT EXISTS is_synthetic BOOLEAN NOT NULL DEFAULT FALSE;
UPDATE users SET is_synthetic = TRUE WHERE email LIKE 'qa+%' AND is_synthetic = FALSE;

ALTER TABLE product_events ADD COLUMN IF NOT EXISTS event_id TEXT;
ALTER TABLE product_events ADD COLUMN IF NOT EXISTS round_id TEXT;
ALTER TABLE product_events ADD COLUMN IF NOT EXISTS content_version TEXT;
ALTER TABLE product_events ADD COLUMN IF NOT EXISTS previous_node_id TEXT;
ALTER TABLE product_events ADD COLUMN IF NOT EXISTS next_node_id TEXT;

UPDATE product_events
SET event_id = 'legacy_' || id::text
WHERE event_id IS NULL OR btrim(event_id) = '';

WITH duplicate_events AS (
  SELECT id, row_number() OVER (PARTITION BY event_id ORDER BY occurred_at, id) AS ordinal
  FROM product_events
)
UPDATE product_events e
SET event_id = e.event_id || '_' || e.id::text
FROM duplicate_events d
WHERE e.id = d.id AND d.ordinal > 1;

UPDATE product_events
SET round_id = 'legacy_unknown_round'
WHERE round_id IS NULL OR btrim(round_id) = '';

UPDATE product_events
SET content_version = 'legacy_unknown'
WHERE content_version IS NULL OR btrim(content_version) = '';

UPDATE product_events
SET event_name = 'legacy_imported'
WHERE event_name NOT IN (
  'round_started', 'node_presented', 'choice_selected', 'answer_submitted',
  'branch_entered', 'node_abandoned', 'round_completed', 'result_viewed',
  'result_confirmed', 'result_refuted', 'feedback_submitted', 'legacy_imported'
);

ALTER TABLE product_events ALTER COLUMN event_id SET NOT NULL;
ALTER TABLE product_events ALTER COLUMN round_id SET NOT NULL;
ALTER TABLE product_events ALTER COLUMN content_version SET NOT NULL;

ALTER TABLE product_events DROP CONSTRAINT IF EXISTS product_events_event_id_key;
ALTER TABLE product_events ADD CONSTRAINT product_events_event_id_key UNIQUE (event_id);
ALTER TABLE product_events DROP CONSTRAINT IF EXISTS product_events_event_name_check;
ALTER TABLE product_events ADD CONSTRAINT product_events_event_name_check CHECK (event_name IN (
  'round_started', 'node_presented', 'choice_selected', 'answer_submitted',
  'branch_entered', 'node_abandoned', 'round_completed', 'result_viewed',
  'result_confirmed', 'result_refuted', 'feedback_submitted', 'legacy_imported'
));
ALTER TABLE product_events DROP CONSTRAINT IF EXISTS product_events_duration_ms_check;
ALTER TABLE product_events ADD CONSTRAINT product_events_duration_ms_check
  CHECK (duration_ms IS NULL OR duration_ms BETWEEN 0 AND 86400000);
CREATE INDEX IF NOT EXISTS idx_product_events_round ON product_events(round_id);

ALTER TABLE product_feedback ADD COLUMN IF NOT EXISTS category TEXT;
ALTER TABLE product_feedback ADD COLUMN IF NOT EXISTS source_page TEXT;
ALTER TABLE product_feedback ADD COLUMN IF NOT EXISTS severity TEXT;
ALTER TABLE product_feedback ADD COLUMN IF NOT EXISTS internal_note TEXT;
ALTER TABLE product_feedback ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMPTZ;

UPDATE product_feedback SET category = '历史反馈' WHERE category IS NULL OR btrim(category) = '';
UPDATE product_feedback SET source_page = 'legacy' WHERE source_page IS NULL OR btrim(source_page) = '';
UPDATE product_feedback SET severity = 'medium' WHERE severity IS NULL OR severity NOT IN ('high', 'medium', 'low');
UPDATE product_feedback SET status = 'new' WHERE status IS NULL OR status NOT IN ('new', 'reviewing', 'confirmed', 'planned', 'resolved', 'closed');

ALTER TABLE product_feedback ALTER COLUMN category SET NOT NULL;
ALTER TABLE product_feedback ALTER COLUMN severity SET NOT NULL;
ALTER TABLE product_feedback DROP CONSTRAINT IF EXISTS product_feedback_status_check;
ALTER TABLE product_feedback ADD CONSTRAINT product_feedback_status_check
  CHECK (status IN ('new', 'reviewing', 'confirmed', 'planned', 'resolved', 'closed'));
ALTER TABLE product_feedback DROP CONSTRAINT IF EXISTS product_feedback_severity_check;
ALTER TABLE product_feedback ADD CONSTRAINT product_feedback_severity_check
  CHECK (severity IN ('high', 'medium', 'low'));
ALTER TABLE product_feedback DROP CONSTRAINT IF EXISTS product_feedback_content_length_check;
ALTER TABLE product_feedback ADD CONSTRAINT product_feedback_content_length_check
  CHECK (char_length(btrim(content)) >= 2) NOT VALID;
ALTER TABLE product_feedback VALIDATE CONSTRAINT product_feedback_content_length_check;

COMMIT;
