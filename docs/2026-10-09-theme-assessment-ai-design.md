# 主题情境测试 AI 化：设计讨论文档（v0.3 — 已实施并验收）

> 状态：**Brainstorming 已完成（v0.2 决策已确认）→ 实施完成 → 端到端验收通过**
> （2026-10-10，详见 `2026-10-09-theme-assessment-ai-plan.md` v1.1）。
> 日期：2026-10-09（设计）／2026-10-10（实施）

## 0. 已确认决策（开发者拍板，2026-10-09）

| # | 决策点 | 结论 |
|---|--------|------|
| D1 | 总体方案 | **方案 B：题面级生成 + 确定性骨架** |
| D2 | 日记素材边界 | **排除 `save_only` + 脱敏**（organize/analyze 模式经 sanitizeUserContext 后可用） |
| D3 | 出题时机 | **start() 同步生成 + 超时回退静态题**（超时预算 10–15s，整体回退） |
| D4 | 模型选型 | **agnes-2.5-flash**（先跑通，后续可 A/B 升级） |
| D5 | 报告洞察时机 | 沿用 D3 哲学：**complete() 同步生成 + 超时/禁语回退模板文案**（推断决策，如需异步补写再议） |
| D6 | 洞察可用性（实施期新增） | 首轮洞察全段被禁语过滤时，**带显式禁词清单重试一次**（边界不放松、成本有界）；实测将缺失率显著降低 |
| — | 遗留事项 ✅ | Agnes API key 已提供并实测有效（`agnes-2.5-flash`） |

## 1. 问题陈述

五个主题（emotion / relationship / social / workplace / self_evaluation）的情境测试
目前**完全静态**：题目、选项、报告文案全部写死，第二轮只是 `roundOrdinal % 4`
轮换情境。目标是接入 Agnes AI（OpenAI 兼容，`https://api.agnes-ai.cn/v1`）：

1. 第一版保持静态没有问题（已上线形态）；
2. 第二阶段：用户**第二次做同一主题**时，基于「前一次测试结果 + 最近日记输入」
   动态生成**新的个性化测试题**；
3. 最终结果报告接入 AI 洞察分析（替代目前的模板拼接文案）。

## 2. 现状调研结论（代码事实）

### 2.1 题库与出题

- 题库定义：`packages/core/src/assessment/theme-round.ts`
  - 5 主题 × 6 焦点（focus）× 4 情境（daily/pressure/power_difference/counterexample）
    = **120 道静态题**，`question_bank_version = theme-round-candidate-2026-07-30-v1`。
  - 每题 4 个选项，固定映射 4 种应对倾向 `approach/protect/analyze/withdraw`。
  - 选题规则：`selectThemeRoundCore(lens, roundOrdinal)`，按轮次取模轮换；
    若上轮有争议反馈（refute/partial/clarify），换同焦点的替代情境。
- 追问（第 7/8 题）：`decideThemeRoundFollowUp` 规则触发，模板拼题面。
- **已有 LLM 先例**：`ThemeFollowupGeneratorService.rephrase()` 用 OpenAI 兼容
  `/chat/completions` **仅改写追问的题面与 4 个选项文案**，结构（question_id、
  role、approach 映射）不变；失败/超时/含禁语 → 回退模板题。

### 2.2 作答与报告

- 结果：`buildThemeRoundResult()` **纯确定性代码**：按 approach 计数取主导倾向，
  headline/summary/strength/watchout/counterevidence 全部从 definitions 模板查表拼接。
- 报告落库：`theme_assessment_result_revisions`（JSONB，revision 递增，可失效）。
- 用户反馈闭环：`respondToResult()` 支持 confirm/partial/refute/clarify（可针对单条
  observation），`recommendNextRound()` 据此推荐下一轮主题与目标焦点。

### 2.3 可复用的 LLM 基础设施

- `common/llm-config.ts`：`OPENAI_BASE_URL/API_KEY/MODEL` 优先于 `LLM_*`，
  **换成 Agnes 只需改 .env**，无需改代码。
- `common/llm-funnel.ts`：模型家族探测、重试+超时、输出归一化（剥 think 块、
  截断、兜底）。chat 服务已在用。
- `mock-llm` 控制器：本地无 key 联调用。
- 敏感词护栏：`FORBIDDEN_FOLLOWUP_LANGUAGE`（禁"人格/诊断/神经/迷走/潜意识/
  治疗/抑郁/焦虑/personality/diagnos/polyvagal"）——**这是产品的科学边界，
  AI 生成内容必须过这道闸**。
- 脱敏：`sanitizeUserContext()`（隐藏邮箱/链接/号码，截断 240 字）。
- 同意门控：`consent_grants`（`evidence_collection=false` → 仅保存模式，
  不参与画像分析）。evidence worker 已有 `hasConsent()` 先例。

### 2.4 日记数据（个性化的素材源）

- `captures` 表：三入口（quick_fragment/emotion_log/decision_log）、
  三模式（**save_only**/organize/analyze）、`raw_text`、`mood_label/intensity`、
  `captured_at/local_date`。
- ⚠️ 隐私边界：`process_mode='save_only'` 的日记用户明确表示"只保存"，
  **不应送入 LLM 做个性化出题**（至少默认排除，需开发者拍板）。

### 2.5 数据库（AI 化的承载能力）

