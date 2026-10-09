# 主题情境测试 AI 化：实现计划（plan.md v1.1 — 已实施并验收）

> 依据：`docs/2026-10-09-theme-assessment-ai-design.md`（v0.2，开发者已确认 D1–D5）
> 阶段：superpowers **Implementation Planning → TDD 实施 → 端到端验收**（已完成）。
> 日期：2026-10-09（计划）／2026-10-10（实施+验收）

## ✅ 实施与验收结果（2026-10-10）

- **任务完成度：16/16**（P1–P6 全部完成）。
- **静态验证**：API `tsc --noEmit` 零错误；`nest build` 零错误；Web `tsc --noEmit` 零错误；
  `vitest` **21/21 全绿**（出题 9 + 洞察 12）。
- **端到端（本地 mock-llm）**：`node scripts/verify-theme-ai.mjs http://127.0.0.1:3010`
  → Round1/Round2 均 `generated_count:6`、`ai_insight: present` → **PASS**。
- **端到端（真实 Agnes 2.5-flash）**：`http://127.0.0.1:3013`
  → Round1 `ai_insight: present`；Round2 `generated_count:5` + `fallback_count:1`（逐题回退生效）、
  `ai_insight: present`（3 段）→ **PASS**。真实题面示例：
  “在连续加班两周后，你终于可以在周五晚上放松一下…”。
- **实施中发现并修复的可用性问题**：真实模型描述情绪时易命中禁语（焦虑/抑郁等），
  导致首轮洞察全段被拒 → 回退模板。**改进**：首次全拒时带显式禁词清单**重试一次**
  （边界不放松、成本有界）。修复后 Round1 洞察由 absent→present。
- **沙箱直连 Agnes 的方法**：`NODE_USE_ENV_PROXY=1 HTTPS_PROXY=http://127.0.0.1:7890`
  （Node 22 内置 EnvHttpProxyAgent，实测可让 API 进程直连 `api.agnes-ai.cn`）。

## 0. 规划期新增事实（实证）

- Agnes API key 已提供并**实测有效**（`agnes-2.5-flash`，ping 2 tokens 正常返回，
  走 127.0.0.1:7890 代理验证；本机 TUN 下 API 进程可直连）。
