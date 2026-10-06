-- migrations/003_evidence_extensions.sql
-- [S1-active] 新增单一角色分类 evidence_kind + 日期分组 + 候选 + 采集模式
--
-- 向后兼容策略：
--   旧 source_type 列保留不动，仅作"原始入口"的兼容标签（历史数据不变）。
--   所有权重/频率/来源覆盖逻辑改挂 evidence_kind 单一字段。
--   历史行通过 DEFAULT 'formal' 自动归类为正式测试证据。

BEGIN;

-- 1. evidence_kind：单一权威分类，权重/频率/覆盖逻辑的唯一依据
ALTER TABLE evidence_events
  ADD COLUMN IF NOT EXISTS evidence_kind TEXT NOT NULL DEFAULT 'formal'
    CHECK (evidence_kind IN
      ('formal','practice','calibration','reality','decision','correction','chat_legacy'));

-- 2. local_date：同维度同天递减计算用（第2条×0.5，第3条起×0.2）
ALTER TABLE evidence_events
  ADD COLUMN IF NOT EXISTS local_date DATE;

-- 3. candidate：候选证据标记，candidate=true 不进入正式画像聚合
ALTER TABLE evidence_events
  ADD COLUMN IF NOT EXISTS candidate BOOLEAN NOT NULL DEFAULT false;

-- 4. evidence_mode：采集模式（选项 or 自由文本填写）
ALTER TABLE evidence_events
  ADD COLUMN IF NOT EXISTS evidence_mode TEXT NOT NULL DEFAULT 'choice'
    CHECK (evidence_mode IN ('choice','input'));

COMMIT;
