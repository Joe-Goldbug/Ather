-- migrations/2026-09-14-published-observations-candidate-nullable.sql
-- [P0-2 修复] 让 published_observation_revisions.candidate_id 可空
-- 这样主题测试结果可以直接写 published_observations + revisions 而无需先有 observation_candidates 行
-- 主题轮的每条 observation 都对应一个 evidence_question_id，绕过 governance flow 的 observation_candidates 中间表
BEGIN;

ALTER TABLE published_observation_revisions
  ALTER COLUMN candidate_id DROP NOT NULL;

-- 在 evidence_question_id 上加可空文本列，方便反向追溯主题轮的题目
ALTER TABLE published_observation_revisions
  ADD COLUMN IF NOT EXISTS source_evidence_question_id TEXT;

ALTER TABLE published_observation_revisions
  ADD COLUMN IF NOT EXISTS source_theme_lens TEXT;

COMMIT;