- `theme_assessment_round_items.source` 已是 `static|dynamic` CHECK 约束，
  `definition` JSONB 存完整题目快照 → **存 AI 生成题不需要改表结构**。
- AI 洞察可存入 result JSONB 新字段（如 `ai_insight`），或新增 revision，
  均无迁移负担；若要单独管理可加列，待定。

## 3. 设计方案（三选一讨论）

### 方案 A：仅扩展"改写"（保守增量）

只把现有 followup-rephrase 模式推广到 6 道核心题：LLM 收到静态题 + 用户历史摘要，
**重写题面措辞**，其余一切不变。

- 优点：改动最小（约 1 个服务文件），护栏全部现成。
- 缺点：题目情境本质还是那 120 个，"第二次做就是新题"的感知弱；
  个性化只能体现在措辞细节。
- 复杂度：低。

### 方案 B：题面级生成 + 确定性骨架（推荐）

`start()` 时若该主题已有 ≥1 轮完成记录，走**出题编排器**：

1. 收集个性化输入：上一轮（或最近 N 轮）result 摘要 + 近 14 天日记
   （仅 `organize/analyze` 模式，脱敏后，各截断限量）。
2. **一次** LLM 调用生成 6 个焦点的新情境题面（要求贴近用户近期生活线索，
   规避上轮已用过的情境方向），JSON schema 校验（每题 1 个 prompt，≤300 字）。
3. 4 个选项沿用静态 `option_stems + context suffix`（或允许 LLM 重写选项文案，
   但 **approach 映射顺序固定**，沿用 followup-generator 的校验方式）。
4. 校验失败/超时/禁语 → 该题回退静态题库；**6 题全部回退 = 纯静态轮**，
  保证可用性永不劣于现状。
5. 个性化输入快照存入 `selection_decision`（可解释、可审计、可复现）。
6. 计分与报告骨架逻辑（`buildThemeRoundResult`）**一行不动**。

- 优点："新题"感知强；科学边界不动（不诊断、不算分、证据链确定性）；
  失败优雅降级；`source:'dynamic'` 字段天然支持。
- 缺点：start() 延迟增加一次 LLM 调用（需超时预算，如 8–15s，
  或先返回静态首题再异步替换——待讨论）。
- 复杂度：中。

### 方案 C：全动态题库（LLM 出题+选项+计分）

LLM 自由生成题、选项、并直接产出报告结论。

- 优点：个性化上限最高。
- 缺点：**破坏项目核心科学治理**（science_status/approval_required 体系、
  禁语护栏、证据可回看），approach 计分失去确定性，报告不可复核。
- 复杂度：高。**不推荐**。

## 4. 报告 AI 洞察（方案 B 的配套设计）

`complete()` 后（或异步任务）：

- 输入：本轮确定性 result（观察+证据）+ 该主题历史轮对比 + （可选）日记摘要。
- 输出：`ai_insight` 字段（3 段以内：倾向对比、情境差异解读、下一轮建议），
  每条论断必须引用 evidence_question_id（沿用 observation 的证据回看机制）。
- 护栏：FORBIDDEN_LANGUAGE 校验 + 失败回退模板文案（现状不劣化）；
  consent 仅保存模式 → 不生成 AI 洞察或只生成"仅供个人查阅"版本（待定）。
- 呈现：Web 结果页在现有模板报告下方新增"AI 洞察"区块，标注生成来源与
  可纠错入口（复用 confirm/partial/refute/clarify 反馈组件）。

## 5. 关键风险

1. **隐私**：日记原文出边界。默认仅送 `organize/analyze` 模式 + 脱敏 + 截断；
   需要新的 consent 类型（如 `ai_personalization`）与否待讨论。
2. **延迟**：start() 同步等 LLM 会拖慢开题。预案：a) 加载态+15s 超时回退静态；
   b) 先出静态第 1 题，后台替换后续题（复杂）。
3. **成本**：每轮 1–2 次调用，可控；建议环境变量开关 + 灰度（feature-flags.ts 已有设施）。
4. **题面质量**：LLM 生成的情境可能引导性过强或与焦点错位。校验层需包含
   "四选项同等可信"约束 + 人工抽检机制（admin 已有审计后台）。
5. **API key 缺失**：用户消息里 API key 与 base URL 均为
   `https://api.agnes-ai.cn/v1`，**实际 key 尚未提供**，需开发者补发。

## 6. 成功标准（草案）

- 同一用户第二次做同主题，6 题中 ≥4 题为 dynamic 来源且明显关联其近期日记主题。
- LLM 故障时（断网/超时/禁语），测试流程 100% 可用（静态回退）。
- AI 洞察段落 0 命中禁语词表；每条论断可回看证据。
- 现有全部 theme-assessment 测试（spec/pg.test）保持通过。

## 7. 待开发者拍板的问题

1. Agnes API key 实际值（当前只有 base URL）与模型选型
   （`agnes-2.5-flash` / `agnes-2.5-pro` / `agnes-3.0-flash`）。
2. 日记素材边界：`save_only` 是否绝对排除？是否需要新 consent 类型？
3. start() 同步生成 vs 异步替换（体验 vs 复杂度）。
4. AI 洞察同步返回 vs 异步补写（revision 追加）。
5. 选项文案是否允许 LLM 重写（方案 B 的两个子档位）。
