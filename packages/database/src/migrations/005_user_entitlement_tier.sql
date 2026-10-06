-- Add the minimal V1 entitlement switch.
-- Payment/billing integration can later write to this field or replace it with
-- a subscription-derived source of truth.

BEGIN;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS entitlement_tier TEXT NOT NULL DEFAULT 'free';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'users_entitlement_tier_check'
  ) THEN
    ALTER TABLE users
      ADD CONSTRAINT users_entitlement_tier_check
      CHECK (entitlement_tier IN ('free', 'paid'));
  END IF;
END $$;

COMMIT;
