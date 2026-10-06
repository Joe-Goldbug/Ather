-- migrations/2026-09-14-account-delete-fk.sql
-- [P0-5 修复] 账户删除（GDPR）时，capture_interpretations.emitted_evidence_id
-- 外键改为 ON DELETE SET NULL，使 evidence_events 行被删后 capture_interpretations
-- 仍可保留为追溯记录（只把外键置 NULL，不级联删除用户的确认历史）。
--
-- 修复前：用户删除账户 → consent.service.ts:80 先 DELETE FROM evidence_events
--   → capture_interpretations 行因 FK 无 CASCADE/SET NULL 而无法删除
--   → 整事务回滚 → 用户数据权失效
--
-- 修复后：evidence_events 行删除时，capture_interpretations.emitted_evidence_id
--   自动置 NULL，capture_interpretations 行保留，账户删除事务可继续。

BEGIN;

-- 找到 PG 自动生成的外键名（capture_interpretations_emitted_evidence_id_fkey）
-- 若已迁移过且约束名不同，IF EXISTS 兜底
ALTER TABLE capture_interpretations
  DROP CONSTRAINT IF EXISTS capture_interpretations_emitted_evidence_id_fkey;

ALTER TABLE capture_interpretations
  ADD CONSTRAINT capture_interpretations_emitted_evidence_id_fkey
    FOREIGN KEY (emitted_evidence_id) REFERENCES evidence_events(id) ON DELETE SET NULL;

COMMIT;