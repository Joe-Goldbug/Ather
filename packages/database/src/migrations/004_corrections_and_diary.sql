-- migrations/004_corrections_and_diary.sql
-- [S1-active] 纠正候选字段 + diary 只读归档标记
--
-- Part 1: diary_entries 标记为只读归档（不删表、不删数据）
-- Part 2: user_corrections 增加候选验证字段
--
-- 设计说明：
--   candidate_status 默认 'candidate'，已有行自动归为候选状态。
--   candidate_evidence_id FK 指向 evidence_events(id)，追溯 ×0.8 候选证据。
--   source_type_ext 对齐 correction-analytics.ts CorrectionRow.source_type 值。

BEGIN;

-- ================================================================
-- Part 1: diary readonly
-- [S1 deprecate] 标记 diary_entries 为只读归档; 不删数据
-- ================================================================
COMMENT ON TABLE diary_entries IS
  '[DEPRECATED S1] read-only archive. New writes go to captures. Do not INSERT.';

-- ================================================================
-- Part 2: corrections candidate [S1-active]
-- ================================================================

-- candidate_status: 候选纠正的生命周期状态
ALTER TABLE user_corrections
  ADD COLUMN IF NOT EXISTS candidate_status TEXT NOT NULL DEFAULT 'candidate'
    CHECK (candidate_status IN ('candidate','verifying','verified','expired'));

-- verified_at: 候选通过验证的时间戳
ALTER TABLE user_corrections
  ADD COLUMN IF NOT EXISTS verified_at TIMESTAMPTZ;

-- candidate_evidence_id: 关联的候选证据（×0.8），可追溯来源
ALTER TABLE user_corrections
  ADD COLUMN IF NOT EXISTS candidate_evidence_id UUID
    REFERENCES evidence_events(id);

-- source_type_ext: 纠正来源扩展类型（'report_claim'|'chat_claim'|'assessment_claim'）
ALTER TABLE user_corrections
  ADD COLUMN IF NOT EXISTS source_type_ext TEXT;

COMMIT;
