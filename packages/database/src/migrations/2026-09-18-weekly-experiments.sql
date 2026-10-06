-- Voluntary weekly experiments are user-owned action records. A suggestion in
-- weekly_reviews.content never creates one by itself.

BEGIN;

CREATE TABLE IF NOT EXISTS weekly_experiments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  weekly_review_id UUID NOT NULL REFERENCES weekly_reviews(id) ON DELETE CASCADE,
  action_text TEXT NOT NULL,
  trigger_context TEXT NOT NULL,
  review_on DATE NOT NULL,
  state TEXT NOT NULL DEFAULT 'active' CHECK (state IN ('active', 'completed', 'paused')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, weekly_review_id)
);

CREATE TABLE IF NOT EXISTS weekly_experiment_checkins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  experiment_id UUID NOT NULL REFERENCES weekly_experiments(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  outcome TEXT NOT NULL CHECK (outcome IN ('done', 'partly_done', 'no_opportunity', 'paused')),
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_weekly_experiments_user_state
  ON weekly_experiments (user_id, state, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_weekly_experiment_checkins_experiment_created
  ON weekly_experiment_checkins (experiment_id, created_at DESC);

ALTER TABLE weekly_experiments ENABLE ROW LEVEL SECURITY;
ALTER TABLE weekly_experiment_checkins ENABLE ROW LEVEL SECURITY;

CREATE POLICY weekly_experiments_self ON weekly_experiments
  FOR ALL
  USING (user_id = (
    SELECT user_id FROM session_tokens
    WHERE token = current_setting('app.session_token', true)
      AND (revoked IS NULL OR revoked = false)
    LIMIT 1
  ))
  WITH CHECK (user_id = (
    SELECT user_id FROM session_tokens
    WHERE token = current_setting('app.session_token', true)
      AND (revoked IS NULL OR revoked = false)
    LIMIT 1
  ));

CREATE POLICY weekly_experiment_checkins_self ON weekly_experiment_checkins
  FOR ALL
  USING (user_id = (
    SELECT user_id FROM session_tokens
    WHERE token = current_setting('app.session_token', true)
      AND (revoked IS NULL OR revoked = false)
    LIMIT 1
  ))
  WITH CHECK (user_id = (
    SELECT user_id FROM session_tokens
    WHERE token = current_setting('app.session_token', true)
      AND (revoked IS NULL OR revoked = false)
    LIMIT 1
  ));

COMMIT;
