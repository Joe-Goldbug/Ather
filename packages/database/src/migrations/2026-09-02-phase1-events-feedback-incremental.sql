-- Phase 1 Incremental Migration: Feedback, Product Events (Updated with Strict Constraints)
-- Date: 2026-09-02
-- Applies Gate 2 Event Contracts to existing tables

BEGIN;

-- 1. Product Feedback - Add new columns and constraints
DO $$ 
BEGIN
    -- Add columns if they don't exist
    BEGIN
        ALTER TABLE product_feedback ADD COLUMN category TEXT;
    EXCEPTION WHEN duplicate_column THEN END;
    
    BEGIN
        ALTER TABLE product_feedback ADD COLUMN source_page TEXT;
    EXCEPTION WHEN duplicate_column THEN END;
    
    BEGIN
        ALTER TABLE product_feedback ADD COLUMN severity TEXT DEFAULT 'medium';
    EXCEPTION WHEN duplicate_column THEN END;
    
    BEGIN
        ALTER TABLE product_feedback ADD COLUMN assigned_admin_id UUID REFERENCES admin_users(id) ON DELETE SET NULL;
    EXCEPTION WHEN duplicate_column THEN END;
    
    BEGIN
        ALTER TABLE product_feedback ADD COLUMN internal_note TEXT;
    EXCEPTION WHEN duplicate_column THEN END;
    
    BEGIN
        ALTER TABLE product_feedback ADD COLUMN resolved_at TIMESTAMPTZ;
    EXCEPTION WHEN duplicate_column THEN END;
END $$;

-- Update existing status/severity constraints
ALTER TABLE product_feedback DROP CONSTRAINT IF EXISTS product_feedback_status_check;
ALTER TABLE product_feedback ADD CONSTRAINT product_feedback_status_check CHECK (status IN ('new', 'reviewing', 'confirmed', 'planned', 'resolved', 'closed'));

ALTER TABLE product_feedback DROP CONSTRAINT IF EXISTS product_feedback_severity_check;
ALTER TABLE product_feedback ADD CONSTRAINT product_feedback_severity_check CHECK (severity IN ('high', 'medium', 'low'));

CREATE INDEX IF NOT EXISTS idx_product_feedback_status ON product_feedback(status);
CREATE INDEX IF NOT EXISTS idx_product_feedback_user ON product_feedback(user_id);


-- 2. Product Events - Add new columns and constraints
DO $$ 
BEGIN
    -- Add columns if they don't exist
    BEGIN
        ALTER TABLE product_events ADD COLUMN event_id TEXT;
    EXCEPTION WHEN duplicate_column THEN END;
    
    BEGIN
        ALTER TABLE product_events ADD COLUMN round_id TEXT;
    EXCEPTION WHEN duplicate_column THEN END;
    
    BEGIN
        ALTER TABLE product_events ADD COLUMN previous_node_id TEXT;
    EXCEPTION WHEN duplicate_column THEN END;
    
    BEGIN
        ALTER TABLE product_events ADD COLUMN next_node_id TEXT;
    EXCEPTION WHEN duplicate_column THEN END;
END $$;

-- Ensure event_id is UNIQUE
ALTER TABLE product_events DROP CONSTRAINT IF EXISTS product_events_event_id_key;
ALTER TABLE product_events ADD CONSTRAINT product_events_event_id_key UNIQUE (event_id);

-- Update event_name constraints
ALTER TABLE product_events DROP CONSTRAINT IF EXISTS product_events_event_name_check;
ALTER TABLE product_events ADD CONSTRAINT product_events_event_name_check CHECK (event_name IN (
    'round_started', 'node_presented', 'choice_selected', 'answer_submitted',
    'branch_entered', 'node_abandoned', 'round_completed', 'result_viewed',
    'result_confirmed', 'result_refuted', 'feedback_submitted'
));

-- Update duration_ms constraints
ALTER TABLE product_events DROP CONSTRAINT IF EXISTS product_events_duration_ms_check;
ALTER TABLE product_events ADD CONSTRAINT product_events_duration_ms_check CHECK (duration_ms IS NULL OR duration_ms >= 0);

CREATE INDEX IF NOT EXISTS idx_product_events_name_time ON product_events(event_name, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_product_events_user ON product_events(user_id);
CREATE INDEX IF NOT EXISTS idx_product_events_round ON product_events(round_id);
CREATE INDEX IF NOT EXISTS idx_product_events_event_id ON product_events(event_id);

-- 3. Login Events (Keep as CREATE TABLE IF NOT EXISTS since it's entirely new)
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
