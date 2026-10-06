-- migrations/2026-09-14-result-response-observation-id.sql
-- [P0-3 修复] 让 theme_assessment_result_responses 能记录"对哪条 observation 反馈"
-- evidence_question_id NULL 表示整报告级反馈
BEGIN;

ALTER TABLE theme_assessment_result_responses
  ADD COLUMN IF NOT EXISTS evidence_question_id TEXT;

CREATE INDEX IF NOT EXISTS idx_tarr_evidence_question
  ON theme_assessment_result_responses (result_revision_id, evidence_question_id)
  WHERE evidence_question_id IS NOT NULL;

COMMIT;