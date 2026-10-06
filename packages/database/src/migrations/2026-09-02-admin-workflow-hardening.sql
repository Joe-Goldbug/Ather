-- Admin feedback workflow: append-only transition history and constrained roles.
-- This is additive and safe to run after the original admin/Phase 1 migrations.

BEGIN;

ALTER TABLE admin_users DROP CONSTRAINT IF EXISTS admin_users_role_check;
ALTER TABLE admin_users ADD CONSTRAINT admin_users_role_check
  CHECK (role IN ('admin', 'support', 'research', 'security', 'product_viewer'));
ALTER TABLE admin_users DROP CONSTRAINT IF EXISTS admin_users_status_check;
ALTER TABLE admin_users ADD CONSTRAINT admin_users_status_check
  CHECK (status IN ('active', 'suspended'));

CREATE TABLE IF NOT EXISTS product_feedback_status_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  feedback_id UUID NOT NULL REFERENCES product_feedback(id) ON DELETE CASCADE,
  previous_status TEXT,
  next_status TEXT NOT NULL CHECK (next_status IN ('new', 'reviewing', 'confirmed', 'planned', 'resolved', 'closed')),
  previous_severity TEXT,
  next_severity TEXT NOT NULL CHECK (next_severity IN ('high', 'medium', 'low')),
  admin_user_id UUID REFERENCES admin_users(id) ON DELETE SET NULL,
  admin_email TEXT NOT NULL,
  internal_note TEXT,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_feedback_status_history_feedback_time
  ON product_feedback_status_history(feedback_id, occurred_at DESC);

COMMIT;
