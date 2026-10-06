-- Critical consistency fixes for EVA API
-- Enforce one report per conversation to avoid duplicate async reports

-- Deduplicate existing report rows before applying unique constraint.
-- Keep the newest row per conversation_id.
DELETE FROM conversation_reports old
USING conversation_reports newer
WHERE old.conversation_id IS NOT NULL
  AND newer.conversation_id = old.conversation_id
  AND (
    newer.created_at > old.created_at
    OR (newer.created_at = old.created_at AND newer.id::text > old.id::text)
  );

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'conversation_reports_conversation_id_key'
  ) THEN
    ALTER TABLE conversation_reports
      ADD CONSTRAINT conversation_reports_conversation_id_key UNIQUE (conversation_id);
  END IF;
END
$$;
