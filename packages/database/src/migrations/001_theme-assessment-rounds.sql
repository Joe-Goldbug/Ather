-- Theme assessment rounds are a Track A reflection record. They do not feed
-- continuous_portraits until the measurement approvals explicitly allow it.

CREATE TABLE IF NOT EXISTS theme_assessment_rounds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  theme_lens TEXT NOT NULL CHECK (theme_lens IN ('emotion', 'relationship', 'social', 'workplace', 'self_evaluation')),
  locale TEXT NOT NULL DEFAULT 'zh-CN',
  status TEXT NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress', 'ready_to_complete', 'completed', 'withheld', 'abandoned')),
  question_bank_version TEXT NOT NULL,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_theme_assessment_rounds_user_theme
  ON theme_assessment_rounds (user_id, theme_lens, completed_at DESC);

CREATE TABLE IF NOT EXISTS theme_assessment_round_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  round_id UUID NOT NULL REFERENCES theme_assessment_rounds(id) ON DELETE CASCADE,
  ordinal INTEGER NOT NULL,
  question_id TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('core', 'clarifier', 'counterexample')),
  source TEXT NOT NULL CHECK (source IN ('static', 'dynamic')),
  parent_item_id UUID REFERENCES theme_assessment_round_items(id),
  definition JSONB NOT NULL,
  invalidated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (round_id, ordinal)
);

CREATE INDEX IF NOT EXISTS idx_theme_round_items_active
  ON theme_assessment_round_items (round_id, ordinal)
  WHERE invalidated_at IS NULL;

CREATE TABLE IF NOT EXISTS theme_assessment_round_answers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  round_id UUID NOT NULL REFERENCES theme_assessment_rounds(id) ON DELETE CASCADE,
  item_id UUID NOT NULL REFERENCES theme_assessment_round_items(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  operation_id TEXT NOT NULL,
  choice_id TEXT NOT NULL CHECK (choice_id IN ('A', 'B', 'C', 'D')),
  free_text TEXT,
  answered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  invalidated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (round_id, operation_id),
  UNIQUE (item_id, invalidated_at)
);

CREATE INDEX IF NOT EXISTS idx_theme_round_answers_active
  ON theme_assessment_round_answers (round_id, item_id)
  WHERE invalidated_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_theme_round_one_active_answer_per_item
  ON theme_assessment_round_answers (item_id)
  WHERE invalidated_at IS NULL;

CREATE TABLE IF NOT EXISTS theme_assessment_result_revisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  round_id UUID NOT NULL REFERENCES theme_assessment_rounds(id) ON DELETE CASCADE,
  revision_number INTEGER NOT NULL,
  result JSONB NOT NULL,
  invalidated_at TIMESTAMPTZ,
  published_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (round_id, revision_number)
);

CREATE TABLE IF NOT EXISTS theme_assessment_result_responses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  result_revision_id UUID NOT NULL REFERENCES theme_assessment_result_revisions(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  operation_id TEXT NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('confirm', 'partial', 'refute', 'clarify')),
  explanation TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (result_revision_id, operation_id)
);

ALTER TABLE theme_assessment_rounds ENABLE ROW LEVEL SECURITY;
ALTER TABLE theme_assessment_round_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE theme_assessment_round_answers ENABLE ROW LEVEL SECURITY;
ALTER TABLE theme_assessment_result_revisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE theme_assessment_result_responses ENABLE ROW LEVEL SECURITY;

CREATE POLICY theme_rounds_self ON theme_assessment_rounds
  USING (user_id = (SELECT user_id FROM session_tokens WHERE token = current_setting('app.session_token', true) AND (revoked IS NULL OR revoked = false) LIMIT 1));
CREATE POLICY theme_round_items_self ON theme_assessment_round_items
  USING (round_id IN (SELECT id FROM theme_assessment_rounds WHERE user_id = (SELECT user_id FROM session_tokens WHERE token = current_setting('app.session_token', true) AND (revoked IS NULL OR revoked = false) LIMIT 1)));
CREATE POLICY theme_round_answers_self ON theme_assessment_round_answers
  USING (user_id = (SELECT user_id FROM session_tokens WHERE token = current_setting('app.session_token', true) AND (revoked IS NULL OR revoked = false) LIMIT 1));
CREATE POLICY theme_result_revisions_self ON theme_assessment_result_revisions
  USING (round_id IN (SELECT id FROM theme_assessment_rounds WHERE user_id = (SELECT user_id FROM session_tokens WHERE token = current_setting('app.session_token', true) AND (revoked IS NULL OR revoked = false) LIMIT 1)));
CREATE POLICY theme_result_responses_self ON theme_assessment_result_responses
  USING (user_id = (SELECT user_id FROM session_tokens WHERE token = current_setting('app.session_token', true) AND (revoked IS NULL OR revoked = false) LIMIT 1));
