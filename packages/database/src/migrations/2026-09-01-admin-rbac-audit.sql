-- Migration: 2026-09-01-admin-rbac-audit.sql
-- Description: Creates admin_users and admin_access_logs for minimum RBAC and sensitive data access auditing

CREATE TABLE IF NOT EXISTS admin_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  role TEXT NOT NULL DEFAULT 'product_viewer', -- 'admin' | 'support' | 'research' | 'security' | 'product_viewer'
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS admin_access_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_user_id UUID REFERENCES admin_users(id) ON DELETE SET NULL,
  admin_email TEXT NOT NULL,
  action TEXT NOT NULL, -- e.g. 'reveal_email' | 'reveal_ip' | 'reveal_raw_words' | 'export_metrics'
  target_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  resource_type TEXT NOT NULL, -- e.g. 'user_pii' | 'portrait_raw' | 'feedback_private'
  resource_id TEXT,
  reason TEXT,
  success BOOLEAN NOT NULL DEFAULT TRUE,
  metadata_minimized JSONB NOT NULL DEFAULT '{}',
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_admin_access_logs_admin_user ON admin_access_logs(admin_user_id);
CREATE INDEX IF NOT EXISTS idx_admin_access_logs_target_user ON admin_access_logs(target_user_id);
CREATE INDEX IF NOT EXISTS idx_admin_access_logs_occurred_at ON admin_access_logs(occurred_at DESC);

-- Seed default initial developer admin user if not exists
INSERT INTO admin_users (email, role, status)
VALUES ('admin@eva.local', 'admin', 'active')
ON CONFLICT (email) DO NOTHING;
