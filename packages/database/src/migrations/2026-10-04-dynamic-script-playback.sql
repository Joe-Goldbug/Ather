BEGIN;

ALTER TABLE dynamic_scripts
    ADD COLUMN IF NOT EXISTS played_path JSONB,
    ADD COLUMN IF NOT EXISTS play_completed_at TIMESTAMPTZ;

CREATE POLICY dynamic_scripts_update ON dynamic_scripts
    FOR UPDATE USING (
        user_id = (
            SELECT user_id FROM session_tokens
            WHERE token = current_setting('app.session_token', true)
            AND (revoked IS NULL OR revoked = FALSE)
        )
    ) WITH CHECK (
        user_id = (
            SELECT user_id FROM session_tokens
            WHERE token = current_setting('app.session_token', true)
            AND (revoked IS NULL OR revoked = FALSE)
        )
    );

COMMIT;
