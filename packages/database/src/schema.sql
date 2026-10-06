-- packages/database/src/schema.sql
-- Phase 2: Complete schema for EVA Next.js + NestJS stack.
-- Run this against Neon PostgreSQL to set up all tables.
-- Based on legacy database migrations, adapted for the new API.

BEGIN;

-- ================================================================
-- Core user table
-- ================================================================
CREATE TABLE IF NOT EXISTS users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email         TEXT UNIQUE NOT NULL,
  name          TEXT,
  avatar_url    TEXT,
  email_hash    TEXT,
  session_token TEXT,
  session_expires_at TIMESTAMPTZ,
  memory_state  JSONB DEFAULT '{}',  -- Full Memory object (UBV + turns + topics + time_capsules)
  script_completed BOOLEAN DEFAULT false,
  entitlement_tier TEXT NOT NULL DEFAULT 'free' CHECK (entitlement_tier IN ('free', 'paid')),
  anonymous_id  TEXT,
  deletion_requested_at TIMESTAMPTZ,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_session_token ON users (session_token)
  WHERE session_token IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_users_email ON users (email);
CREATE INDEX IF NOT EXISTS idx_users_memory_state ON users USING GIN (memory_state);
CREATE INDEX IF NOT EXISTS idx_users_deletion_requested ON users (deletion_requested_at)
  WHERE deletion_requested_at IS NOT NULL;

-- ================================================================
-- Authentication and Sessions
-- ================================================================

-- Email login challenges for OTP
CREATE TABLE IF NOT EXISTS email_login_challenges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL,
  code_hash TEXT NOT NULL,  -- bcrypt hash of OTP
  expires_at TIMESTAMPTZ NOT NULL,
  attempts INTEGER DEFAULT 0,
  consumed BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_login_challenges_email_expires
  ON email_login_challenges(email, expires_at)
  WHERE NOT consumed;

CREATE INDEX IF NOT EXISTS idx_login_challenges_email_created
  ON email_login_challenges(email, created_at);

-- Session tokens (multiple devices)
CREATE TABLE IF NOT EXISTS session_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token TEXT UNIQUE NOT NULL,
  token_hash TEXT,
  expires_at TIMESTAMPTZ NOT NULL,
  revoked BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_session_tokens_token ON session_tokens(token) WHERE NOT revoked;
CREATE INDEX IF NOT EXISTS idx_session_tokens_user ON session_tokens(user_id);

