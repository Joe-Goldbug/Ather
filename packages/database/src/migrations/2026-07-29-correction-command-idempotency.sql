-- Adds idempotency metadata to the append-only correction lifecycle.
-- This is additive: prior correction revisions remain readable unchanged.

ALTER TABLE correction_record_revisions
  ADD COLUMN IF NOT EXISTS operation_id UUID,
  ADD COLUMN IF NOT EXISTS request_fingerprint TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_correction_revision_user_operation
  ON correction_record_revisions (operation_id)
  WHERE operation_id IS NOT NULL;
