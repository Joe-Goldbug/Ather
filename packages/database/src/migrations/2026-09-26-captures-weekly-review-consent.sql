-- Existing captures remain opted out; no historical rows are rewritten.
ALTER TABLE captures
  ADD COLUMN IF NOT EXISTS allow_weekly_review BOOLEAN NOT NULL DEFAULT false;

-- Without a prior-week comparison, a missing value must stay unknown.
ALTER TABLE weekly_reviews ALTER COLUMN mood_trend DROP DEFAULT;
