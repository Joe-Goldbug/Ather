-- Phase 1 Migration: Feedback, Product Events, Login Events (Updated with Strict Constraints & Idempotency)
-- Date: 2026-09-02
-- Applies Gate 2 Event Contracts

BEGIN;

-- 1. Product Feedback (工单系统)
CREATE TABLE IF NOT EXISTS product_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  category TEXT NOT NULL,          
  content TEXT NOT NULL,           
  source_page TEXT,                
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'reviewing', 'confirmed', 'planned', 'resolved', 'closed')),
  severity TEXT NOT NULL DEFAULT 'medium' CHECK (severity IN ('high', 'medium', 'low')),
  assigned_admin_id UUID REFERENCES admin_users(id) ON DELETE SET NULL,
  internal_note TEXT,              
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_product_feedback_status ON product_feedback(status);
CREATE INDEX IF NOT EXISTS idx_product_feedback_user ON product_feedback(user_id);

-- 2. Product Events (通用事件契约 & 题目时长采集 & 幂等去重)
CREATE TABLE IF NOT EXISTS product_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id TEXT UNIQUE,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  round_id TEXT,
  session_id UUID,
  event_name TEXT NOT NULL CHECK (event_name IN (
    'round_started', 'node_presented', 'choice_selected', 'answer_submitted',
    'branch_entered', 'node_abandoned', 'round_completed', 'result_viewed',
    'result_confirmed', 'result_refuted', 'feedback_submitted'
  )),
  content_version TEXT,
  node_id TEXT,
  scene_id TEXT,
  choice_id TEXT,
  path_id TEXT,
  previous_node_id TEXT,
  next_node_id TEXT,
  duration_ms INTEGER CHECK (duration_ms IS NULL OR duration_ms >= 0),
  metadata JSONB NOT NULL DEFAULT '{}',
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_product_events_name_time ON product_events(event_name, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_product_events_user ON product_events(user_id);
CREATE INDEX IF NOT EXISTS idx_product_events_round ON product_events(round_id);
CREATE INDEX IF NOT EXISTS idx_product_events_event_id ON product_events(event_id);

-- 3. Login Events (客户端环境与安全审计)
CREATE TABLE IF NOT EXISTS login_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  session_token_id UUID,
  event_type TEXT NOT NULL DEFAULT 'login_success',
  ip_address TEXT,
  device_type TEXT,
  browser TEXT,
  operating_system TEXT,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_login_events_user ON login_events(user_id);

COMMIT;
