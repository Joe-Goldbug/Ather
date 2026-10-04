-- 000_foundation.sql — Ather-Solana 闭环基础表
--
-- 从 Ather-ethan 的 packages/database/src/schema.sql 精简而来，
-- 只保留闭环必需（认证 + 主题轮）依赖的表。
--
-- 迁移文件名统一为「4位序号_描述.sql」格式，避免与 Ather-ethan
-- 混用的两套格式（2026-09-02-x.sql /20260725120000_x.sql）产生排序错位。

BEGIN;

-- ── users ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email         TEXT UNIQUE NOT NULL,
  name          TEXT,
  avatar_url    TEXT,
  email_hash    TEXT,
  session_token TEXT,
  session_expires_at TIMESTAMPTZ,
  memory_state  JSONB DEFAULT '{}',
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

-- ── session_tokens ───────────────────────────────────────────────────────
-- RLS 的解析入口：所有 RLS 策略都用 token 反查 user_id。
CREATE TABLE IF NOT EXISTS session_tokens (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token        TEXT UNIQUE NOT NULL,
  token_hash   TEXT,
  expires_at   TIMESTAMPTZ NOT NULL,
  revoked      BOOLEAN DEFAULT FALSE,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_session_tokens_token ON session_tokens(token) WHERE NOT revoked;
CREATE INDEX IF NOT EXISTS idx_session_tokens_user ON session_tokens(user_id);

-- ── email_login_challenges（邮箱 OTP 挑战）────────────────────────────────
CREATE TABLE IF NOT EXISTS email_login_challenges (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email      TEXT NOT NULL,
  attempts   INTEGER NOT NULL DEFAULT 0,
  locked_until TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_email_login_challenges_email ON email_login_challenges(email);

-- ── auth_rate_limits ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS auth_rate_limits (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bucket     TEXT NOT NULL,
  window_started_at TIMESTAMPTZ NOT NULL,
  count      INTEGER NOT NULL DEFAULT 0,
  UNIQUE (bucket, window_started_at)
);

-- ── login_events（登录事件审计，auth.service 写入）───────────────────────
CREATE TABLE IF NOT EXISTS login_events (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID REFERENCES users(id) ON DELETE SET NULL,
  session_token_id UUID,
  event_type      TEXT NOT NULL DEFAULT 'login_success',
  ip_address      TEXT,
  device_type     TEXT,
  browser         TEXT,
  operating_system TEXT,
  occurred_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_login_events_user ON login_events(user_id);

-- ── assessment_runs（基线测评记录）──────────────────────────────────────
-- auth.service 的 getBaselineCompleted() 会查这张表判断是否完成过基线：
--   SELECT EXISTS (SELECT 1 FROM assessment_runs
--                  WHERE user_id = $1 AND scenario_set = $2)
-- 注意：主题轮不写这张表（闭环走 theme_assessment_*），但 auth/me 依赖它存在。
-- 基线的**写入**路径在 Ather-ethan 已退役（Ather-Solana 走主题轮路线），
-- 因此本表目前只读，为将来接入基线预留。
CREATE TABLE IF NOT EXISTS assessment_runs (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  locale         TEXT NOT NULL,
  script_version TEXT NOT NULL,
  scenario_set   TEXT NOT NULL,
  choices        JSONB NOT NULL DEFAULT '[]'::jsonb,
  result         JSONB NOT NULL DEFAULT '{}'::jsonb,
  started_at     TIMESTAMPTZ,
  completed_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_assessment_runs_user ON assessment_runs (user_id);
CREATE INDEX IF NOT EXISTS idx_assessment_runs_user_completed
  ON assessment_runs (user_id, completed_at DESC);

-- ── captures（现实记录）──────────────────────────────────────────────────
--闭环阶段只被 theme-assessment 的 recommendNextRound 读COUNT：
--   SELECT COUNT(*) FROM captures WHERE user_id = $1
-- 记录数 < 3 时建议用户先补充现实记录再测下一轮。
-- 完整的 captures 能力（证据抽取/确认/反驳）属P2，见迁移清单。
CREATE TABLE IF NOT EXISTS captures (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  entry_type        TEXT NOT NULL DEFAULT 'emotion_log'
                      CHECK (entry_type IN ('quick_fragment', 'emotion_log', 'decision_log')),
  process_mode      TEXT NOT NULL DEFAULT 'save_only'
                      CHECK (process_mode IN ('save_only', 'organize', 'analyze')),
  modality          TEXT NOT NULL DEFAULT 'text'
                      CHECK (modality IN ('text', 'voice_transcript', 'image')),
  raw_text          TEXT,
  media_url         TEXT,
  source_weight     NUMERIC NOT NULL DEFAULT 1,
  captured_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  local_date        DATE,
  timezone          TEXT,
  mood_label        TEXT,
  mood_intensity    NUMERIC,
  capture_mode      TEXT NOT NULL DEFAULT 'real',
  linked_twin_id    UUID,
  emitted_evidence_id UUID,
  allow_weekly_review BOOLEAN NOT NULL DEFAULT FALSE,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_captures_user ON captures(user_id, captured_at DESC);

ALTER TABLE captures ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS captures_self ON captures;
CREATE POLICY captures_self ON captures
  USING (user_id = (SELECT user_id FROM session_tokens
                    WHERE token = current_setting('app.session_token', true)
                      AND NOT revoked
                      AND expires_at > NOW()));

-- ── consent_grants（授权，report/evidence 写入时校验）─────────────────────
CREATE TABLE IF NOT EXISTS consent_grants (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  scope      TEXT NOT NULL,
  granted    BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (user_id, scope)
);

-- ── audit_logs（审计）───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS audit_logs (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID,
  action     TEXT NOT NULL,
  detail     JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_user ON audit_logs(user_id, created_at DESC);

COMMIT;
