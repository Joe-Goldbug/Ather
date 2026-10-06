-- Migration: 2026-09-01-guest-opening.sql
-- Description: Adds entry_source and guest_run_id to theme_assessment_rounds for guest claiming

ALTER TABLE theme_assessment_rounds ADD COLUMN IF NOT EXISTS entry_source text not null default 'registered_theme';
ALTER TABLE theme_assessment_rounds ADD COLUMN IF NOT EXISTS guest_run_id uuid null;
ALTER TABLE theme_assessment_rounds DROP CONSTRAINT IF EXISTS theme_assessment_rounds_entry_source_check;
ALTER TABLE theme_assessment_rounds ADD CONSTRAINT theme_assessment_rounds_entry_source_check
  CHECK (entry_source IN ('registered_theme', 'guest_opening_claim'));
CREATE UNIQUE INDEX IF NOT EXISTS idx_theme_assessment_rounds_guest_run_id ON theme_assessment_rounds(guest_run_id) WHERE guest_run_id IS NOT NULL;
