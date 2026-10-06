-- packages/database/src/migrations/20260731170000_shift_events.sql
--
-- [P0 fix — You Shifted integration]
-- New table shift_events to persist detected personality shifts independently
-- from personality_snapshots.
--
-- Design (confirmed with user):
--   * personality_snapshots = passive time-series records (UBV at snapshot time)
--   * shift_events          = active events fired by detectYouShifted + detectShift
--
-- Keeping them separate preserves the temporal integrity of snapshots and gives
-- shift events their own lifecycle (acknowledged flag, extra metadata).
--
-- Idempotent (CREATE TABLE/INDEX IF NOT EXISTS) so re-running apply-db-migrations
-- is safe.

CREATE TABLE IF NOT EXISTS shift_events (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  -- Which dimension shifted
  dimension        TEXT NOT NULL,

  -- RCI math (from core computeRCI / detectYouShifted)
  rci_value        REAL NOT NULL,          -- signed RCI = (current - baseline) / SE
  rci_current      REAL NOT NULL,          -- current UBV value (0-100)
  rci_baseline     REAL NOT NULL,          -- baseline UBV value (0-100)

  -- Classification
  magnitude        TEXT NOT NULL,          -- 'subtle' | 'moderate' | 'profund'
  comparison_type  TEXT NOT NULL,          -- 'recent' | 'longterm' | 'both'
  direction        TEXT NOT NULL,          -- 'positive' | 'negative'
  sources          JSONB NOT NULL DEFAULT '[]'::jsonb,  -- evidence source types

  -- Narrative (localized) — the "You Shifted" message shown to the user
  narrative        TEXT NOT NULL,
  before_quote     TEXT,
  after_quote      TEXT,

  -- Lifecycle
  acknowledged     BOOLEAN NOT NULL DEFAULT false,
  -- Extra gate/diagnostic context (confidence, days_since_correction, raw gates)
  meta             JSONB NOT NULL DEFAULT '{}'::jsonb,

  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_shift_events_user ON shift_events (user_id);
CREATE INDEX IF NOT EXISTS idx_shift_events_user_created ON shift_events (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_shift_events_user_ack ON shift_events (user_id, acknowledged);
