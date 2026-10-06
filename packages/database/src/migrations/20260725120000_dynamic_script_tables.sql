-- packages/database/src/migrations/20260725120000_dynamic_script_tables.sql

-- [Fix review-6] BEGIN/COMMIT wrapper is required by migration-verification.test.ts
-- All existing migrations (001-005, 2026-04-28) wrap the SQL body in a transaction.
BEGIN;

-- Session: one row per dynamic-script inquiry session
CREATE TABLE IF NOT EXISTS dynamic_script_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    initial_input TEXT NOT NULL,
    conversation JSONB NOT NULL DEFAULT '[]'::jsonb,
    extracted_variables JSONB,
    progress JSONB NOT NULL DEFAULT '{"scenario":0,"emotion":0,"background":0,"relationship":0}'::jsonb,
    turn_count INTEGER NOT NULL DEFAULT 0,
    status VARCHAR(20) NOT NULL DEFAULT 'in_progress'
        CHECK (status IN ('in_progress', 'completed', 'abandoned')),
    locale VARCHAR(10),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    abandoned_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_dynamic_script_sessions_user_status
    ON dynamic_script_sessions(user_id, status);
CREATE INDEX IF NOT EXISTS idx_dynamic_script_sessions_user_created
    ON dynamic_script_sessions(user_id, created_at DESC);

ALTER TABLE dynamic_script_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY dynamic_script_sessions_select ON dynamic_script_sessions
    FOR SELECT USING (
        user_id = (
            SELECT user_id FROM session_tokens
            WHERE token = current_setting('app.session_token', true)
            AND (revoked IS NULL OR revoked = FALSE)
        )
    );
CREATE POLICY dynamic_script_sessions_insert ON dynamic_script_sessions
    FOR INSERT WITH CHECK (
        user_id = (
            SELECT user_id FROM session_tokens
            WHERE token = current_setting('app.session_token', true)
            AND (revoked IS NULL OR revoked = FALSE)
        )
    );
CREATE POLICY dynamic_script_sessions_update ON dynamic_script_sessions
    FOR UPDATE USING (
        user_id = (
            SELECT user_id FROM session_tokens
            WHERE token = current_setting('app.session_token', true)
            AND (revoked IS NULL OR revoked = FALSE)
        )
    );

-- Generation: one row per async script generation job
CREATE TABLE IF NOT EXISTS dynamic_script_generations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL REFERENCES dynamic_script_sessions(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status VARCHAR(20) NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'generating', 'validating', 'revising', 'ready', 'failed')),
    progress_percentage INTEGER NOT NULL DEFAULT 0,
    current_step TEXT,
    result JSONB,
    error JSONB,
    validation_report JSONB,
    revised BOOLEAN NOT NULL DEFAULT FALSE,
    script_id UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    started_at TIMESTAMPTZ,
    ready_at TIMESTAMPTZ,
    failed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_dynamic_script_generations_session
    ON dynamic_script_generations(session_id);
CREATE INDEX IF NOT EXISTS idx_dynamic_script_generations_user_created
    ON dynamic_script_generations(user_id, created_at DESC);

ALTER TABLE dynamic_script_generations ENABLE ROW LEVEL SECURITY;

CREATE POLICY dynamic_script_generations_select ON dynamic_script_generations
    FOR SELECT USING (
        user_id = (
            SELECT user_id FROM session_tokens
            WHERE token = current_setting('app.session_token', true)
            AND (revoked IS NULL OR revoked = FALSE)
        )
    );
CREATE POLICY dynamic_script_generations_insert ON dynamic_script_generations
    FOR INSERT WITH CHECK (
        user_id = (
            SELECT user_id FROM session_tokens
            WHERE token = current_setting('app.session_token', true)
            AND (revoked IS NULL OR revoked = FALSE)
        )
    );
CREATE POLICY dynamic_script_generations_update ON dynamic_script_generations
    FOR UPDATE USING (
        user_id = (
            SELECT user_id FROM session_tokens
            WHERE token = current_setting('app.session_token', true)
            AND (revoked IS NULL OR revoked = FALSE)
        )
    );

-- Script: the final script payload
CREATE TABLE IF NOT EXISTS dynamic_scripts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL REFERENCES dynamic_script_sessions(id) ON DELETE CASCADE,
    generation_id UUID NOT NULL REFERENCES dynamic_script_generations(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    template_id TEXT,
    scenes JSONB NOT NULL,
    variables_used JSONB NOT NULL,
    psychological_narrative TEXT,
    comparison_summary TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_dynamic_scripts_user_created
    ON dynamic_scripts(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_dynamic_scripts_session
    ON dynamic_scripts(session_id);

ALTER TABLE dynamic_scripts ENABLE ROW LEVEL SECURITY;

CREATE POLICY dynamic_scripts_select ON dynamic_scripts
    FOR SELECT USING (
        user_id = (
            SELECT user_id FROM session_tokens
            WHERE token = current_setting('app.session_token', true)
            AND (revoked IS NULL OR revoked = FALSE)
        )
    );
CREATE POLICY dynamic_scripts_insert ON dynamic_scripts
    FOR INSERT WITH CHECK (
        user_id = (
            SELECT user_id FROM session_tokens
            WHERE token = current_setting('app.session_token', true)
            AND (revoked IS NULL OR revoked = FALSE)
        )
    );

-- Pending evidence: accumulator before flush
CREATE TABLE IF NOT EXISTS pending_dynamic_script_evidence (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    script_id UUID NOT NULL REFERENCES dynamic_scripts(id) ON DELETE CASCADE,
    dimension VARCHAR(64) NOT NULL,
    delta NUMERIC(5,3) NOT NULL,
    weight NUMERIC(4,3) NOT NULL DEFAULT 0.3,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    flushed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pending_dynamic_script_evidence_user_unflushed
    ON pending_dynamic_script_evidence(user_id) WHERE flushed_at IS NULL;

ALTER TABLE pending_dynamic_script_evidence ENABLE ROW LEVEL SECURITY;

CREATE POLICY pending_dynamic_script_evidence_select ON pending_dynamic_script_evidence
    FOR SELECT USING (
        user_id = (
            SELECT user_id FROM session_tokens
            WHERE token = current_setting('app.session_token', true)
            AND (revoked IS NULL OR revoked = FALSE)
        )
    );
CREATE POLICY pending_dynamic_script_evidence_insert ON pending_dynamic_script_evidence
    FOR INSERT WITH CHECK (
        user_id = (
            SELECT user_id FROM session_tokens
            WHERE token = current_setting('app.session_token', true)
            AND (revoked IS NULL OR revoked = FALSE)
        )
    );
-- [Fix review-4] UPDATE policy required: EvidenceBridge.flushIfReady() issues
-- UPDATE pending_dynamic_script_evidence SET flushed_at=NOW() but without an UPDATE
-- policy, RLS would silently block the operation in user context.
CREATE POLICY pending_dynamic_script_evidence_update ON pending_dynamic_script_evidence
    FOR UPDATE USING (
        user_id = (
            SELECT user_id FROM session_tokens
            WHERE token = current_setting('app.session_token', true)
            AND (revoked IS NULL OR revoked = FALSE)
        )
    );

-- [Fix review-6] close transaction (must mirror BEGIN above)
COMMIT;