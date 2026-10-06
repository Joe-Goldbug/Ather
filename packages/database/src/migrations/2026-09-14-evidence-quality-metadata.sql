-- migrations/2026-09-14-evidence-quality-metadata.sql
-- [P1-8 修复] 为 evidence_events 加 quality_metadata JSONB 列，存储主体归因 / 质量标记等元数据
-- v1 仅使用 attribution 字段，后续按需扩展
BEGIN;

ALTER TABLE evidence_events
  ADD COLUMN IF NOT EXISTS quality_metadata JSONB;

COMMIT;