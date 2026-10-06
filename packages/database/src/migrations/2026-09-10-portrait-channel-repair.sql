-- Portrait evidence channel repair
--
-- 背景：
--   1. [P0] conversation_reports 缺 report_data 列 —— worker.ts:113 的 completeReport
--      写该列，缺列导致报告生成必然失败（报告链路整条不可用）。
--   2. [0-3] portrait_formal_evidence_v1 视图恒空：5 重条件无一满足
--      （portrait_status='formal' 无写入 / status_rule_id 无写入 /
--        INNER JOIN governance_rule_versions / r.status='approved' / purpose_scope NOT NULL）
--      → 7 处消费方全部拿空集：报告 allowedIds、profile 画像与进化、证据列表、
--        画像聚合、观察关联、V3 Agent Context 对外通道。
--
-- 方案 A「最小晋升规则」（符合架构意图，不绕过治理门禁）：
--   建立 1 条 approved 规则，仅把「测评 / 微沙盒产生的结构化证据」
--   （evidence_kind='formal' 且 candidate=false）晋升为正式证据。
--   候选证据（observation_response / calibration）一律不晋升。
--
-- 幂等：可重复执行。
-- 本文件同时被 scripts/repair-portrait-channel.mjs 引用执行。

BEGIN;

-- ── 1. 修复报告写入缺列 ─────────────────────────────────────────────────────
ALTER TABLE conversation_reports
  ADD COLUMN IF NOT EXISTS report_data JSONB;

-- ── 2. 建立 approved 治理规则 ──────────────────────────────────────────────
INSERT INTO governance_rule_versions (rule_key, version, status, definition, evidence_ref, approved_at)
VALUES (
  'portrait_formal_v1',
  1,
  'approved',
  '{
     "scope": "evidence_kind=formal AND candidate=false",
     "purpose_scope": "evidence_collection",
     "note": "测评 / 微沙盒产生的结构化证据可进入正式画像视图；候选证据一律不晋升",
     "approved_by": "engineering-repair-2026-09-10"
   }'::jsonb,
  'docs/EVA-补链待办清单-定稿-2026-09-10.md',
  NOW()
)
ON CONFLICT (rule_key, version) DO NOTHING;

-- ── 3. 晋升既有证据 ────────────────────────────────────────────────────────
UPDATE evidence_events
SET portrait_status = 'formal',
    status_rule_id  = (SELECT id FROM governance_rule_versions
                       WHERE rule_key = 'portrait_formal_v1' AND version = 1 AND status = 'approved'),
    purpose_scope   = COALESCE(purpose_scope, 'evidence_collection'),
    updated_at      = NOW()
WHERE evidence_kind = 'formal'
  AND COALESCE(candidate, false) = false
  AND portrait_status <> 'formal'
  AND (SELECT id FROM governance_rule_versions
       WHERE rule_key = 'portrait_formal_v1' AND version = 1 AND status = 'approved') IS NOT NULL;

-- ── 4. 触发器：新写入的正式证据自动晋升（保证修复可持续）───────────────────
--
-- 为什么用触发器：evidence_events 的写入路径有 4 处
--   （evidence.service.ts writeEvidence + assessment/calibration/observation-response 三处直接 INSERT），
-- 逐处改应用代码易漏且回归风险高；晋升本质是「数据治理规则」，属数据层职责。
-- 仅当 portrait_status 仍是默认值 'legacy_unclassified' 时才改写，不会覆盖显式状态。
CREATE OR REPLACE FUNCTION promote_formal_evidence_v1() RETURNS TRIGGER AS $$
DECLARE
  v_rule_id UUID;
BEGIN
  IF NEW.evidence_kind = 'formal'
     AND COALESCE(NEW.candidate, false) = false
     AND COALESCE(NEW.portrait_status, 'legacy_unclassified') = 'legacy_unclassified' THEN
    SELECT id INTO v_rule_id
      FROM governance_rule_versions
      WHERE rule_key = 'portrait_formal_v1' AND version = 1 AND status = 'approved'
      LIMIT 1;
    IF v_rule_id IS NOT NULL THEN
      NEW.portrait_status := 'formal';
      NEW.status_rule_id  := COALESCE(NEW.status_rule_id, v_rule_id);
      NEW.purpose_scope   := COALESCE(NEW.purpose_scope, 'evidence_collection');
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_promote_formal_evidence ON evidence_events;
CREATE TRIGGER trg_promote_formal_evidence
  BEFORE INSERT ON evidence_events
  FOR EACH ROW EXECUTE FUNCTION promote_formal_evidence_v1();

COMMIT;
