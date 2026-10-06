-- migrations/002_capture_interpretations.sql
-- [S1-active] AI 解释层：与用户原始表达和确认证据三者分离
-- 核心铁律：用户原始表达 ≠ AI 解释 ≠ 用户确认证据
-- 仅被用户确认或被重复证据支持的 interpretation 才以高权重更新 UBV

BEGIN;

CREATE TABLE IF NOT EXISTS capture_interpretations (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  capture_id      UUID NOT NULL REFERENCES captures(id) ON DELETE CASCADE,
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  dimension       TEXT NOT NULL,           -- EvidenceDimension key
  ai_explanation  TEXT NOT NULL,           -- AI 对原始表达的解释(假设)
  proposed_delta  REAL,                    -- AI 建议的维度 delta
  ai_confidence   REAL NOT NULL DEFAULT 0.5,

  -- 用户确认状态: 仅三态, 默认 pending 不入正式画像
  status          TEXT NOT NULL DEFAULT 'pending' CHECK (status IN
                    ('pending','confirmed','refuted')),
  confirmed_at    TIMESTAMPTZ,

  -- 重复证据支持: 同维度同向解释累计次数, 达阈值也可升权
  support_count   INTEGER NOT NULL DEFAULT 0,

  -- 确认/重复支持后生成的 evidence_events.id 回填(可追溯)
  emitted_evidence_id UUID REFERENCES evidence_events(id),

  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_capint_capture ON capture_interpretations (capture_id);
CREATE INDEX IF NOT EXISTS idx_capint_user_dim ON capture_interpretations (user_id, dimension);
CREATE INDEX IF NOT EXISTS idx_capint_status ON capture_interpretations (user_id, status);

-- Row-Level Security (按 session_token 隔离)
ALTER TABLE capture_interpretations ENABLE ROW LEVEL SECURITY;
CREATE POLICY capint_self ON capture_interpretations USING (
  user_id = (SELECT user_id FROM session_tokens
             WHERE token = current_setting('app.session_token', true)
               AND (revoked IS NULL OR revoked = false) LIMIT 1));

-- Audit trigger (复用现有 audit_trigger() 函数)
DROP TRIGGER IF EXISTS audit_capint ON capture_interpretations;
CREATE TRIGGER audit_capint AFTER INSERT OR UPDATE ON capture_interpretations
  FOR EACH ROW EXECUTE FUNCTION audit_trigger();

COMMIT;
