-- 2026-09-11 · 阶段 2-C1 原始输入归档层
--
-- 目标：任意 evidence 可回溯到原始输入的字节，且哈希可重算验证；
-- 删除请求可证明（应用层级联删除时同删归档行）。
--
-- 写入方：diary.service 在证据写入同一事务内归档原始输入；
-- 哈希 = SHA256(canonicalJson(raw))（packages/core/src/evidence/archive.ts）。
-- JSONB 不保留键序，读回重算必须走同一 canonical 实现。

CREATE TABLE IF NOT EXISTS evidence_input_archives (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  source_type TEXT NOT NULL,
  source_id UUID,
  content_sha256 TEXT NOT NULL,
  content JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_evidence_input_archives_source UNIQUE (source_type, source_id)
);

CREATE INDEX IF NOT EXISTS idx_evidence_input_archives_user
  ON evidence_input_archives (user_id);