-- Rate limiting for auth
CREATE TABLE IF NOT EXISTS auth_rate_limits (
  id BIGSERIAL PRIMARY KEY,
  identifier TEXT NOT NULL,  -- email or IP
  action TEXT NOT NULL,      -- 'send_code' or 'verify_code'
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_auth_rate_limits_lookup
  ON auth_rate_limits(identifier, action, created_at);

-- ================================================================
-- Dynamic Profiles (Phase 2 additions)
-- ================================================================
CREATE TABLE IF NOT EXISTS dynamic_profiles (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  anonymous_id UUID,
  session_id UUID,
  rt_score INTEGER,
  ic_score INTEGER,
  pa_score INTEGER,
  ar_score INTEGER,
  core_description TEXT,
  typical_moments TEXT[],
  personalized_insight TEXT,
  archetype_id TEXT,
  archetype_name TEXT,
  archetype_rarity TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_dynamic_profiles_user ON dynamic_profiles(user_id);

-- ================================================================
-- Evidence events (populated by chat, diary, assessment)
-- ================================================================
CREATE TABLE IF NOT EXISTS evidence_events (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  source_type TEXT NOT NULL,  -- 'test' | 'chat' | 'diary' | 'user_correction'
  source_id   TEXT,
  dimension   TEXT NOT NULL,  -- EvidenceDimension key
  delta       REAL,
  weight      REAL DEFAULT 1.0,
  confidence  REAL DEFAULT 0.5,
  quote       TEXT,
  explanation TEXT NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_evidence_user ON evidence_events (user_id);
CREATE INDEX IF NOT EXISTS idx_evidence_user_dimension ON evidence_events (user_id, dimension);
CREATE INDEX IF NOT EXISTS idx_evidence_source ON evidence_events (source_type, source_id);
CREATE INDEX IF NOT EXISTS idx_evidence_created ON evidence_events (created_at DESC);

-- ================================================================
-- Assessment runs (persistent record of completed assessments)
-- Task 3: Stores structured evidence of each assessment completion
-- ================================================================
CREATE TABLE IF NOT EXISTS assessment_runs (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  locale         TEXT NOT NULL,                              -- 'zh-CN' | 'en' | 'ja' | 'es'
  script_version TEXT NOT NULL,                              -- e.g. '2026-04-27-global-v1'
  scenario_set   TEXT NOT NULL,                              -- e.g. 'global_core_v1'
  choices        JSONB NOT NULL,                             -- Array of { scenarioId, choice, timestamp }
  result         JSONB NOT NULL,                            -- Full ScriptResult (vector + narrative + etc.)
  started_at     TIMESTAMPTZ,
  completed_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_assessment_runs_user ON assessment_runs (user_id);
CREATE INDEX IF NOT EXISTS idx_assessment_runs_user_completed ON assessment_runs (user_id, completed_at DESC);

-- ================================================================
-- Personality snapshots (time-series UBV history)
-- ================================================================
CREATE TABLE IF NOT EXISTS personality_snapshots (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  source_type    TEXT NOT NULL,  -- 'manual' | 'chat' | 'daily_mirror' | 'weekly_review'
  source_id      TEXT,
  conversation_id UUID,
  ubv_snapshot   JSONB NOT NULL,  -- Full UBV at snapshot time
  label          TEXT,
  created_at     TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_snapshots_user ON personality_snapshots (user_id);
CREATE INDEX IF NOT EXISTS idx_snapshots_created ON personality_snapshots (created_at DESC);

-- ================================================================
-- Shift events (You Shifted detection results — active events)
-- ================================================================
CREATE TABLE IF NOT EXISTS shift_events (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  dimension        TEXT NOT NULL,
  rci_value        REAL NOT NULL,
  rci_current      REAL NOT NULL,
  rci_baseline      REAL NOT NULL,
  magnitude        TEXT NOT NULL,
  comparison_type  TEXT NOT NULL,
  direction        TEXT NOT NULL,
  sources          JSONB NOT NULL DEFAULT '[]'::jsonb,
  narrative        TEXT NOT NULL,
  before_quote     TEXT,
  after_quote      TEXT,
  acknowledged     BOOLEAN NOT NULL DEFAULT false,
  meta             JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_shift_events_user ON shift_events (user_id);
CREATE INDEX IF NOT EXISTS idx_shift_events_user_created ON shift_events (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_shift_events_user_ack ON shift_events (user_id, acknowledged);

-- ================================================================
-- Conversations (dialogue sessions)
-- ================================================================
CREATE TABLE IF NOT EXISTS conversations (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  phase       TEXT DEFAULT 'probing',  -- probing | insufficient_evidence | enough_evidence | needs_micro_test | closed
  turns       JSONB DEFAULT '[]',       -- Array of DialogueTurn objects
  active_topics TEXT[],
  meta        JSONB DEFAULT '{}',
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_conversations_user ON conversations (user_id);
CREATE INDEX IF NOT EXISTS idx_conversations_meta ON conversations USING GIN (meta);

-- ================================================================
-- Conversation reports (generated after dialogue closes)
-- ================================================================
CREATE TABLE IF NOT EXISTS conversation_reports (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id       UUID UNIQUE REFERENCES conversations(id),
  user_id               UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status                TEXT NOT NULL DEFAULT 'generating',  -- generating | completed | failed
  report_locale         TEXT NOT NULL DEFAULT 'zh-CN',
  rt_score              REAL,
  ic_score              REAL,
  pa_score              REAL,
  ar_score              REAL,
  archetype_name        TEXT,
  archetype_description TEXT,
  core_traits           TEXT[],
  internal_tension      TEXT,
  behavior_patterns     TEXT[],
  suggestions           TEXT[],
  summary               TEXT,
  error_message         TEXT,
  report_data           JSONB,  -- Full structured report output
  created_at            TIMESTAMPTZ DEFAULT NOW(),
  updated_at            TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_reports_user ON conversation_reports (user_id);
CREATE INDEX IF NOT EXISTS idx_reports_status ON conversation_reports (status);
CREATE INDEX IF NOT EXISTS idx_reports_conversation ON conversation_reports (conversation_id);

-- ================================================================
-- Weekly reviews
-- ================================================================
CREATE TABLE IF NOT EXISTS weekly_reviews (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  week_start  DATE NOT NULL,
  week_end    DATE,
  content     JSONB DEFAULT '{}',  -- Full weekly review content
  summary     TEXT,                -- Short summary (nullable until generated)
  eva_message TEXT,              -- LLM-generated weekly narrative
  dominant_emotion TEXT,            -- Dominant mood label
  mood_trend  TEXT DEFAULT 'stable', -- 'rising' | 'stable' | 'declining'
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (user_id, week_start)
);

CREATE INDEX IF NOT EXISTS idx_weekly_user ON weekly_reviews (user_id);
CREATE INDEX IF NOT EXISTS idx_weekly_user_week ON weekly_reviews (user_id, week_start DESC);

-- ================================================================
-- Diary entries (daily mirror responses)
-- ================================================================
CREATE TABLE IF NOT EXISTS diary_entries (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  entry_date  DATE NOT NULL,
  content     JSONB DEFAULT '{}',  -- { q1: "...", q2: "...", q3: "...", q4: "..." }
  mood_label       TEXT,           -- Derived mood: '平静'|'开心'|'低落'|'焦虑'|...
  mood_intensity   REAL DEFAULT 0, -- 1–5 scale
  anchor_text      TEXT,           -- High/low point summary for worker
  pattern_text     TEXT,           -- Behavior pattern note
  timezone    TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (user_id, entry_date)
);

CREATE INDEX IF NOT EXISTS idx_diary_user ON diary_entries (user_id);
CREATE INDEX IF NOT EXISTS idx_diary_user_date ON diary_entries (user_id, entry_date DESC);

-- ================================================================
-- User corrections (user feedback on EVA's conclusions)
-- ================================================================
CREATE TABLE IF NOT EXISTS user_corrections (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  source_type   TEXT NOT NULL,
  source_id     TEXT,
  dimension     TEXT,
  original_text TEXT NOT NULL,
  corrected_text TEXT NOT NULL,
  explanation   TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_corrections_user ON user_corrections (user_id);

-- ================================================================
-- Consent grants (GDPR / data authorization)
-- ================================================================
CREATE TABLE IF NOT EXISTS consent_grants (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  consent_type  TEXT NOT NULL,  -- 'memory_retention' | 'evidence_collection' | 'report_storage' | 'third_party_sharing'
  granted       BOOLEAN NOT NULL,
  granted_at    TIMESTAMPTZ DEFAULT NOW(),
  revoked_at    TIMESTAMPTZ,
  ip_address    TEXT,
  user_agent    TEXT,
  UNIQUE (user_id, consent_type)
);

CREATE INDEX IF NOT EXISTS idx_consent_user ON consent_grants (user_id);
CREATE INDEX IF NOT EXISTS idx_consent_user_type ON consent_grants (user_id, consent_type);

-- ================================================================
-- Audit logs (immutable record of data changes)
-- ================================================================
CREATE TABLE IF NOT EXISTS audit_logs (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  table_name   TEXT NOT NULL,
  record_id    TEXT NOT NULL,
  action       TEXT NOT NULL,  -- INSERT | UPDATE | DELETE
  old_data     JSONB,
  new_data     JSONB,
  performed_by UUID REFERENCES users(id),
  performed_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_table_record ON audit_logs (table_name, record_id);
CREATE INDEX IF NOT EXISTS idx_audit_performed_by ON audit_logs (performed_by);
CREATE INDEX IF NOT EXISTS idx_audit_performed_at ON audit_logs (performed_at DESC);

-- ================================================================
-- Audit trigger function (auto-populate audit_logs)
-- ================================================================
CREATE OR REPLACE FUNCTION audit_trigger()
RETURNS TRIGGER AS $$
DECLARE
  audit_row audit_logs;
  diff_old JSONB;
  diff_new JSONB;
BEGIN
  audit_row = ROW(
    gen_random_uuid(),
    TG_TABLE_NAME,
    COALESCE(NEW.id::text, OLD.id::text),
    TG_OP,
    NULL,
    NULL,
    (SELECT st.user_id
     FROM session_tokens st
     WHERE st.token = current_setting('app.session_token', true)
       AND (st.revoked IS NULL OR st.revoked = false)
     LIMIT 1),
    NOW()
  )::audit_logs;

  IF TG_OP = 'UPDATE' THEN
    audit_row.old_data = to_jsonb(OLD);
    audit_row.new_data = to_jsonb(NEW);
  ELSIF TG_OP = 'DELETE' THEN
    audit_row.old_data = to_jsonb(OLD);
  ELSIF TG_OP = 'INSERT' THEN
    audit_row.new_data = to_jsonb(NEW);
  END IF;

  INSERT INTO audit_logs VALUES (audit_row.*);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Apply audit trigger to key tables
DROP TRIGGER IF EXISTS audit_users ON users;
CREATE TRIGGER audit_users
  AFTER UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION audit_trigger();

DROP TRIGGER IF EXISTS audit_evidence_events ON evidence_events;
CREATE TRIGGER audit_evidence_events
  AFTER INSERT ON evidence_events
  FOR EACH ROW EXECUTE FUNCTION audit_trigger();

DROP TRIGGER IF EXISTS audit_conversation_reports ON conversation_reports;
CREATE TRIGGER audit_conversation_reports
  AFTER INSERT ON conversation_reports
  FOR EACH ROW EXECUTE FUNCTION audit_trigger();

-- ================================================================
-- Row-Level Security (RLS)
-- ================================================================
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE evidence_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE personality_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversation_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE weekly_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE diary_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_corrections ENABLE ROW LEVEL SECURITY;
ALTER TABLE consent_grants ENABLE ROW LEVEL SECURITY;

-- Users can only see/modify their own rows
CREATE POLICY users_self ON users USING (true);  -- Auth handled at API layer
CREATE POLICY evidence_self ON evidence_events USING (user_id = (SELECT user_id FROM session_tokens WHERE token = current_setting('app.session_token', true) AND (revoked IS NULL OR revoked = false) LIMIT 1));
CREATE POLICY snapshots_self ON personality_snapshots USING (user_id = (SELECT user_id FROM session_tokens WHERE token = current_setting('app.session_token', true) AND (revoked IS NULL OR revoked = false) LIMIT 1));
CREATE POLICY conversations_self ON conversations USING (user_id = (SELECT user_id FROM session_tokens WHERE token = current_setting('app.session_token', true) AND (revoked IS NULL OR revoked = false) LIMIT 1));
CREATE POLICY reports_self ON conversation_reports USING (user_id = (SELECT user_id FROM session_tokens WHERE token = current_setting('app.session_token', true) AND (revoked IS NULL OR revoked = false) LIMIT 1));
CREATE POLICY weekly_self ON weekly_reviews USING (user_id = (SELECT user_id FROM session_tokens WHERE token = current_setting('app.session_token', true) AND (revoked IS NULL OR revoked = false) LIMIT 1));
CREATE POLICY diary_self ON diary_entries USING (user_id = (SELECT user_id FROM session_tokens WHERE token = current_setting('app.session_token', true) AND (revoked IS NULL OR revoked = false) LIMIT 1));
CREATE POLICY corrections_self ON user_corrections USING (user_id = (SELECT user_id FROM session_tokens WHERE token = current_setting('app.session_token', true) AND (revoked IS NULL OR revoked = false) LIMIT 1));
CREATE POLICY consent_self ON consent_grants USING (user_id = (SELECT user_id FROM session_tokens WHERE token = current_setting('app.session_token', true) AND (revoked IS NULL OR revoked = false) LIMIT 1));

COMMIT;
