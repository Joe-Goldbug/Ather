-- Bounded, user-authorized conversations for understanding one concrete situation.
-- Source text stays in the existing protected tables; this stores only the selected
-- source reference, an evidence snapshot, and the user's own conversation.

CREATE TABLE IF NOT EXISTS understanding_sessions (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  create_operation_id uuid NOT NULL,
  create_request_hash text NOT NULL,
  source_ref jsonb NOT NULL,
  source_snapshot jsonb NOT NULL,
  locale text NOT NULL DEFAULT 'zh-CN',
  state text NOT NULL DEFAULT 'open' CHECK (state IN ('open', 'closed')),
  version integer NOT NULL DEFAULT 1 CHECK (version >= 1),
  processing_authorized_at timestamptz NOT NULL,
  revoked_at timestamptz,
  saved_turn_id uuid,
  saved_at timestamptz,
  expires_at timestamptz,
  active_turn_id uuid,
  generation_token uuid,
  lease_until timestamptz,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, create_operation_id)
);

CREATE INDEX IF NOT EXISTS understanding_sessions_user_saved_idx
  ON understanding_sessions (user_id, saved_at DESC) WHERE saved_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS understanding_sessions_expiry_idx
  ON understanding_sessions (expires_at) WHERE expires_at IS NOT NULL AND saved_at IS NULL;

CREATE TABLE IF NOT EXISTS understanding_turns (
  id uuid PRIMARY KEY,
  session_id uuid NOT NULL REFERENCES understanding_sessions(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  seq integer NOT NULL CHECK (seq >= 1),
  operation_id uuid NOT NULL,
  request_hash text NOT NULL,
  action text NOT NULL CHECK (action IN ('message', 'correction', 'summarize', 'skip')),
  text text,
  parent_turn_id uuid,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'generating', 'complete', 'failed', 'cancelled')),
  output jsonb,
  error_code text,
  model text,
  prompt_version text,
  attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  created_at timestamptz NOT NULL DEFAULT NOW(),
  completed_at timestamptz,
  UNIQUE (session_id, seq),
  UNIQUE (session_id, operation_id)
);

CREATE INDEX IF NOT EXISTS understanding_turns_session_idx
  ON understanding_turns (session_id, seq);

-- Owner-safe RLS: the Neon owner role is also constrained by these policies.
ALTER TABLE understanding_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE understanding_sessions FORCE ROW LEVEL SECURITY;
CREATE POLICY understanding_sessions_self ON understanding_sessions
  USING (user_id = (SELECT user_id FROM session_tokens
                    WHERE token = current_setting('app.session_token', true)
                      AND NOT revoked AND expires_at > NOW()))
  WITH CHECK (user_id = (SELECT user_id FROM session_tokens
                         WHERE token = current_setting('app.session_token', true)
                           AND NOT revoked AND expires_at > NOW()));

ALTER TABLE understanding_turns ENABLE ROW LEVEL SECURITY;
ALTER TABLE understanding_turns FORCE ROW LEVEL SECURITY;
CREATE POLICY understanding_turns_self ON understanding_turns
  USING (user_id = (SELECT user_id FROM session_tokens
                    WHERE token = current_setting('app.session_token', true)
                      AND NOT revoked AND expires_at > NOW()))
  WITH CHECK (user_id = (SELECT user_id FROM session_tokens
                         WHERE token = current_setting('app.session_token', true)
                           AND NOT revoked AND expires_at > NOW()));
