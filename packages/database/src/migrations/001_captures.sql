-- migrations/001_captures.sql
-- [S1-active] 现实碎片表：一天多条，替代 diary_entries 的 UNIQUE(user_id, entry_date) 限制
-- 三入口（quick_fragment / emotion_log / decision_log）
-- 三处理模式（save_only / organize / analyze）
-- 多模态（text / voice_transcript / image）

BEGIN;

CREATE TABLE IF NOT EXISTS captures (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  -- 三入口：快速碎片 / 情绪记录 / 决策记录
  entry_type    TEXT NOT NULL CHECK (entry_type IN
                  ('quick_fragment','emotion_log','decision_log')),

  -- 三处理模式：只保存 / 帮我整理 / 分析模式
  process_mode  TEXT NOT NULL DEFAULT 'save_only' CHECK (process_mode IN
                  ('save_only','organize','analyze')),

  -- 多模态：文字优先, 语音转写次之, 图片低权重仅作上下文
  modality      TEXT NOT NULL DEFAULT 'text' CHECK (modality IN
                  ('text','voice_transcript','image')),

  raw_text      TEXT,                          -- 用户原始表达(文字/转写)
  media_url     TEXT,                          -- 图片/音频存储引用
  source_weight REAL NOT NULL DEFAULT 1.0,     -- text=1.0 voice=0.6 image=0.2

  -- 一天多条：用 captured_at 时间戳, 不带 UNIQUE(user_id, date)
  captured_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  local_date    DATE,                          -- 用户本地日期(分组用, 非唯一)
  timezone      TEXT,

  -- 情绪记录入口附带字段(emotion_log 时填)
  mood_label     TEXT,
  mood_intensity REAL,                          -- 1-5

  -- Stage 2/3 预留(本期不写入、不读取)
  capture_mode  TEXT NOT NULL DEFAULT 'real' CHECK (capture_mode IN
                  ('real','simulation')),
  linked_twin_id UUID,

  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_captures_user ON captures (user_id);
CREATE INDEX IF NOT EXISTS idx_captures_user_date ON captures (user_id, local_date DESC);
CREATE INDEX IF NOT EXISTS idx_captures_user_captured ON captures (user_id, captured_at DESC);
CREATE INDEX IF NOT EXISTS idx_captures_type ON captures (user_id, entry_type);

-- Row-Level Security (按 session_token 隔离, 同 evidence_events 模式)
ALTER TABLE captures ENABLE ROW LEVEL SECURITY;
CREATE POLICY captures_self ON captures USING (
  user_id = (SELECT user_id FROM session_tokens
             WHERE token = current_setting('app.session_token', true)
               AND (revoked IS NULL OR revoked = false) LIMIT 1));

-- Audit trigger (复用现有 audit_trigger() 函数)
DROP TRIGGER IF EXISTS audit_captures ON captures;
CREATE TRIGGER audit_captures AFTER INSERT OR UPDATE ON captures
  FOR EACH ROW EXECUTE FUNCTION audit_trigger();

COMMIT;