- 严格 JSON 输出实测：内容会包 ```json 围栏，现有
  `content.match(/\{[\s\S]*\}/)` 提取模式可复用（followup-generator 先例）。
- `.env.example` 不存在 → 文档任务改为在 `.env` 内注释说明。
- 计划期补拍（开放问题 #5 默认值，可在执行前推翻）：
  **第一版 LLM 仅生成 6 个题面，4 选项文案保持静态**（option_stems + context
  suffix 原样沿用）。理由：更稳、科学边界最严格、复用现有校验；
  后续如需"选项也个性化"再开子档位。

## 1. 架构决定（实现必须遵守的约束）

| # | 决定 |
|---|------|
| A1 | 环境变量沿用 `LLM_BASE_URL / LLM_API_KEY / LLM_MODEL`（llm-config 中 OPENAI_* 优先级更高，两套等价），值从 MiniMax 换成 Agnes |
| A2 | 新开关：`EVA_THEME_AI_PERSONALIZATION=1`（出题）、`EVA_THEME_AI_INSIGHT=1`（洞察）、`THEME_AI_TIMEOUT_MS`（默认 12000） |
| A3 | 动态题 `question_id = ${lens}.${focus_key}.${context}.dyn${roundOrdinal}`；`role='core'`、`source='dynamic'`；`definition` JSONB 自包含（含静态选项） |
| A4 | 每焦点的 `context` 由确定性轮换 `(roundOrdinal + focusIndex) % 4` 分配（与静态选题同构，保证反例情境覆盖） |
| A5 | `selection_decision` JSONB 扩展可选字段 `personalization`（enabled / generated_count / fallback_count / input_snapshot 脱敏快照）——**无数据库迁移** |
| A6 | AI 洞察存入**同一 revision** 的 `result.ai_insight`（不追加 revision，`respondToResult` 零改动） |
| A7 | 出题输入：该主题最近 3 轮 completed 结果摘要 + 近 14 天 captures（仅 `organize/analyze`，`sanitizeUserContext` 脱敏，≤10 条 × 120 字） |
| A8 | 逐题回退：LLM 输出 6 题中某题校验失败 → 该题回退静态库同焦点题；6 题全失败 → 纯静态轮（可用性永不劣于现状） |
| A9 | 核心计分/报告骨架 `buildThemeRoundResult()` 一行不动 |

## 2. 任务列表（TDD 顺序，每任务可独立验证）

### 阶段 P1：LLM 配置切换（ groundwork ）

**任务 1：切换 .env 到 Agnes 并验证连通**
- 文件：`apps/api/.env`（LLM_BASE_URL=https://api.agnes-ai.cn/v1、LLM_API_KEY=sk-u17…、LLM_MODEL=agnes-2.5-flash；注释注明替换了 MiniMax 及新开关默认值）
- 验证：起 API 后 `POST /v1/...`（chat verifyModel 路由若可达）或直接 node 脚本 fetch ping 返回 OK
- 依赖：无 ｜ 时间：5 min

**任务 2：新增 feature flags**
- 文件：`apps/api/src/common/feature-flags.ts`（`EVA_THEME_AI_PERSONALIZATION`、`EVA_THEME_AI_INSIGHT`，默认 false，'1' 显式开启）
- 验证：单测断言默认 false、设 '1' 后 true（新建 feature-flags 补充用例或并入现有 spec）
- 依赖：无 ｜ 时间：5 min

### 阶段 P2：动态出题（核心）

**任务 3：编写 ThemeQuestionGeneratorService 测试（RED）**
- 文件：`apps/api/src/modules/theme-assessment/theme-question-generator.service.spec.ts`（新建）
- 覆盖用例：①环境缺失→返回 null；②mock fetch 成功返回合法 6 题 JSON→6 个 ThemeQuestion（source='dynamic'、role='core'、选项为静态文案）；③围栏 JSON 可解析；④某题 prompt 含禁语/超长/缺 focus→该题回退 null（由调用方用静态题）；⑤超时 abort→null；⑥temperature/timeout 传参正确
- 验证：`npx vitest run theme-question-generator` 全红（服务未实现）
- 依赖：2 ｜ 时间：15 min

**任务 4：实现 ThemeQuestionGeneratorService（GREEN）**
- 文件：`apps/api/src/modules/theme-assessment/theme-question-generator.service.ts`（新建）
- 设计：`generateCoreQuestions(input): Promise<Map<focus_key, string> | null>`——单次 LLM 调用，system 契约 `{"prompts":[{"focus_key":"trigger","prompt":"..."}×6]}`，user 载荷=历史轮摘要+日记摘要+上轮已用情境列表（要求规避）；`resolveLlmRuntimeConfig()` 取配置；复用 `sanitizeUserContext` 与禁语正则（从 followup-generator 提炼为共享 const，见任务 5）
- 验证：任务 3 的测试全绿
- 依赖：3 ｜ 时间：20 min

**任务 5：提炼共享护栏常量（REFACTOR）**
- 文件：`apps/api/src/modules/theme-assessment/llm-guards.ts`（新建：`FORBIDDEN_THEME_LANGUAGE`、`sanitizeUserContext` 导出）；`theme-followup-generator.service.ts` 改为引用（行为不变）
- 验证：`theme-followup-generator.service.spec.ts` 原测试全绿（回归）
- 依赖：4 ｜ 时间：5 min

**任务 6：start() 集成测试（RED）**
- 文件：`apps/api/src/modules/theme-assessment/theme-assessment.service.spec.ts`（扩展）
- 用例：①roundOrdinal=0（首次）→纯静态（不调 LLM）；②roundOrdinal≥1 且 flag 开 → items 含 source='dynamic'、selection_decision.personalization.generated_count=6；③生成器返回 null → 全静态 + personalization.fallback_count=6；④仅保存模式用户（consent evidence_collection=false）→ 不采集日记素材（快照中 diary_count=0）；⑤save_only 日记不入载荷
- 验证：新用例红
- 依赖：4、5 ｜ 时间：15 min

**任务 7：start() 集成实现（GREEN）**
- 文件：`apps/api/src/modules/theme-assessment/theme-assessment.service.ts`
- 改动：start() 在 `selectThemeRoundCore` 之后、事务之前——roundOrdinal≥1 且 EVA_THEME_AI_PERSONALIZATION 且 apiKey 存在时：查历史（该主题最近 3 轮 completed 的最新 revision 摘要）+查 captures（14 天、organize/analyze、LIMIT 10、脱敏截断）→调生成器（AbortController 超时 THEME_AI_TIMEOUT_MS）→成功题替换同 focus 的静态 core 题（question_id 换 A3 格式、context 按 A4 轮换重算、选项静态拼装）→selection 增 personalization 字段；插入 items 循环不变（definition JSONB 自包含）
- 验证：任务 6 全绿 + 既有 `*.spec.ts`、`*.pg.test.ts` 回归全绿
- 依赖：6 ｜ 时间：25 min

### 阶段 P3：AI 洞察报告

**任务 8：ThemeInsightGeneratorService 测试（RED）**
- 文件：`apps/api/src/modules/theme-assessment/theme-insight-generator.service.spec.ts`（新建）
- 用例：①环境缺失→null；②合法输出→`ai_insight`（≤3 段、每段≤200 字、每段 evidence_question_ids ⊆ 本轮 evidence、含 model/generated_at/disclaimer）；③禁语→null；④引用不存在的 question_id→null；⑤超时→null
- 依赖：5 ｜ 时间：15 min

**任务 9：ThemeInsightGeneratorService 实现（GREEN）**
- 文件：`apps/api/src/modules/theme-assessment/theme-insight-generator.service.ts`（新建）
- 设计：`generateInsight(lens, result, historySummaries, diaryDigest)`；system 契约 `{"paragraphs":[{"text":"...","evidence_question_ids":["..."]}]}`；输入含上轮 vs 本轮 approach 计数对比；输出结构含 `source:'ai'` 标识
- 验证：任务 8 全绿
- 依赖：8 ｜ 时间：20 min

**任务 10：complete() 集成（测试先行）**
- 文件：`theme-assessment.service.spec.ts`（扩展）+ `theme-assessment.service.ts`
- 用例：①flag 关→result 无 ai_insight（现状不变）；②flag 开+生成成功→revision JSONB 含 ai_insight；③生成 null→无 ai_insight（模板文案不劣化）；④仅保存模式→不生成（boundary 文案逻辑不变）
- 实现：complete() 在 buildThemeRoundResult 之后、写 revision 之前调用生成器（同步+超时回退，D5）
- 验证：新用例绿 + pg.test 回归（本地 Neon：MOCK_REDIS=1 起 API 跑 `theme-assessment.service.pg.test.ts`）
- 依赖：9 ｜ 时间：20 min

**任务 11：module 注册**
- 文件：`apps/api/src/modules/theme-assessment/theme-assessment.module.ts`（providers 增两个新服务）
- 验证：API 启动无 DI 错误；`npx nest build` 零错误
- 依赖：4、9 ｜ 时间：3 min

### 阶段 P4：本地联调设施

**任务 12：扩展 mock-llm router**
- 文件：`apps/api/src/mock-llm/mock-llm.router.ts`（识别出题/洞察两种 system 形状，返回合法 mock JSON）
- 验证：LLM_BASE_URL 指向本地 mock-llm 时，走通动态出题+洞察全流程
- 依赖：4、9 ｜ 时间：10 min

### 阶段 P5：Web 呈现

**任务 13：前端类型扩展**
- 文件：`apps/web/lib/api.ts`（`ThemeRoundResult` 增 `ai_insight?: { source:'ai'; model:string; generated_at:string; disclaimer:string; paragraphs:Array<{text:string; evidence_question_ids:string[]}> }`）
- 验证：`npx tsc --noEmit` 零错误
- 依赖：无 ｜ 时间：5 min

**任务 14：结果页 AI 洞察区块**
- 文件：`apps/web/app/theme-assessment/page.tsx`（在「情境差异」区块后、「这和你真实吗？」前插入）；`apps/web/messages/{zh-CN,en,ja,es}.json` 增 key：`theme_round.ai_insight_title`（AI 洞察参考）、`theme_round.ai_insight_disclaimer`（由 AI 基于本轮证据生成，非人格结论，可下方反馈纠错）、`theme_round.ai_insight_evidence`（证据：）
- 渲染：每段文本 + 段落级"证据"标记（点击滚动到对应 observation 卡片或显示 focus 标签）；区块头部显示模型来源徽标；ai_insight 不存在时区块整体不渲染（旧数据兼容）
- 验证：vitest 组件测试（result-feedback.test.tsx 扩展：无 ai_insight 不渲染/有则渲染且含免责声明）；`tsc --noEmit` 零错误
- 依赖：13 ｜ 时间：20 min

### 阶段 P6：端到端验收

**任务 15：端到端手测脚本**
- 文件：`scripts/verify-theme-ai.mjs`（新建：dev-login → 连做两轮同主题 → 断言第二轮 items.source 含 dynamic → complete → 断言 result.ai_insight 存在且段落引用合法）
- 验证：对本地 API（Agnes 真实 key）跑通；再以断网/错 key 复跑 → 全静态回退路径可用
- 依赖：7、10、12 ｜ 时间：15 min

**任务 16：文档与记忆更新**
- 文件：设计文档 v0.2 追加"实施记录"节（不含 key 明文）；`TESTING.md` 增 AI 出题/回退验证入口
- 依赖：15 ｜ 时间：5 min

## 3. 任务依赖图（关键路径）

```
1 → 2 → 3 → 4 → 5 → 6 → 7 ─┐
              └→ 8 → 9 → 10 → 11 → 12 → 15 → 16
13 → 14 ────────────────────────────↗（15 前完成即可）
```

## 4. 风险与回滚

- 所有新路径均有静态回退 → 回滚 = 关两个 feature flag（`EVA_THEME_AI_PERSONALIZATION=0`、`EVA_THEME_AI_INSIGHT=0`），无需回代码。
- 敏感数据：日记仅 organize/analyze + 脱敏 + 截断；key 只写 `.env`，**不出现在任何文档/测试/记忆中**。
- 并行会话干扰：本仓库存在并行 WorkBuddy 会话（10-09 记忆），开工前 `git status` 确认工作区干净。

## 5. 验收标准（对齐设计文档 §6）

- 同一用户第二次做同主题，≥4/6 题为 dynamic 且关联近期日记主题
- LLM 断路（无 key/超时/禁语）时流程 100% 可用
- AI 洞察 0 禁语命中、每段可回看证据、无 ai_insight 时 UI 与现状完全一致
- 既有 theme-assessment 全部测试（spec + pg.test）回归通过
