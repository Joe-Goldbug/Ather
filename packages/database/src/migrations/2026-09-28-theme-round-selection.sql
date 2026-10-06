-- Persist the recommendation decision actually used to open a theme round.
-- This contains identifiers and rule metadata only, never duplicated user text.
BEGIN;

ALTER TABLE theme_assessment_rounds
  ADD COLUMN IF NOT EXISTS selection_decision JSONB;

COMMIT;
