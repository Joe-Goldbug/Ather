# EVA 完整项目交接文档

> 当前产品定位见 [Eva 项目定位](../PROJECT-POSITIONING.md)。本交接文档中的旧定位和产品建议已被取代；历史代码盘点保留为实现记录。 / See [Eva project positioning](../PROJECT-POSITIONING.md) for the current definition. Earlier positioning and product proposals in this handover are superseded; historical code inventories remain implementation records.

日期：2026-10-06。源码基准：EVA / 6a02a10337057bc5cb8cb93b92edc3037995e535。

本文件合并全部八份交接文档，适合整体阅读或交给新项目。分别编辑时请以 docs/ 下各章节为准；此总文档是交付时的合并版本。源码与验收清单另见 README.md。

1. [01-项目核心与产品定位](docs/01-项目核心与产品定位.md)
2. [02-核心功能与用户旅程](docs/02-核心功能与用户旅程.md)
3. [03-技术架构与代码地图](docs/03-技术架构与代码地图.md)
4. [04-AI与证据科学边界](docs/04-AI与证据科学边界.md)
5. [05-EVA-Web3迁移方案](docs/05-EVA-Web3迁移方案.md)
6. [06-执行与验收指南](docs/06-执行与验收指南.md)
7. [07-来源状态与交付边界](docs/07-来源状态与交付边界.md)
8. [08-给下一位开发者或AI的任务书](docs/08-给下一位开发者或AI的任务书.md)


---

# EVA 产品交接：当前 EVA 的核心与用户旅程

核查日期：2026-10-06。本文是 EVA（异名同性质的 EVA Web3 项目）的产品基准交接，不是 EVA 已独立实现、上线或完成 Web3 的声明。

## 1. 结论先行

**终极目标是做人类的 IA，增强人类智能与主体性。当前代码提供的是无固定人格标签的情境探索、现实文字记录、有限观察和用户纠正基础，不是完整数字自我，更不是已经证明有效的人类能力增强系统。**

产品可以用 `Play + Record + Observe + Correct + Action` 理解，但五环成熟度不同：游客章、主题轮、文字记录和反馈已有实现；正式长期画像仍有科学规则与聚合缺口；Action 的实验 API 与界面存在，但正常周回看 worker 尚未供应结构化建议，不能宣称行动闭环已经端到端成立。

公开网站与本地产品代码必须分开：默认 Web proxy 只允许首页、白皮书和语言接口；产品页仅在开发环境、本机主机名及显式预览开关同时成立时放行。本次没有联网、启动服务、运行数据库或做浏览器验收，所有“存在”指当前源码存在，不等于运行成功或生产可用。

## 2. 基准、方法与可搬迁引用

| 项目 | 本次基准 |
|---|---|
| 唯一读取仓库 | `/Users/ethan/Library/Mobile Documents/com~apple~CloudDocs/Downloads/EVA` |
| 分支 | `EVA` |
| HEAD | `6a02a10337057bc5cb8cb93b92edc3037995e535` |
| 代码状态 | 核查时受版本控制文件没有工作区修改；原有未跟踪文件保留，不作为产品事实来源 |
| 交接引用根 | `source-reference/eva-current/` |
| 任务边界 | 只读仓库、只总结；只写指定临时目录下两个 Markdown，不修改业务代码，不提交，不联网，不读取或复制密钥及用户数据 |

以下引用采用 `source-reference/eva-current/仓库相对路径:关键起始行号`，可在交接档案内搬迁检索；行号绑定上述 HEAD，不随其他分支承诺有效。本文不负责复制源码。未使用 9/18 历史 worktree 充当当前实现。

证据等级统一为：

- **愿景**：人类 IA 与候选实现形式，不等于实现批准或效果证据。
- **本地代码存在**：读到页面、接口及服务逻辑，未在本次执行验证。
- **缺口**：代码链路缺供应、缺处理或有入口/合同不一致。
- **生产未知**：没有本次线上检查；项目文档中的过去检查只能注明记录日期。

文档冲突以当前代码解释实现事实，以产品真相文件第 0 节解释目标；README 的成长性、科学性和“全面落地”语句不能当作实测成果。

## 3. 产品核心：不是把人变成一个标签

### 3.1 目标与实现层级

当前目标是通过 AI 引导的互动体验帮助用户理解自己的思考模式、探索自身人格性格。自我模型、记忆、数字分身、Self OS、Agent、Web3 都是候选机制，不是目标本身，也不要求全部建设。

权威依据：`source-reference/eva-current/docs/CURRENT-PRODUCT-TRUTH-2026-06-29.md:9`；README 的使命解释见 `source-reference/eva-current/README.zh-CN.md:39`。

当前产品的具体探索路径是：让用户在有边界的情境里选择，在生活中留下自述记录，看见有来源的观察，指出系统哪里理解错了，再尝试由自己选择的小行动。这是一条 IA 探索路径，不是已经证实提升智能、韧性或现实表现的疗效或训练结论。

### 3.2 不可混淆的四个边界

1. **没有固定人格类型。** 结果是“在这个情境、这轮选择中出现的做法”，不是永久身份、MBTI 类型或诊断。
2. **模拟不等于现实。** 游客章与动态剧本是虚构选择；用户自述现实经历也仍是自述，而非外部核验的事件。
3. **确认不等于验证。** 用户确认代表本人反馈；它不自动证明解释正确，不自动提高正式置信度，也不自动产生合格长期画像。
4. **数字自我不是终极目标。** 更丰富的画像、更多调用或上链本身都不能证明能力增强。

依据：`source-reference/eva-current/docs/CURRENT-PRODUCT-TRUTH-2026-06-29.md:41`；游客结果显式设置 `simulation/candidate_only`：`source-reference/eva-current/packages/core/src/assessment/guest-episode.ts:191`。

### 3.3 差异化机制与未证实的商业价值

当前可识别的设计差异是模拟与自述分离、原始记录与解释分离、逐观察反馈、版本绑定、来源独立组、正式证据白名单及用户用途授权。这些机制支持可解释和可纠正的产品方向，但本次没有用户研究、激活/留存/付费数据，也没有能力迁移实验，不能直接称为商业护城河或已验证市场需求。

尤其不要沿用 README 中“个人认知资产不可迁移”的措辞推导用户锁定策略；当前导出 API 已存在，产品交接应尊重用户控制与可退出。依据：`source-reference/eva-current/README.zh-CN.md:79`；`source-reference/eva-current/apps/api/src/modules/consent/consent.controller.ts:38`。

## 4. 五环循环与实际成熟度

| 环节 | 用户意图 | 当前代码承载 | 必须保留的边界 |
|---|---|---|---|
| Play | 在虚构情境里试一次选择 | `/play` 固定章；`/theme-assessment` 主题轮；独立动态剧本页 | 游戏选择是候选线索；三个入口不是一套连续、无限生成的游戏 |
| Record | 记录现实中的时刻与决定 | `/daily-mirror`，`captures` API | 原文是用户自述；文字可用，语音/图片入口禁用 |
| Observe | 看见选择、原话和有限解释 | 本轮结果、Profile 历史、正式观察查询、本周回看 | 主题结果不晋升正式画像；日记关键词不是成熟 AI 理解 |
| Correct | 对观察确认、部分符合、反驳、补充或撤回 | 主题反馈、正式观察回应、记录线索反驳、证据撤回 | 已记录/待核对不等于已验证；不同反馈对象不能混成一个状态 |
| Action | 主动选择一个现实行动并回看 | 周实验创建/check-in API 和条件界面 | worker 不写 `content.suggested_experiment`，建议供应未接通；check-in 不等于效果验证 |

入口与实现索引：`source-reference/eva-current/apps/web/app/play/page.tsx:63`；`source-reference/eva-current/apps/web/app/theme-assessment/page.tsx:61`；`source-reference/eva-current/apps/web/app/daily-mirror/capture-form.tsx:19`；`source-reference/eva-current/apps/web/app/weekly-review/page.tsx:487`。

## 5. 真实用户旅程

### 5.1 公开访问者：首先遇到的是展示站

默认访问 `/` 与 `/whitepaper`。首页 CTA 虽然链接 `/theme-assessment`，但 proxy 默认会把该路径重定向回首页；不能因此写成公众可完成测评。`/api/locale` 是语言接口例外，其他产品和业务 API 代理路径不在默认放行列表，静态资源有 matcher 例外。

本机预览条件同时为 `NODE_ENV=development`、`EVA_LOCAL_PRODUCT_PREVIEW=1`、hostname 属于 `localhost/127.0.0.1`。这不是生产开放开关。

依据：`source-reference/eva-current/apps/web/proxy.ts:33`；`source-reference/eva-current/apps/web/app/page.tsx:13`；`source-reference/eva-current/apps/web/components/TopBar.tsx:7`。

### 5.2 游客：固定章 → 临时结果 → 注册/登录认领

在放行的本机 `/play`：用户点“我已满 18 岁”，加载固定六节点《雨停之前》，逐题作选择并看到预写后果。选项顺序由 run ID 排序，不是按用户资料生成整章。页面承诺约 4–6 分钟只是文案，非本次计时实测。

完成后展示本章做法、保护的东西、可能代价、例外与未知，明确为模拟候选观察。游客会话和认领凭证存 `sessionStorage`，用于同一浏览器会话刷新恢复，不是跨设备、长期本地存储或游客云账户。

接口：`GET /v1/story/guest-opening`；`POST /v1/story/guest-opening/complete`；登录后 `POST /v1/story/guest-opening/claim`。服务端认领凭证有效期为 24 小时，校验签名、版本和六题答案；同一 run 本人重放返回已有结果，跨账号认领拒绝。认领事务写主题轮、题目、答案及结果修订，**不写正式 evidence_events 或长期画像**。

依据：`source-reference/eva-current/apps/api/src/modules/theme-assessment/guest-assessment.controller.ts:10`；`source-reference/eva-current/apps/api/src/modules/theme-assessment/theme-assessment.service.ts:135`；同文件 `:221`、`:270`；`source-reference/eva-current/apps/web/lib/guest-assessment.ts:13`。

登录页提供邮箱验证码注册/登录，游客 CTA 带 `returnTo=/play`；回到 Play 才执行新游客认领并清理临时记录。开发一键登录与真实邮件验收分开。认领成功的“继续下一章”实际链接 `/theme-assessment`，**不是自动进入新的个性化动态剧本**。

依据：`source-reference/eva-current/apps/web/app/play/page.tsx:76`、`:229`；`source-reference/eva-current/apps/web/app/login/page.tsx:71`；`source-reference/eva-current/apps/api/src/modules/auth/auth.controller.ts:99`。

### 5.3 注册用户：主题轮 → 本轮观察 → 回应 → 历史 → 下一轮

这是当前正式主链。用户选择情绪、关系、社交、职场、自我评价主题，或按推荐进入；六个核心决策点，按规则最多再追加两个追问。可以填写本轮文字情境。开始即把 roundId 写 URL，刷新查询服务端 `/next`；已完成则读取结果，Profile 可继续未完成轮次。

结果包含本轮观察、选择证据、收益/注意点、反例和边界。用户可以回应整份结果或单条观察；最新反馈和争议状态跨刷新恢复。整份反驳后原标题/摘要降为历史，单条反驳只降级对应观察，不抹掉原始记录。

下一轮推荐依据最新未完成跟进的反驳/部分符合/补充、现实记录数量、正式证据时间和主题覆盖；可定位同一观察焦点的平级替代情境，并明确 `targeted/theme_followup/target_unavailable`。这不代表系统理解了反驳原因或已经解决争议。

**当前仅支持中文主题题库**：API 对非 `zh-CN` 的开始请求返回 `theme_assessment_locale_not_supported`，Web 又传当前 locale。因此四语言 UI 不等于四语言主题轮可执行。题库的 `approval_required` 也不等于科学有效性已批准。

依据：`source-reference/eva-current/apps/api/src/modules/theme-assessment/theme-assessment.service.ts:394`、`:478`、`:704`、`:915`；`source-reference/eva-current/packages/core/src/assessment/theme-round.ts:554`；`source-reference/eva-current/apps/web/app/theme-assessment/page.tsx:84`、`:291`；`source-reference/eva-current/apps/web/app/profile/page.tsx:192`。

### 5.4 新动态剧本：有独立播放实现，但不是已接通的“下一章”

独立路径 `/micro-sandbox/dynamic` 要求登录：输入当下情境 → 问询 → 变量提取 → 用户发起异步生成 → 状态轮询 → 场景分支选择 → 完整路径提交 → 完成页。服务端通过 `assessment/micro-sandbox/dynamic` 控制器提供 start、answer、complete、abort、status、script status/result 和 play。

播放并非只展示生成 JSON：Web 按 `next_scene_map` 前进；后端校验完整、合法、不循环的路径和归属，再事务保存 `played_path` 与候选 pending 数据。同脚本同路径可重放，另一路径冲突。只有实际玩过的选择累积，空路径不凭空生成选择证据。

生成依赖 Redis/BullMQ、独立 worker、模型配置和数据库权限；本地非生产未配置动态模块所需 Key 时模块不注册。本次均未启动核验。会话 ID 支持同标签页刷新恢复；未完成的逐场景选择主要是组件内状态，不能宣称每步实时跨刷新恢复。

三项具体缺口：游客“下一章”去主题轮；完成页“再来一次”去 `/micro-sandbox?mode=dynamic`，而该兼容页只重定向主题轮；完成页期待顶层 `psychological_narrative/comparison_summary`，worker 的 ready result 仅写 `{script_id, script, revised}`，目前不能保证生成这些字段，更不能称多角度心理复盘已完成。这里是静态代码合同核对，非本次浏览器复现。

依据：`source-reference/eva-current/apps/web/app/micro-sandbox/dynamic/page.tsx:28`；`source-reference/eva-current/apps/api/src/modules/assessment/dynamic-script.controller.ts:54`；`source-reference/eva-current/apps/api/src/modules/assessment/services/micro-sandbox/dynamic-script-playback.service.ts:28`；`source-reference/eva-current/apps/api/src/modules/assessment/services/micro-sandbox/evidence-bridge.service.ts:129`；`source-reference/eva-current/apps/api/src/app.module.ts:31`；`source-reference/eva-current/apps/web/components/dynamic-script/script-result-view.tsx:40`；`source-reference/eva-current/apps/api/src/queue/script-generation.processor.ts:258`；`source-reference/eva-current/apps/web/app/micro-sandbox/page.tsx:1`。

### 5.5 Record、Profile 与纠正

`/daily-mirror` 提供快速碎片、情绪记录、决定记录，默认“只保存”、文字输入、不授权周回看。`organize` 实际只截原文前 100 字；`analyze` 使用关键词规则，最多两条待核对线索，不调用 LLM。线索确认产生候选证据；反驳可撤回已关联候选。新 captures 和旧 diary 分别分页读取，失败呈现部分加载与重试。

Profile 是账号与记录汇合页：当前画像状态、主题轮历史、正式观察回应、按主题线索与数据导出。当前正常的新用户流程不会因完成主题轮自动得到正式人格画像。正式读取依赖 `portrait_eligible_evidence_v2`，排除候选、未知来源、模拟选择、缺来源独立组及未经批准规则；聚合服务只创建基础设施性质的 `unknown` 修订。

纠正分层：主题结果回应影响本轮显示及下一轮选题；记录线索确认/反驳只处理候选；正式观察回应绑定 observation/revision，并建立确认事件或 `pending_validation` 纠偏记录。当前 worker 仅注册 `correction.withdraw_processed`，使相关存储画像修订失效、清 current 指针；确认与验证请求尚无注册业务处理器。不能把“已写 outbox”“已反驳”写成完整自动校准或重算。

依据：`source-reference/eva-current/apps/web/app/daily-mirror/capture-form.tsx:19`；`source-reference/eva-current/packages/core/src/evidence/capture-pipeline.ts:100`；`source-reference/eva-current/apps/api/src/modules/captures/captures.service.ts:69`；`source-reference/eva-current/apps/web/app/profile/page.tsx:67`；`source-reference/eva-current/packages/database/src/migrations/2026-09-26-evidence-eligibility-v2.sql:30`；`source-reference/eva-current/apps/api/src/modules/portrait/portrait-aggregation.service.ts:17`；`source-reference/eva-current/apps/api/src/queue/worker.ts:588`；`source-reference/eva-current/apps/api/src/queue/correction-withdrawal-handler.ts:13`。

### 5.6 周回看与 Action：不要把建议文本当成实验闭环

用户逐条允许记录进入周回看，并授权全局 `weekly_review_analysis` 后可触发生成。worker 只读本周、非 `save_only`、逐条已授权 captures；模型调用前后及保存时复核授权。界面可以显示本人本周新旧记录，但 worker 不会因此自动读取旧 diary。

worker 明确提示没有上周可比输入、不能判断跨周趋势，持久化 `mood_trend=NULL`。它保存本周 narrative 到 summary/eva_message，**没有双周比较，也没有写 `content.suggested_experiment`**。提示中的“下周建议一条”是自由文本，不是结构化实验建议。

实验 API 从 `weekly_reviews.content.suggested_experiment` 读取 action_text/trigger_context，缺少就拒绝；Web 也仅在该字段存在时显示建立实验按钮。因此创建、check-in、状态表代码存在，但正常 worker 产出的回看尚不能供应 Action。这是当前关键未闭环点。check-in 的 done/partly_done/no_opportunity/paused 仅是用户行动记录，不写正式证据，不证明能力改变或跨任务迁移。

依据：`source-reference/eva-current/apps/api/src/queue/worker.ts:195`、`:228`、`:288`；`source-reference/eva-current/apps/api/src/modules/weekly-reviews/weekly-experiments.service.ts:47`、`:88`；`source-reference/eva-current/apps/web/app/weekly-review/page.tsx:487`。

## 6. 数据控制、运营与商业状态

- **数据控制**：保存不等于授权 LLM 读取。已有逐条周用途许可、全局用途 grant/revoke/status、账户导出及删除 API。Profile 有导出按钮，但当前主 Web 未见账户删除操作及完整用途设置页。删除可返回 pending/failed/completed；备份只声明需供应商核验，30 天是政策上限，不是兑现证明。依据：`source-reference/eva-current/apps/api/src/modules/consent/consent.controller.ts:15`；`source-reference/eva-current/apps/api/src/modules/consent/consent.service.ts:35`、`:163`；`source-reference/eva-current/apps/web/app/profile/page.tsx:278`。
- **Admin**：独立 Signal Room 有总览、用户列表/User 360、反馈工单和质量实验室；默认 mock，API 模式才查询数据库。具有角色权限、敏感字段理由与访问审计代码，不等于真实数据、指标准确性或生产最小权限已验证。不是给管理员随意改用户画像的系统。依据：`source-reference/eva-current/apps/admin/app/page.tsx:46`；`source-reference/eva-current/apps/admin/app/api/snapshot/route.ts:26`；`source-reference/eva-current/apps/admin/lib/admin-auth.ts:17`。
- **四语言**：中、英、日、西 messages、全局切换和 Cookie 存在；游客章与主题主体硬编码中文，主题开始 API 明确仅中文，正式观察反馈亦有中文硬编码。只能说“四语言界面框架及多处文案存在”，不能说全旅程四语言可用。依据：`source-reference/eva-current/packages/core/src/shared/locales.ts:4`；`source-reference/eva-current/apps/web/components/GlobalLanguageSwitcher.tsx:15`；`source-reference/eva-current/apps/api/src/modules/theme-assessment/theme-assessment.service.ts:395`；`source-reference/eva-current/apps/web/components/portrait-sections.tsx:1100`。
- **免费/付费**：有 free/paid 字段，默认 free；`/auth/me` 仍把 canUseCorrections 标志设为 paid。当前正式反馈接口只做 AuthGuard，旧纠正写接口已 410，未发现当前主链用该能力标志收费拦截，也未发现支付/订阅/结账闭环。不能编造套餐、价格、收入或“付费纠偏已商用”。依据：`source-reference/eva-current/packages/database/src/migrations/005_user_entitlement_tier.sql:1`；`source-reference/eva-current/apps/api/src/modules/auth/auth.controller.ts:35`；`source-reference/eva-current/apps/api/src/modules/corrections/corrections.controller.ts:21`。
- **Web3**：本次在当前 Web/API/Admin/Core 业务范围搜索未发现钱包登录、签名、链上凭证、Mint 或合约执行主链。Agent Context 的现有授权摘要接口和注释提到钱包，不等于钱包集成或主权资产已经上链。EVA 的 Web3 定位仅是交接目标/候选实现方向，不是当前能力。依据：`source-reference/eva-current/docs/CURRENT-PRODUCT-TRUTH-2026-06-29.md:16`；`source-reference/eva-current/apps/api/src/modules/agent-context/agent-context-v1.controller.ts:6`；`source-reference/eva-current/apps/api/src/modules/agent-context/agent-context.service.ts:21`。

## 7. 历史、生产与交接决策边界

项目真相文件保留 2026-09-26 的本地隔离数据库、浏览器、CI 和平台检查记录，并明确当时生产 API/worker 未完成发布、备份/恢复及真实账户门禁未通过；这些过去记录没有在本次重新执行。文档中的 63% 不是今天重新评估的项目进度，更不是上线百分比。

当前仓库分支确实是 `EVA`，不是文档过去提到的 `feature/EVA-Ethan`，也不是公开展示分支。源码、部署分支、运行提交、实际主机应分别核验，本次只证明前两项中的本地源码身份，不推断线上 SHA 或服务状态。

依据：`source-reference/eva-current/docs/CURRENT-PRODUCT-TRUTH-2026-06-29.md:107`、`:140`、`:149`。

EVA 接手时应保留的未决事项：

1. 明确 EVA 首版要增强哪项能力、面向谁、通过哪种真实任务和迁移任务验收；本次不替用户批准新路线。
2. 区分游客固定章、正式主题轮与独立动态剧本，不把按钮命名包装成已统一的连续章系统。
3. 为 Action 决定结构化建议来源、用户自主确认及回看标准；接口可调用不是完整供应闭环。
4. 正式画像与纠偏验证需要批准规则和可执行处理器，不能用重复确认、模拟次数或数据丰富度代替真实性。
5. 先兑现用户数据控制、当前/历史结论边界及真实部署门禁；Web3 不应把敏感原文永久公开，也不能替代这些门禁。

上述是交接缺口与决策提示，不构成实施授权。逐功能接口、状态及证据详见同目录 `02-核心功能与用户旅程.md`。


---

# EVA 功能交接：当前代码、接口与缺口清单

核查日期：2026-10-06。结论：当前 EVA 有主链与多项治理基础代码，但公开产品仍受 proxy 门禁限制；长期画像、跨周比较、行动建议供应、完整四语言旅程、支付和 Web3 不能标为已交付。

## 1. 使用说明与证据等级

- 唯一源码基准：`/Users/ethan/Library/Mobile Documents/com~apple~CloudDocs/Downloads/EVA`，分支 `EVA`，HEAD `6a02a10337057bc5cb8cb93b92edc3037995e535`。
- 所有引用格式为 `source-reference/eva-current/仓库相对路径:关键起始行号`，方便随档案搬迁。引用绑定本次 HEAD；本文不复制源码、密钥或用户数据。
- **本地代码存在**是静态实现核查，不是本次运行测试通过。未联网、未启动服务、未连接数据库、未调用邮件/模型/支付供应商、未操作浏览器。
- **缺口**表示当前代码衔接/供应/规则尚不完整；**生产未知**表示本次没有线上证据；**愿景**只表示目标或候选路线。
- 下列 Nest 接口写其控制器路径；Web 常通过 `/api` 代理使用，不能与 Admin 自己的 Next `/api/...` 混淆。默认 public proxy 不放行这些业务代理路径。
- 产品原则：人类 IA 为目标；不设固定人格类型；模拟不是现实证据；用户确认不是外部验证；数字自我、Agent、Web3 不是终极目标。

目标依据：`source-reference/eva-current/docs/CURRENT-PRODUCT-TRUTH-2026-06-29.md:9`、`:41`。

## 2. 总览

| 功能 | 当前状态 | 不得升级为的说法 |
|---|---|---|
| 首页/白皮书 | 本地页面与公开路由门禁存在 | 全产品已公开上线 |
| 游客固定六节点章 | 页面、结算、凭证认领存在 | 无限 AI 章节、正式人格证据 |
| 邮箱注册/登录 | OTP、会话、退出代码存在 | 真实邮箱/生产鉴权已验收 |
| 主题轮 | 中文六核心点，最多八点；结果、反馈、历史、选题存在 | 四语言题库、临床/科学测量有效性证明 |
| 新动态剧本播放 | 问询、生成、轮询、分支播放、路径保存存在 | 游客下一章自动生成、完整多视角心理复盘 |
| 现实记录 | 文字、原文摘录、关键词候选、分页存在 | 语音/图片录入成熟、LLM 已理解日记 |
| Profile | 历史/状态/正式观察回应/导出存在 | 新用户已具备可靠长期数字自我 |
| 纠偏 | 分层反馈、待验证记录、撤回及有限失效处理存在 | 确认即事实、自动纠偏验证与完整重算 |
| 本周回看 | 全局及逐条授权、异步本周文本回看存在 | 双周比较、趋势证明 |
| 用户实验 | 建立/check-in API 和条件 UI 存在 | 正常 worker 已供应并持久化实验建议 |
| 数据控制 | 用途授权、导出/删除、队列清理、删除墓碑代码存在 | 完整用户设置页、供应商备份删除已兑现 |
| Admin | mock/API 两模式、运营视图、权限/访问审计存在 | 演示值是真实运营数、全部指标已校准 |
| 四语言 | messages、全局切换与多处文案存在 | 全旅程四语言均可执行 |
| 免费/付费 | entitlement 字段及能力标志存在 | 已有套餐/价格/订阅收入 |
| Web3/外部 Agent | 目标/研究语义；有限授权摘要 API 存在 | 钱包/签名/链上证据/NFT 已实现 |

## 3. 页面入口与兼容路线

| 路径 | 当前源码行为 |
|---|---|
| `/` | 首页 CTA 指向主题轮，受 proxy 默认门禁限制 |
| `/whitepaper` | 白皮书页面，公开允许 |
| `/play` | 固定游客章，本机预览可进入 |
| `/login` | 邮箱验证码登录/注册，本机预览可进入 |
| `/theme-assessment` | 正式中文主题轮与结果/反馈 |
| `/profile` | 当前状态、轮次历史、正式观察回应和导出 |
| `/daily-mirror` | 新 captures 文字记录与旧 diary 时间线 |
| `/weekly-review` | 本周回看与条件实验 UI |
| `/micro-sandbox/dynamic` | 独立新动态剧本页，不等同父路径 |
| `/assessment`、`/interactive-narrative`、`/micro-sandbox` | 页面直接重定向 `/theme-assessment` |
| `/chat`、`/report` | 页面直接重定向 `/profile` |

默认仅开放 `/`、`/whitepaper`、`/api/locale`；产品页放行须满足 development、本机 host 与 `EVA_LOCAL_PRODUCT_PREVIEW=1` 三条件。静态资源有 matcher 例外。源码有路由不等于公众可以走完。

证据：`source-reference/eva-current/apps/web/proxy.ts:33`；`source-reference/eva-current/apps/web/app/page.tsx:13`；`source-reference/eva-current/apps/web/app/assessment/page.tsx:1`；`source-reference/eva-current/apps/web/app/interactive-narrative/page.tsx:1`；`source-reference/eva-current/apps/web/app/micro-sandbox/page.tsx:1`；`source-reference/eva-current/apps/web/app/chat/page.tsx:1`；`source-reference/eva-current/apps/web/app/report/page.tsx:1`。

## 4. 游客固定章与注册认领

**用户能力**：18+ 自我确认后体验《雨停之前》，六节点/每节点四个动作，显示上一选择的预写后果；完成后看保护、代价、例外与未知，登录认领保存。

| 方法/接口 | 作用 |
|---|---|
| `GET /v1/story/guest-opening` | 创建 run ID，返回固定节点、版本及过期时间 |
| `POST /v1/story/guest-opening/complete` | 要求 adult_confirmed、正确版本及六题答案；生成候选结果和签名认领凭证 |
| `POST /v1/story/guest-opening/claim` | AuthGuard 保护；认领主题轮及答案/结果修订，同 run 本人重放、异人拒绝 |

页面用 sessionStorage 保存会话/答案/claim token；凭证服务端 TTL 24 小时。认领成功清临时记录。`simulation`、`candidate_only` 和来源组保留到服务端结果；它不写正式画像证据。18+ 是本人确认按钮，不是身份或年龄核验。

**缺口**：固定章主体为中文，无四语言游客题库；“继续下一章”只是主题轮链接，不连接动态剧本。临时记录不是跨设备长期保存。

证据：`source-reference/eva-current/packages/core/src/assessment/guest-episode.ts:15`、`:111`、`:191`；`source-reference/eva-current/apps/web/app/play/page.tsx:186`、`:229`；`source-reference/eva-current/apps/web/lib/guest-assessment.ts:13`；`source-reference/eva-current/apps/api/src/modules/theme-assessment/guest-assessment.controller.ts:10`；`source-reference/eva-current/apps/api/src/modules/theme-assessment/theme-assessment.service.ts:135`、`:270`。

## 5. 登录与会话

接口为 `POST /auth/send-code`、`POST /auth/verify-code`、`GET /auth/me`、`POST /auth/logout`；会话 Cookie 是 httpOnly，/me 返回账号及 entitlement/capabilities。首次验证可注册，returnTo 经本地路径校验后跳转；游客认领在回到 Play 执行。

另有 `POST /auth/dev-login`，生产拒绝；本地 development 的 send-code 也有自动验证辅助。不能把开发登录成功当成邮件送达、真实验证码、生产 Cookie/CORS 验收。

证据：`source-reference/eva-current/apps/api/src/modules/auth/auth.controller.ts:31`、`:69`、`:99`、`:132`、`:167`；`source-reference/eva-current/apps/web/app/login/page.tsx:13`、`:71`；`source-reference/eva-current/apps/web/app/play/page.tsx:76`。

## 6. 中文主题轮与下一轮

五主题：`emotion/relationship/social/workplace/self_evaluation`。六核心点加零至两个追问；题库标 `approval_required`，不是批准量表。可选 LLM 适配器只受限改写追问文案，缺配置、超时或不合规就退回规则题，不可改变原角色、选项信号或评分结构。

| 方法/接口 | 作用 |
|---|---|
| `POST /v1/assessment-rounds` | 开始主题轮，保存 selection_decision |
| `GET /v1/assessment-themes/coverage` | 返回主题覆盖与下一轮理由 |
| `GET /v1/assessment-rounds` | 轮次历史及当前反馈状态 |
| `GET /v1/assessment-rounds/:roundId/next` | 恢复下一题/已完成/可结算状态 |
| `POST /v1/assessment-rounds/:roundId/items/:itemId/responses` | 保存选择、可选文字及 operation_id |
| `POST /v1/assessment-rounds/:roundId/complete` | 创建本轮结果修订，不写正式画像 |
| `GET /v1/assessment-rounds/:roundId/result` | 结果及整份/单条最新反馈投影 |
| `POST /v1/assessment-rounds/:roundId/result/responses` | confirm/partial/refute/clarify，支持单观察目标 |

roundId 进入 URL；Profile 可返回结果或继续进行中轮次。反馈需保持幂等键与对象/内容一致；争议呈 needs_follow_up，旧原文保留但降级。

实际下一轮理由包括 `verify_disagreement/clarify_partial/use_added_context/add_context/refresh_stale_evidence/explore_domain`，手选另一主题为 `manual_theme`。最新尚未完成跟进的反馈可带 target；同焦点替代题可显示 targeted，无可用题则 target_unavailable，整份反馈是 theme_followup。缺批准维度到主题映射时，不把低覆盖主题包装成矛盾检测。README 的“五大 reason”清单不是当前枚举或算法已兑现的证明。

**关键限制**：开始接口明确拒绝非 `zh-CN`；Web start 传当前 locale，英/日/西界面不能据此宣称可完成主题轮。选择、文字和确认不自动晋升长期正式观察；追问规则、推荐理由不证明系统已解释异议原因。

证据：`source-reference/eva-current/apps/api/src/modules/theme-assessment/theme-assessment.controller.ts:11`；`source-reference/eva-current/apps/api/src/modules/theme-assessment/theme-assessment.service.ts:394`、`:478`、`:626`、`:704`、`:915`；`source-reference/eva-current/apps/api/src/modules/theme-assessment/theme-followup-generator.service.ts:19`；`source-reference/eva-current/packages/core/src/assessment/theme-round.ts:554`；`source-reference/eva-current/apps/web/app/theme-assessment/page.tsx:121`、`:291`。

## 7. 新动态剧本生成与播放

页面状态为 idle → inquiring → ready → generating → playing → finished，另有 failed；需要本人登录。输入本次情境与问询回答，提取变量后发起生成；这是独立问询/模板生成链，不是主题轮追加题。

统一 API 前缀 `/assessment/micro-sandbox/dynamic`：

| 方法/后缀 | 作用 |
|---|---|
| `POST /start`、`POST /answer` | 创建问询会话、回答下一问 |
| `POST /complete` | 入队异步生成，返回 generation ID/status |
| `POST /abort` | 取消问询或尚未最终 ready 的生成，返回确认状态 |
| `GET /status?session_id=...` | 恢复问询及生成状态 |
| `GET /script/:generationId/status` | 轮询生成状态 |
| `GET /script/:generationId` | 取 ready 结果及已完成播放路径 |
| `POST /script/:scriptId/play` | 提交完整 played_path，注意 scriptId 与 generationId 不同 |

worker 负责生成、校验、可能修订、事务保存；Web 按 next_scene_map 播放。播放服务验证本人归属、ready 状态、首节点、每个 choice、维度信号、下一节点、不重复访问及完整结束。同脚本同路径重放，换路径拒绝。实际路径和候选 pending 数据一并提交，flush 失败不否认已保存的路径。

证据桥接仅对实际选择产生 `practice/candidate=true/system_interaction/simulation_choice` 记录，组为 dynamic-script:scriptId；当前正式视图不纳入 simulation_choice。生成后传空路径不会凭空累积选择。

**已知衔接缺口与生产未知**：

- AppModule 在非生产只在动态 Key 有配置时注册模块；还依赖数据库、队列及 worker，页面存在不保证本机默认 API 存在。
- session ID 进 sessionStorage，可恢复问询/生成；播放途中 visits 在组件内状态，尚不能宣称每个 choice 刷新可续。
- 完成页“再来一次”链接父兼容路由，父页重定向主题轮；新动态页并未自然接到游客继续路径。
- 返回类型/完成 UI 期待顶层 psychological_narrative、comparison_summary、validation_report，ready result 实际保存 `{script_id, script, revised}`；getScriptResult 基本透传再补 played_path。未见顶层心理叙述/比较供应，校验报告在 generation 独立列，不应宣称此页面已完整呈现复盘报告。
- 取消不能召回已发往模型的内容，ready 先提交后的取消不删除成功结果；队列、角色权限、真实模型效果本次未知。

证据：`source-reference/eva-current/apps/web/app/micro-sandbox/dynamic/page.tsx:6`、`:28`；`source-reference/eva-current/apps/api/src/modules/assessment/dynamic-script.controller.ts:54`；`source-reference/eva-current/apps/web/components/dynamic-script/script-play-view.tsx:35`；`source-reference/eva-current/apps/web/hooks/useDynamicScriptSession.ts:193`、`:238`；`source-reference/eva-current/apps/api/src/modules/assessment/services/micro-sandbox/dynamic-script-playback.service.ts:40`；`source-reference/eva-current/apps/api/src/modules/assessment/services/micro-sandbox/evidence-bridge.service.ts:129`；`source-reference/eva-current/apps/api/src/queue/script-generation.processor.ts:258`；`source-reference/eva-current/apps/api/src/modules/assessment/services/micro-sandbox/dynamic-script.service.ts:610`；`source-reference/eva-current/apps/web/components/dynamic-script/script-result-view.tsx:40`；`source-reference/eva-current/apps/api/src/app.module.ts:31`。

## 8. Record：现实文字记录与候选线索

入口 `/daily-mirror`，三类型 quick_fragment/emotion_log/decision_log。默认 save_only、文字、不允许周回看；语音转写和图片按钮 disabled，不能因 API 类型含这些值就写“多模态已交付”。

| 方法/接口 | 作用 |
|---|---|
| `POST /captures` | 保存原文、情绪、本地日期与处理模式 |
| `GET /captures?limit=...&offset=...` | 本人记录、线索及分页 |
| `PATCH /captures/:id/weekly-review-permission` | 逐条允许/撤回周用途；save_only 不得开启 |
| `POST /captures/:id/interpretations/:iid/confirm` | 确认规则线索；可标归因，只写候选证据 |
| `POST /captures/:id/interpretations/:iid/refute` | 不符合；已确认时撤回关联候选，重复幂等 |

save_only 只保存；organize 只取前 100 字；analyze 用中/英文关键词规则最多两条线索，没有 LLM 调用。关键词产物虽使用 aiExplanation 命名，不能当 AI 深层推理。确认同归因可返回原 evidence ID，换归因/无效状态拒绝；自述、about_other/hypothetical/unknown 必须区分。

Web 新 captures 与旧 diary 分别分页（每批 50，额外取一条探测更多）；读取失败有部分记录未加载/重试。offset 并发变更一致性、长历史性能及生产存量未验收。captures 控制器没有逐条原文删除接口；撤回证据也不是删除原文。

证据：`source-reference/eva-current/apps/web/app/daily-mirror/capture-form.tsx:19`、`:31`、`:55`；`source-reference/eva-current/apps/api/src/modules/captures/captures.controller.ts:37`；`source-reference/eva-current/apps/api/src/modules/captures/captures.service.ts:69`、`:237`、`:331`；`source-reference/eva-current/packages/core/src/evidence/capture-pipeline.ts:100`；`source-reference/eva-current/apps/web/app/daily-mirror/page.tsx:89`、`:136`。

## 9. Observe：Profile、正式观察与证据边界

Profile 实际读 evidence by-dimension、v1 portrait/current、v1 observations、主题轮 history，展示当前状态、历史返回/续做、正式观察反馈、线索及导出。若部分请求失败，目前多处 catch 降为空数组；没有内容不一定等于没有数据，不能用截图空态证明生产库为空。

| 方法/接口 | 作用/边界 |
|---|---|
| `GET /v1/portrait/current` | 本人当前修订；没有有效状态则 unknown/limitations |
| `GET /v1/portrait/revisions/:revisionId` | 本人修订读取与合格来源检查 |
| `GET /v1/observations` | 当前有效发布修订与最新本人回应投影 |
| `GET /v1/observations/:observationId/revisions/:revisionId/rationale` | 当前修订依据，合格支持/反证引用 |
| `GET /profile/portrait`、`/evolution`、`/current-vector` | 并存兼容查询，不替代正式 v1 模型合同 |
| `GET /profile/evidence/:evidenceId/source` | 本人正式合格来源及有限原文片段定位 |
| `POST /profile/evidence/:evidenceId/withdraw` | 标记 withdrawn/candidate，同步日记线索；重新计算兼容维度 |

正式 SQL 视图要求 portrait_status=formal、非候选、purpose=portrait_inference、认识论来源已分类、允许的 content_kind、来源独立组、attribution=self、治理规则 approved；模拟选择不在允许列表。批准资格过滤不是科学效度证明，也不表示生产已应用迁移。

PortraitAggregationService 目前只生成 immutable unknown 修订，不生成成熟的人格分数。v1 读取按依赖证据重新过滤，有数据表/读接口不代表正常主题轮已生产正式观察。原文下钻组件与接口存在，但当前 Profile 的正式观察回应区并未因此自动连成完整 rationale 浏览流程。

证据：`source-reference/eva-current/apps/web/app/profile/page.tsx:67`、`:175`；`source-reference/eva-current/apps/api/src/modules/portrait/portrait-v1.controller.ts:6`；`source-reference/eva-current/apps/api/src/modules/portrait/portrait-v1.service.ts:24`；`source-reference/eva-current/apps/api/src/modules/portrait/observation-v1.controller.ts:6`；`source-reference/eva-current/apps/api/src/modules/portrait/observation-v1.service.ts:9`；`source-reference/eva-current/packages/database/src/migrations/2026-09-26-evidence-eligibility-v2.sql:30`；`source-reference/eva-current/apps/api/src/modules/portrait/portrait-aggregation.service.ts:17`；`source-reference/eva-current/apps/api/src/modules/profile/profile.service.ts:232`、`:288`；`source-reference/eva-current/apps/web/components/portrait-sections.tsx:1012`。

## 10. Correct：不要混合四类反馈

| 反馈对象 | 当前效果 | 不表示 |
|---|---|---|
| 主题轮整份/单条观察 | 最新回应投影、争议保留、后续选题 target | 正式画像已更新或异议已解释 |
| 日记规则线索 | confirmed/refuted；生成/撤回候选 evidence | AI 已理解现实、正式观察已验证 |
| 正式观察修订 | confirm 记回应/事件；其他动作生成 pending_validation 纠偏记录 | 确认自动提高置信度、后台已验证 |
| 原始证据/纠偏候选撤回 | withdrawn，部分兼容维度重算或依赖修订失效 | 删除原文、全套重算/历史报告重新生成 |

正式回应：`POST /v1/observations/:observationId/revisions/:revisionId/responses`，带 UUID operation_id、action、可选解释。幂等重放不能换对象/解释。confirm 写 observation.confirmed；partial/refute/clarify 创建零权重候选、correction_records 和 correction.validation_requested。正式观察最新非 confirm 状态是 needs_follow_up；新报告主张排除待核对修订。

纠偏记录另有 `POST /v1/corrections/:correctionId/retry` 与 `/withdraw`，要求 operation_id 与 revision_number；retry 不等于验证完成。旧 `POST /corrections` 已返回 410 Gone；旧读取 recent/analytics 留作兼容，不能当现行写入口。

**修正旧文档冲突**：真相文件第 8 节旧记录说 outbox 无业务处理器；当前 worker 已注册 correction.withdraw_processed，并把引用撤回证据的 portrait revisions 标 invalidated、清 current_revision_id。注册范围仍只有这一项；observation.confirmed、correction.validation_requested 及完整新画像重建未形成可宣称闭环。仅注册的事件可被领取，未注册事件保持 pending。

证据：`source-reference/eva-current/apps/api/src/modules/portrait/observation-response.controller.ts:9`；`source-reference/eva-current/apps/api/src/modules/portrait/observation-response.service.ts:111`；`source-reference/eva-current/apps/api/src/modules/portrait/correction-v1.controller.ts:6`；`source-reference/eva-current/apps/api/src/modules/portrait/correction-v1.service.ts:121`；`source-reference/eva-current/apps/api/src/queue/outbox-poller.ts:26`；`source-reference/eva-current/apps/api/src/queue/worker.ts:588`；`source-reference/eva-current/apps/api/src/queue/correction-withdrawal-handler.ts:13`；`source-reference/eva-current/apps/api/src/modules/corrections/corrections.controller.ts:21`。

## 11. 本周回看与 Action 缺口

接口：`GET /weekly-review/current`、`POST /weekly-review/trigger`、`GET /weekly-review/history`；需本人登录。trigger 要求全局 weekly_review_analysis 和至少一条本周逐条允许、非 save_only 的 captures。

worker 按 weekStart/weekEnd 读取获授权 captures；调用模型前后复核，最终保存事务锁授权/记录。它只总结本周：模型提示明确不判断跨周趋势，数据库 mood_trend=NULL，没有上周输入或双周可比窗口。前端可显示本周记录及关键词 fallback，不是双周模型证据。

实验接口：`POST /weekly-review/:reviewId/experiments` 与 `POST /weekly-experiments/:experimentId/checkins`。create 要求本人 review.content.suggested_experiment 同时含非空 action_text、trigger_context；缺失返回 weekly_review_has_no_suggested_experiment。创建按 user/review 去重，review_on=七天后；check-in 支持 done/partly_done/no_opportunity/paused，只保存实验状态/记录，不写 evidence_events。

**供应缺口已从代码确认**：worker INSERT/UPDATE 只写 summary、eva_message、dominant_emotion、mood_trend，没有 content/suggested_experiment。自由文本“下周建议”不满足 create 合同。Web 仅在 review.content.suggested_experiment 存在时显示实验入口。因此当前不能把 API 单测/手工构造建议成功称为正常用户可用的 Action 闭环。

生产未知：模型供应商真实输出、队列消费、授权竞态外部请求窗口、建议质量、行动完成与迁移效果均未在本次验收。撤权不能召回已发送的内容。

证据：`source-reference/eva-current/apps/api/src/modules/weekly-reviews/weekly-reviews.controller.ts:26`、`:47`；`source-reference/eva-current/apps/api/src/modules/weekly-reviews/weekly-reviews.service.ts:46`；`source-reference/eva-current/apps/api/src/queue/worker.ts:195`、`:228`、`:288`；`source-reference/eva-current/apps/api/src/queue/weekly-review-authorization.ts:1`；`source-reference/eva-current/apps/api/src/modules/weekly-reviews/weekly-experiments.service.ts:18`、`:47`、`:88`；`source-reference/eva-current/apps/web/app/weekly-review/page.tsx:487`。

## 12. 数据控制与安全边界

接口为 `POST /consent/grant`、`POST /consent/revoke`、`GET /consent/status`、`GET /consent/export`、`DELETE /consent/delete`。用途包括 memory_retention、evidence_collection、report_storage、third_party_sharing、weekly_review_analysis、report_generation、chat_history_use；授权行存在不等于每项都已有完整策略与 UI。

- 保存与用途分开。save_only 不允许周回看；每条 captures 许可及全局许可都要满足。
- Profile 可导出本人 JSON；后端导出覆盖业务记录、修订、动态脚本、相关 outbox 等，非凭证账号字段经选择输出。
- 当前 Web API client 没有账户删除包装，主页面未见删除按钮或完整全局用途设置页；不能描述为用户已可一键完成全部数据控制。
- 删除先标删除状态，清队列引用；活动任务可返回 pending，需要之后重试；异常 failed，不误报成功。主库完成与第三方/备份删除分开。
- 备份返回 provider_verification_required，maximum_retention_days=30 是目标政策。删除墓碑、恢复账本重放及 unsafe_restore 门禁代码存在，不等于供应商备份到期或灾难恢复已验收。
- 兼容 Chat 原始 turns 的 90 天清理有 worker 代码；不能外推成日记/证据全部 90 天过期，生产 worker 是否运行本次未知。memory_retention 全策略仍未兑现。

证据：`source-reference/eva-current/apps/api/src/modules/consent/consent.controller.ts:10`；`source-reference/eva-current/apps/api/src/modules/consent/consent.service.ts:10`、`:35`、`:88`、`:163`；`source-reference/eva-current/apps/web/lib/api.ts:241`；`source-reference/eva-current/apps/web/app/profile/page.tsx:278`；`source-reference/eva-current/docs/CURRENT-PRODUCT-TRUTH-2026-06-29.md:147`、`:148`、`:152`。

## 13. Admin：Signal Room

Admin 是独立 Next 应用，直接由服务端查询数据库，不是用户端 API 的另一张皮。当前四区为总览、用户列表/User 360、反馈中心、质量实验室。默认 ADMIN_DATA_MODE=mock，只能看演示；api 模式用专用 ADMIN_DATABASE_URL，代码禁止回退主业务连接串，但实际数据库角色最小权限仍要单独验证。

内部路由包括 `/api/snapshot`、`/api/admin/overview`、`/api/admin/users`、`/api/admin/users/:userId`、`/api/admin/me`、`/api/admin/feedback`、`PATCH /api/admin/feedback/:feedbackId`、`POST /api/admin/audit/reveal`、`/api/admin/metrics/definitions`、`/api/admin/health`。

支持 admin/support/research/security/product_viewer 角色及权限表。生产要求管理凭证和 actor 身份；API 模式需匹配 active admin_users。敏感 email/IP/raw_words 展开要对应权限、业务理由和审计；反馈状态/严重度/内部备注变更在事务里记录历史与访问日志。这些是权限实现，不是生产合规认证。

**质量边界**：质量页是指标/分布展示，不等于自动校准科学规则或模型。部分数据库查询使用 safeQuery 空值降级；漏斗校准人数仍查询旧 user_corrections，不可自动认定代表 v1 全部反馈。User 360 的成功空数据与请求失败有区分代码，但本次未点击验收。任何 mock 注册、置信度、留存数都不能进入产品商业成果。

证据：`source-reference/eva-current/apps/admin/app/page.tsx:46`、`:919`；`source-reference/eva-current/apps/admin/app/api/snapshot/route.ts:26`；`source-reference/eva-current/apps/admin/lib/db.ts:20`、`:71`、`:252`；`source-reference/eva-current/apps/admin/lib/admin-auth.ts:17`、`:43`；`source-reference/eva-current/apps/admin/app/api/admin/audit/reveal/route.ts:41`；`source-reference/eva-current/apps/admin/app/api/admin/feedback/[feedbackId]/route.ts:51`。

## 14. 四语言、免费付费、报告与 Web3

### 14.1 四语言

支持语言常量 zh-CN/en/ja/es；切换菜单顺序为中/英/西/日。Cookie、Accept-Language 首访选择、messages 和全局切换组件存在，键盘/焦点处理也有实现。它不覆盖全部业务：主题轮 API 仅接受中文，游客固定章/主题主体/部分反馈硬编码中文，关键词解释常输出英文。语言框架存在与全旅程本地化通过是不同状态。

证据：`source-reference/eva-current/packages/core/src/shared/locales.ts:4`；`source-reference/eva-current/apps/web/components/GlobalLanguageSwitcher.tsx:15`；`source-reference/eva-current/apps/web/proxy.ts:45`；`source-reference/eva-current/apps/web/app/providers-impl.tsx:52`；`source-reference/eva-current/apps/api/src/modules/theme-assessment/theme-assessment.service.ts:395`。

### 14.2 免费/付费

users.entitlement_tier 默认 free，可为 paid；/auth/me 返回 canUseCorrections=(paid)。但当前正式主题反馈和 v1 观察回应控制器只加 AuthGuard，没有 paid 校验；capabilities helper 在当前主页面未见调用。旧纠正 POST 已退役。迁移注释明确支付集成是未来可写该字段的机制；本次业务范围未发现支付、checkout、订阅、钱包付费闭环。不要承诺价格、额度、付费升级入口或用户纠正必须收费。

证据：`source-reference/eva-current/packages/database/src/migrations/005_user_entitlement_tier.sql:1`；`source-reference/eva-current/apps/api/src/modules/auth/auth.controller.ts:41`；`source-reference/eva-current/apps/web/lib/capabilities.ts:3`；`source-reference/eva-current/apps/api/src/modules/portrait/observation-response.controller.ts:9`；`source-reference/eva-current/apps/api/src/modules/theme-assessment/theme-assessment.controller.ts:11`。

### 14.3 历史报告与 Chat

Web /chat、/report 已重定向 Profile；后端 report trigger/status/history/snapshots/detail 仍存在，明确 legacy/historical 语义。新报告需合格主张与来源清单，否则限制说明；历史状态 sources_changed 或 not_revalidated 不表示报告有效。不能把存量报告当当前用户定义或把兼容 Chat 当正式通用聊天产品。

证据：`source-reference/eva-current/apps/api/src/modules/report/report.controller.ts:12`；`source-reference/eva-current/apps/api/src/queue/worker.ts:133`；`source-reference/eva-current/docs/CURRENT-PRODUCT-TRUTH-2026-06-29.md:123`、`:128`、`:139`。

### 14.4 Web3 与外部 Agent

EVA 的 Web3 名义不改变本基准能力。本次搜索当前 Web/API/Admin/Core 未发现钱包登录、签名、合约调用、NFT/Mint 或链上证明用户主链；研究资产或注释不构成已实现。`GET /v1/agent-context?agent_id=...&purpose=...` 有用途、第三方分享及批准 grant 检查，但当前主要返回正式证据按维度计数/最近时间摘要，不是完整数字分身、Agent 路由器或钱包合同。

任何上链或外部分享仍属候选路线与用户决定；不得把敏感原话搬上不可撤回公开链，也不得把链上时间戳当事实/科学有效性验证。本次不新增这类实现或承诺。

证据：`source-reference/eva-current/docs/CURRENT-PRODUCT-TRUTH-2026-06-29.md:16`；`source-reference/eva-current/apps/api/src/modules/agent-context/agent-context-v1.controller.ts:6`；`source-reference/eva-current/apps/api/src/modules/agent-context/agent-context.service.ts:21`。

## 15. 文档冲突与后续验收边界

| 易误读表述 | 当前交接口径 | 核心证据 |
|---|---|---|
| README Next 14/React 18 | 当前 Web 声明依赖 Next 16/React 19；不是本次运行版本检测 | `source-reference/eva-current/apps/web/package.json:11` |
| “全流程多语言”“全面落地” | 四语言框架存在，主题轮拒绝非中文，生产未知 | `source-reference/eva-current/apps/api/src/modules/theme-assessment/theme-assessment.service.ts:395` |
| “确认升格画像” | 主题/日记反馈不自动升格；正式候选须独立规则 | `source-reference/eva-current/packages/database/src/migrations/2026-09-26-evidence-eligibility-v2.sql:30` |
| “语音转写可用” | 当前 Web 语音/图片 disabled | `source-reference/eva-current/apps/web/app/daily-mirror/capture-form.tsx:31` |
| “无任何 outbox 处理器” | 现有纠偏撤回失效处理；确认/验证/重建仍不完整 | `source-reference/eva-current/apps/api/src/queue/worker.ts:588` |
| “双周趋势/行动实验已闭环” | worker 仅本周回看；不写建议 content；实验 API 有供应缺口 | `source-reference/eva-current/apps/api/src/queue/worker.ts:228`、`:288` |
| “回放已含多角度心理分析” | 分支播放/完整路径保存存在，顶层结果字段供应未完整 | `source-reference/eva-current/apps/api/src/queue/script-generation.processor.ts:258` |
| “数据删除/GDPR 全兑现” | 主库/队列治理代码与政策存在，备份/第三方未知，Web 设置不完整 | `source-reference/eva-current/apps/api/src/modules/consent/consent.service.ts:35` |

接手后的验收应分层，不把本次只读总结替代实施或验收：

1. **本机真实旅程**：核实端口与源码 SHA，用隔离合成账号逐步点游客认领、主题轮/反馈刷新、记录、动态生成/播放、Profile、授权/撤回；不把 mock 当真实供应商证明。
2. **补齐合同后再验收 Action**：正常 worker 必须有批准的结构化建议来源与持久化，用户主动建立，再 check-in；不能手工塞 content 当产品供应已完成。
3. **科学与画像**：批准合格规则、验证来源独立性及反例，再验长期聚合/纠偏处理；UI 置信度数值不能代替有效性研究。
4. **发布门禁**：核实唯一服务、部署分支、实际运行 SHA、数据库角色/迁移、队列、真实邮箱/模型、备份恢复与删除重放。生产证据本次全未重新取得。
5. **IA 成效**：由用户决定目标能力与真实任务/迁移任务标准，收集原始表现、反例和持续结果；别把模拟完成率、确认率、留存或上链次数当智能增强效果。

项目真相文件的 2026-09-26 平台状态和测试记录是历史证据，不是本次现状；63% 进度也未重新核算。当前只确认指定 EVA 分支/HEAD 的源码。无网络、无业务代码修改、无提交；同目录 `01-项目核心与产品定位.md` 提供完整产品定位与旅程说明。


---

# EVA / EVA Web3 迁移交接：技术架构与复用指南

## 1. 结论与核查基准

**结论：当前 EVA 可以作为 EVA 的 Web 应用、身份与授权、记录、剧本、证据治理基础复用，但不是已经完成的 Web3 产品，也不是经过科学效度验证的人格/能力测量系统。** 更名不改变既有的来源、授权、撤回及用户主动权边界。Web3 应作为未来经用户授权的可携带证据出口，不应绕过现有数据治理。

本次核查日期：2026-10-06。唯一业务源码基准为分支 `EVA`、提交 `6a02a10337057bc5cb8cb93b92edc3037995e535`。实际检出的分支与 HEAD 均符合指定值；受控文件无已修改项，已有未跟踪文件未改动。没有采用 9/18 worktree、其构建输出或其测试结果作为当前实现依据。

交接包引用约定：本文与 `04-AI与证据科学边界.md` 中的 `路径:L起点-L终点` 全部相对于档案内 **`source-reference/eva-current/`** 的仓库根；行号对应本次指定提交。此目录应由档案打包流程提供，本次只生成两份 Markdown，没有另行复制仓库。路径采用文本而非本机绝对链接，便于搬迁。

证据等级：

- **源码已存在**：本次读取当前文件、调用点、SQL 或测试定义证实；不等于运行、部署或科学验收通过。
- **局部/兼容实现**：存在代码，但不是完整主链，或仍依赖缺失生产者/处理器。
- **当前未实现**：在受控当前源码及实际文件中未找到计划要求的实现。
- **本次未验证**：数据库实际 schema、运行角色、供应商、浏览器、生产部署及真实模型效果等。

核查只读业务仓库，只在临时交接目录写文档；未修改业务代码、安装依赖、提交或联网，也未读取或输出 `.env`、密钥和实际连接串。历史文档中的生产状态和“63%”只属于历史记录，不作为当前在线状态或本次计算结果。产品目标依据 `docs/CURRENT-PRODUCT-TRUTH-2026-06-29.md:L9-L20`：终极目标是增强人类智能，Self OS、自我模型、Agent、Web3 是候选机制。

## 2. 当前版本：声明范围与锁文件必须分开

### 2.1 工作区包

| 包 | 当前名称/版本 | 工程角色 | 依据 |
| --- | --- | --- | --- |
| 根 | `eva-web3@1.0.0` | Bun monorepo；名称仍未与 EVA/EVA 统一 | `package.json:L2-L9` |
| Web | `web@0.1.0` | Next.js 用户应用 | `apps/web/package.json:L2-L16` |
| API | `@eva/api@0.1.0` | NestJS API 与独立 BullMQ worker 的共同构建 | `apps/api/package.json:L2-L32` |
| Admin | `@eva/admin@0.1.0` | 独立 Next.js Signal Room | `apps/admin/package.json:L2-L17` |
| Core | `@eva/core@0.1.0` | 领域算法、契约、题库、剧本模板、国际化 | `packages/core/package.json:L2-L68` |
| Database | `@eva/database@0.1.0` | 基线 schema 和 SQL 迁移资源 | `packages/database/package.json:L2-L16` |
| Runtime | `runtime-sentinel@0.2.0` | 可复用运行探针、重试、报告比较工具；不是业务 worker | `packages/runtime-sentinel/package.json:L2-L23` |

### 2.2 框架与关键依赖

下表“锁定版本”来自本次 `bun.lock`，不是联网查到的最新版本，也不保证当前安装目录或线上实例使用相同版本。

| 组件 | package 声明 | 锁定版本及行号 |
| --- | --- | --- |
| Next.js | Web/Admin `^16.0.0` | `16.3.6`，`bun.lock:L1746` |
| React / React DOM | `^19.2.0` | 均 `19.3.0`，`bun.lock:L1918-L1920` |
| Nest common/core/platform-express | `^10.4.15` | 均 `10.4.22`，`bun.lock:L474-L478` |
| BullMQ | API `^5.34.8` | `5.76.2`，`bun.lock:L950` |
| ioredis | API `^5.6.1` | `5.10.1`，`bun.lock:L1430` |
| PostgreSQL 驱动 pg | API `^8.16.0` | `8.20.0`，`bun.lock:L1842` |
| Neon serverless | `^1.0.2` | `1.0.2`，`bun.lock:L470` |
| Resend | API `^6.12.2` | `6.12.2`，`bun.lock:L1962` |
| Zod | API `^3.23.8` | `3.25.76`，`bun.lock:L2318` |
| TypeScript | API/Core/Database `^5.9.3`，Web/Admin `^5` | 主条目 `5.9.3`，`bun.lock:L2198`；不是所有嵌套依赖统一版本 |
| Vitest | 根 `^4.1.0`；Web `^1.4.0` | 根 `4.1.0`，`bun.lock:L2246`；Web `1.6.1`，`bun.lock:L2596` |
| Playwright Test | 根 `1.59.0` | `1.59.0`，`bun.lock:L518` |

运行约束：根声明 `bun@1.3.14`，Node `>=24 <25`，依据 `package.json:L5`、`package.json:L32-L34`。本次工具实际为 Bun `1.3.14`、Node `v26.7.0`；后者**不符合仓库声明的 Node 主版本范围**。本次只执行只读检查，不能用这个解释器的检查成功证明 Node 24 下所有业务行为通过。

必须保留的版本差异：

- `README.md:L193-L195` 仍称 Next 14 / React 18，与当前 manifest 和 lock 冲突；交接时不能照搬。
- `docs/EVA-architecture-launch-direction-audit-2026-09-25.md:L42-L43` 的 Next 14/Node 20 是当时快照，不是当前版本。当前 API 部署工作流声明 Node 24/Bun 1.3.14，见 `.github/workflows/deploy-api.yml:L17-L27`。
- API 测试依赖 `@nestjs/testing` 锁定 `11.1.19`，而运行 Nest 是 10.4.22；其 peer 声明属于 Nest 11，见 `bun.lock:L482`。这是版本一致性风险，本次未改依赖或运行测试。
- 根 Express 5.2.1 不等于 Nest 的 HTTP adapter 也使用 Express 5；`bun.lock:L478` 中 Nest adapter 的依赖是 Express 4.22.1，根 Express 为 `bun.lock:L1248`。

## 3. 实际系统拓扑

```text
用户浏览器
  -> apps/web (Next.js App Router；页面、hooks、components)
  -> 浏览器 /api/* 同源请求 -> Next rewrites -> apps/api (NestJS)
       -> Database / AsyncLocalStorage -> PostgreSQL (本地 pg / 远程 NeonPool)
       -> Redis (OTP、限流；BullMQ)
       -> Resend 邮件
       -> 动态问询/主题追问/周回看所用 LLM
       -> BullMQ 入队
            -> 独立 worker.js
                 report-generation / weekly-review / memory-aggregate
                 personality-snapshot / script-generation
                 + portrait_outbox 定时轮询
                 + 旧报告恢复 / 兼容 Chat 原文保留清理

运营浏览器 -> apps/admin (独立 Next.js)
               -> 自身 /api/admin/* -> ADMIN_DATABASE_URL -> PostgreSQL

共享 packages/core -> 领域契约及算法
packages/database -> schema.sql + 35 个规范迁移
packages/runtime-sentinel -> 探针工具 + API sentinel 管理接口
```

API 模块装配见 `apps/api/src/app.module.ts:L31-L68`。动态剧本模块在 production 或存在非空 `DYNAMIC_SCRIPT_API_KEY` 时装配；本地 mock LLM 模块是另一个可选模块，不代表供应商服务可用。

Web 浏览器请求自动带 cookie；SSR 在生产要求显式 API URL，依据 `apps/web/lib/api.ts:L5-L29`。API 重写目标默认 `127.0.0.1:3101`，见 `apps/web/next.config.js:L4-L11`、`apps/web/next.config.js:L29-L35`。开发和生产构建目录分别 `.next-dev` 与 `.next`，Core 经 transpile/alias 引入，见 `apps/web/next.config.js:L9-L26`。

**产品入口仍受展示站 gate 限制。** `apps/web/proxy.ts:L33-L43` 只在 development、显式 `EVA_LOCAL_PRODUCT_PREVIEW=1` 且 hostname 为 localhost/127.0.0.1 时开放产品路由；否则除 `/`、`/whitepaper`、`/api/locale` 外重定向首页。存在 `/play`、`/profile`、动态剧本页面不等于生产 Web 已对外开放。这个 gate 也不能证明独立 API 被同样封闭。

当前运行主链是 `apps/web` / `apps/api`，不是把历史 Encore/Vite 资料重新作为启动基准。如需迁移历史资产，应另行盘点调用、数据和版权；本次不搬运旧环境。

## 4. 运行脚本与复用启动顺序

下面是当前脚本事实，不是本次执行记录。

| 用途 | 当前入口 | 关键边界/依据 |
| --- | --- | --- |
| 构建 Core | `bun run build:core` | `tsc` 后修正 ESM import，`package.json:L42`、`packages/core/package.json:L66-L68` |
| API 开发 | `bun run dev:api` | 根默认 API_PORT=3101；`package.json:L49` |
| Web 开发 | `bun run --cwd apps/web dev` | `next dev --webpack`；没有根 `dev:web` 脚本，`apps/web/package.json:L5-L9` |
| Admin 开发 | `bun run dev:admin` | `0.0.0.0:3102`，`package.json:L50`、`apps/admin/package.json:L6-L8` |
| API / Web / Admin 构建 | `build:api` / `build:web` / `build:admin` | 根 `build` 只串 Core/API/Web，不包含 Admin；`package.json:L43-L52` |
| Railway 构建 | `railway:build:api` / `railway:build:worker` | 两者均复用 `build:api`；`package.json:L45-L46` |
| 生产 API | `railway:start:api` | `node apps/api/dist/main.js`；`package.json:L47` |
| 生产 worker | `railway:start:worker` | `node apps/api/dist/queue/worker.js`；`package.json:L48` |
| 包内 worker | `bun run --cwd apps/api worker` | 先有 `dist/queue/worker.js`；`apps/api/package.json:L8-L12` |
| 当前迁移器 | `node scripts/apply-db-migrations.mjs` | 会写目标数据库；只能对明确授权数据库运行，本次未运行 |
| 启动空库辅助 | `bun run db:bootstrap` | `package.json:L74`；不是免审的生产数据库操作 |
| API 测试 | `bun run test:api` | 先 partition 再 Jest/Vitest；`package.json:L53-L56` |
| Core / Web / Database 测试 | `test:core` / `test:web` / `test:database` | 不等于完整运行验收；`package.json:L57-L59` |
| 聚合门禁 | `test` / `verify:local` / `verify:evidence-loop` | 含测试和构建，会产生本地文件；`package.json:L65-L75` |
| 数据平面预检 | `verify:data-plane:api` / `verify:data-plane:worker` | 配置形状和指纹，不是连通性；`package.json:L68-L69` |
| BullMQ canary | `verify:bullmq-canary` | 会连接 Redis、创建临时队列；`package.json:L67` |
| 删除墓碑重放 | `restore:replay-deletions` | 默认比对；显式 apply 是恢复数据库写操作，`package.json:L70` |

API `main.ts` 本身默认端口是 3001，根 `dev:api` 才把默认覆盖为 3101，见 `apps/api/src/main.ts:L79-L84`。交接时应配置唯一 API URL/端口，不能用“服务有响应”代替正确进程确认。Admin 监听全部网卡，复用时需决定是否只允许本地或受控网络。

建议在 EVA 独立获授权工作区按顺序：使用 Node 24/Bun 1.3.14 -> 根据 lock 安装 -> 构建 Core -> 新建明确拥有的隔离 PostgreSQL/Redis -> 核对并应用完整迁移 -> 配置 API -> 启动 API 和 worker -> Web 本地预览 -> Admin 独立接入。不要直接运行旧一键脚本并继承未知 `.env`；不向队列传用户登录 token。

## 5. 数据层、鉴权和授权

### 5.1 数据模型与迁移

PostgreSQL + JSONB 是当前权威数据层，不存在已经接通的区块链数据库、向量检索/pgvector 能力证明。本次对业务源码/SQL及业务包依赖做目标搜索，未找到钱包登录、SIWE、EAS/SAS、链上合约 SDK 或 pgvector 实装；出现 Web3 字样的注释不是功能。

| 数据域 | 权威表/关系 | 源码依据 |
| --- | --- | --- |
| 账户和登录 | users、session_tokens、挑战/限流、login_events | `packages/database/src/schema.sql:L11-L83`；`apps/api/src/modules/auth/auth.service.ts:L88-L123` |
| 现实记录 | captures -> capture_interpretations -> 候选 evidence_events | `apps/api/src/modules/captures/captures.service.ts:L139-L216`、`apps/api/src/modules/captures/captures.service.ts:L285-L322` |
| 主题轮 | rounds、items、answers、result_revisions、result_responses | `apps/api/src/modules/theme-assessment/theme-assessment.service.ts:L626-L700` |
| 动态剧本 | sessions -> generations -> scripts -> pending_dynamic_script_evidence | `apps/api/src/modules/assessment/services/micro-sandbox/dynamic-script.service.ts:L441-L533`；`packages/database/src/migrations/2026-10-04-dynamic-script-playback.sql:L3-L20` |
| 正式证据准入 | governance_rule_versions + evidence_events -> portrait_eligible_evidence_v2 | `packages/database/src/migrations/2026-09-26-evidence-eligibility-v2.sql:L30-L47` |
| 长期画像 | continuous_portraits -> portrait_revisions -> dimension_states / revision_evidence | `packages/database/src/migrations/2026-07-29-continuous-portrait-v1.sql:L79-L130` |
| 观察/主张 | candidates -> claims -> claim_evidence -> published_observations / revisions | 同迁移 `L132-L205` |
| 回应/纠偏 | observation_responses -> correction_records / revisions -> portrait_outbox | 同迁移 `L207-L252` |
| 授权 | consent_grants、agent_scope_grants | `packages/database/src/schema.sql:L299-L312`；画像迁移 `L254-L269` |
| 周回看/行动 | weekly_reviews、weekly_experiments、weekly_experiment_checkins | `packages/database/src/schema.sql:L240-L255`；`packages/database/src/migrations/2026-09-18-weekly-experiments.sql:L6-L25` |
| 删除/恢复阻断 | users.deletion_requested_at、account_deletion_tombstones | `apps/api/src/modules/consent/consent.service.ts:L189-L208` |

共用连接入口按 loopback 主机使用 `pg`，其他主机使用 `NeonPool`，并检查 PostgreSQL scheme、host、database name，见 `apps/api/src/common/pool.ts:L22-L68`。因此不能直接声称“任意远程 PostgreSQL 均可原样部署”；目标网络、驱动与 TLS 必须实测。

迁移器统一支持三种规范文件名，保留 checksum/ledger、显式依赖及空库 baseline，见 `scripts/apply-db-migrations.mjs:L9-L27`、`scripts/apply-db-migrations.mjs:L309-L330`、`scripts/apply-db-migrations.mjs:L428-L451`。`--baseline --confirm-baseline` 是人工 schema 声明，不是自动验证，见同文件 `L29-L38`。Database 包声明的 `migrate` 指向 `scripts/run-migration.js`，但该包内目标文件本次未找到；应使用已经核实的根迁移器，而不是承诺该旧别名可运行（`packages/database/package.json:L8-L10`）。

本次只读迁移检查：磁盘 42 个 SQL，35 个规范迁移、7 个 Finder 副本、0 个异常命名；5 项顺序断言通过。7 个副本未删除、未应用；35 个规范迁移与受控清单一致。**这不是空库执行成功或生产 schema 已迁移的证明。** 早期文档的 28/33 条迁移不能作为当前完整清单。

### 5.2 登录与 RLS

当前不是 JWT 或钱包签名登录，而是邮箱 OTP + 数据库 session token：验证码由 Redis 原子签发/消费，绑定签发时账户 ID；验证后写 30 天 session 和登录事件，邮件通过 Resend。见 `apps/api/src/modules/auth/auth.service.ts:L31-L123`。

`AuthGuard` 接受 `eva_session` cookie 或 Bearer token，校验未到期、未撤销和删除状态；只有 `DELETE /consent/delete` 可为删除中的账号保留重试权限，见 `apps/api/src/modules/auth/auth.guard.ts:L19-L44`、`apps/api/src/modules/auth/auth.service.ts:L153-L167`。cookie 是 HttpOnly，HTTPS 情况 SameSite=None，否则 Lax，见 `apps/api/src/modules/auth/auth.controller.ts:L153-L160`。跨域请求是否真正安全可用，还需部署后的浏览器、CORS、cookie 和 CSRF 边界验收，本次没有做该验收。

`SessionInterceptor` 传递 token 上下文；Database 用 AsyncLocalStorage 为连接设置/清除 `app.session_token`，清除失败销毁连接，见 `apps/api/src/common/database.ts:L37-L105`。schema 的 RLS 策略查询 `session_tokens`，见 `packages/database/src/schema.sql:L388-L409`。

重要限制：启用 RLS 不等于实际 DB owner/BYPASSRLS 角色受到同样限制；`security_barrier` 也不等于所有部署角色和视图所有者都完成租户隔离。worker 的 `runWithToken(userId)` 不是真实 session token，当前动态 worker 另加 userId/sessionId 归属过滤（`apps/api/src/queue/script-generation.processor.ts:L127-L173`），但仍需真实权限角色运行验证。不能把 UUID 当作用户授权凭证，更不能把登录 token 装进持久队列。

### 5.3 Consent 不应被当作“全局万能开关”

当前类型为 memory_retention、evidence_collection、report_storage、third_party_sharing、weekly_review_analysis、report_generation、chat_history_use；缺省 false，见 `apps/api/src/modules/consent/consent.service.ts:L10-L13`、`apps/api/src/modules/consent/consent.service.ts:L74-L85`。

已接入的用途控制包括报告生成/存储、周回看全局与逐条 captures 授权、第三方 Agent scope。Agent 需要全局分享授权、指定用途、未撤销/未过期且规则 approved 的 scope grant；有 evidence:read 还要 evidence_collection，见 `apps/api/src/modules/agent-context/agent-context.service.ts:L28-L75`。当前输出是 unknown 状态及有限证据计数，不是可直接用于外部自动决策的稳定人格档案。

没有证据支持 memory_retention 已控制全部写入/保留生命周期。历史文档自己也保留该缺口，见 `docs/CURRENT-PRODUCT-TRUTH-2026-06-29.md:L135`。导出权限、记录保存、模型读取用途、第三方发送、链上发布必须分开设计；撤销本地授权不能召回已发给模型的文本，更不能删除公共链上的不可逆明文。

## 6. 删除与队列恢复：当前能做与不能做

账户删除不是一个已证实的跨系统原子删除事务，也没有独立的“自动删除队列”。目前由 `DELETE /consent/delete` 发起同步协调，活动任务存在时返回 pending，之后仍需客户端重试。

实际流程见 `apps/api/src/modules/consent/consent.service.ts:L163-L240`：

1. 按 email、userId 顺序取得 advisory lock，再锁用户行并标记 deletion_requested_at。
2. 遍历五类 BullMQ 队列，按 payload.userId 删除本人非活动 job；活动 job 不强制删除，返回 pending，见 `apps/api/src/queue/queue.service.ts:L116-L145`。
3. 清 Redis OTP/限流；失败回滚 PostgreSQL，无法把 Redis 已发生的操作自动回滚。
4. 写删除墓碑，清挑战、归档、事件、outbox、画像及关联内容，最后删 users 并提交。
5. 成功只表示主库删除完成；备份返回 provider_verification_required 和最大保留目标 30 天，不是供应商已经兑现 30 天删除。

所有用户任务入队共用删除状态和 advisory lock 闸门，见 `apps/api/src/queue/queue-admission.ts:L10-L35`。恢复旧报告也通过它，见 `apps/api/src/queue/report-recovery.ts:L55-L65`。独立删除墓碑可用于恢复阻断，`/ready` 查墓碑与 users 交集，返回 unsafe_restore，见 `apps/api/src/health.controller.ts:L8-L12`、`apps/api/src/health.controller.ts:L53-L76`。

仍需验收：活动 worker 与删除并发、Redis 故障/响应丢失、滚动部署、恢复后的内容清理、供应商备份到期、日志和模型供应商副本、未来链上状态撤销。不要把 `deleted:true` 翻译成“所有地方永久删除”。

## 7. API 关键地图

下表路径相对于 Nest API base；Web 使用 `/api` 重写时应在其前加 `/api`。除明确公共/管理接口外，当前控制器使用 AuthGuard；还需要各 service 的所有权和授权校验。动态接口是否装配受前述环境条件影响。

| 领域 | 方法/路径 | 关键含义 | 控制器依据 |
| --- | --- | --- | --- |
| 存活/就绪 | GET `/health`、`/ready` | 存活及平台 SHA；就绪查 DB 恢复安全和 Redis，不证明所有任务可完成 | `apps/api/src/health.controller.ts:L44-L76` |
| 邮箱登录 | POST `/auth/send-code`、`/auth/verify-code` | OTP 获取、登录/注册 | `apps/api/src/modules/auth/auth.controller.ts:L100-L160` |
| 会话 | GET `/auth/me`、POST `/auth/logout` | 当前身份、撤销 token | 同控制器 `L36-L37`、`L168-L185` |
| 本地登录 | POST `/auth/dev-login` | 开发用途，不能作为正式登录证明 | 同控制器 `L60-L96` |
| 游客序章 | GET `/v1/story/guest-opening`、POST `/complete`、POST `/claim` | 前两项游客可用；claim 需登录，把有签名结果认领到本人历史 | `apps/api/src/modules/theme-assessment/guest-assessment.controller.ts:L10-L29` |
| 主题轮 | POST/GET `/v1/assessment-rounds`；GET `/v1/assessment-themes/coverage` | 新轮、历史、覆盖与推荐 | `apps/api/src/modules/theme-assessment/theme-assessment.controller.ts:L11-L28` |
| 主题答题 | GET `/v1/assessment-rounds/:roundId/next`；POST `/items/:itemId/responses`、`/complete` | 选题、作答和完成 | 同控制器 `L31-L48` |
| 本轮结果/反馈 | GET `/v1/assessment-rounds/:roundId/result`；POST `/result/responses` | 绑定当前轮修订，不是长期 claim 发布 | 同控制器 `L51-L60` |
| 动态问询 | POST `/assessment/micro-sandbox/dynamic/start`、`/answer`、`/complete`、`/abort`；GET `/status` | 输入/追问/入队/取消/会话状态 | `apps/api/src/modules/assessment/dynamic-script.controller.ts:L71-L114` |
| 动态结果 | GET `/assessment/micro-sandbox/dynamic/script/:script_generation_id/status`、`/script/:script_generation_id` | generation ID 查询状态和结果 | 同控制器 `L118-L137` |
| 动态播放保存 | POST `/assessment/micro-sandbox/dynamic/script/:script_id/play` | 此处是 script ID，不是 generation ID；服务端验证完整路径 | 同控制器 `L62-L69` |
| 现实记录 | POST/GET `/captures`；PATCH `/captures/:id/weekly-review-permission` | 记录保存、列表、逐条用途权限 | `apps/api/src/modules/captures/captures.controller.ts:L49-L78`、同文件 `L118-L130` |
| 记录线索回应 | POST `/captures/:id/interpretations/:iid/confirm`、`/refute` | 产生/撤回候选证据，不自动晋升正式画像 | 同控制器 `L82-L115` |
| 当前正式画像 | GET `/v1/portrait/current`、`/v1/portrait/revisions/:revisionId` | fail-closed；科学规则不足返回 unknown | `apps/api/src/modules/portrait/portrait-v1.controller.ts:L6-L22` |
| 观察与依据 | GET `/v1/observations`、`/:observationId/revisions/:revisionId/rationale` | 当前正式 claim/source 链 | `apps/api/src/modules/portrait/observation-v1.controller.ts:L6-L23` |
| 正式观察回应 | POST `/v1/observations/:observationId/revisions/:revisionId/responses` | operation_id 幂等、confirm/refute/partial/clarify | `apps/api/src/modules/portrait/observation-response.controller.ts:L9-L24` |
| 纠偏命令 | POST `/v1/corrections/:correctionId/retry`、`/withdraw` | 乐观修订前置条件、追加命令修订 | `apps/api/src/modules/portrait/correction-v1.controller.ts:L6-L28` |
| 兼容 Profile | GET `/profile/portrait`、`/evolution`、`/current-vector` | legacy 输出；分数有默认关闭 gate | `apps/api/src/modules/profile/profile.controller.ts:L6-L25` |
| 直接撤回/源定位 | POST `/profile/evidence/:evidenceId/withdraw`；GET `/profile/evidence/:evidenceId/source` | 同步撤回/旧 UBV 重算；未统一为新命令 | 同控制器 `L31-L49` |
| 兼容证据 | POST `/evidence`、`/batch`；GET `/evidence`、`/by-dimension`、`/by-source/:sourceType/:sourceId`、`/insight-candidates` | 并非所有兼容读取/写入都采用 v2；不可直接给 Web3 正式证明调用 | `apps/api/src/modules/evidence/evidence.controller.ts:L11-L79` |
| 报告兼容 | POST `/report/trigger/:conversationId`；GET `/status/:reportId`、`/history`、`/snapshots`、`/:reportId` | report 仍存 conversation_reports；历史状态不代表有效性 | `apps/api/src/modules/report/report.controller.ts:L12-L59` |
| 周回看 | GET `/weekly-review/current`、`/history`；POST `/weekly-review/trigger` | 当前仅本周授权 captures 摘要 | `apps/api/src/modules/weekly-reviews/weekly-reviews.controller.ts:L17-L44` |
| 周实验 | POST `/weekly-review/:reviewId/experiments`、`/weekly-experiments/:experimentId/checkins` | API 存在，但常规 worker 未提供建议生产者 | 同控制器 `L47-L58` |
| Consent | POST `/consent/grant`、`/revoke`；GET `/status`、`/export`；DELETE `/delete` | 按完整前缀 `/consent` 调用 | `apps/api/src/modules/consent/consent.controller.ts:L10-L47` |
| Agent 授权读取 | GET `/v1/agent-context` | 身份仍来自本人 session；scope 是额外授权条件，不是外部 agent 独立登录机制 | `apps/api/src/modules/agent-context/agent-context-v1.controller.ts:L6-L19` |
| Sentinel | GET `/sentinel/snapshot`、POST `/sentinel/cleanup` | 管理 token；cleanup 为破坏性测试数据操作，本次未执行 | `apps/api/src/modules/runtime-sentinel/runtime-sentinel.controller.ts:L11-L47` |

Admin 的 API 属于其 Next 服务，不是 Nest 前缀：`/api/admin/me`、`/overview`、`/metrics/definitions`、`/users`、`/users/:userId`、`/feedback`、`/feedback/:feedbackId`、`/audit/reveal`。可从 `apps/admin/app/api/admin/users/route.ts:L9-L32`、`apps/admin/app/api/admin/feedback/[feedbackId]/route.ts:L10-L18`、`apps/admin/app/api/admin/audit/reveal/route.ts:L9-L62` 定位。

## 8. Admin 与 Runtime 的复用边界

Admin 通过 `ADMIN_DATABASE_URL` 直接查询 PostgreSQL，明确不回落到业务 DATABASE_URL；这是独立数据库访问面，不是“所有数据都由 Nest API 代理”。见 `apps/admin/lib/db.ts:L1-L37`。

Admin 认证是共享管理 secret + 环境指定 actor + 数据库角色，不是每名运营人员独立的账户会话；角色包括 admin/support/research/security/product_viewer，敏感揭示需权限和审计。未设置 secret 的非生产模式会给开发 admin，默认数据模式不是 api，见 `apps/admin/lib/admin-auth.ts:L17-L62`。不要把默认 mock 页理解为线上真实数据监控。

迁移前必须补验：最小权限 DB role、共享 secret 与多人责任归属、揭示原文审计、禁止 mock 冒充真实、失败/空数据区别。还存在两个包装风险：Admin 源码 import `pg`，但其 package 未显式声明该依赖；远程连接使用 `rejectUnauthorized:false`，见 `apps/admin/lib/db.ts:L1-L2`、`apps/admin/lib/db.ts:L29-L33`、`apps/admin/package.json:L11-L17`。独立部署不能假定 monorepo hoisting 总能满足依赖，TLS 也需要目标环境检查。

Runtime Sentinel 可复用 defineProbe、runSentinel、HTTP、report diff、preflight、retry，见 `packages/runtime-sentinel/src/index.ts:L4-L20`；runner 按顺序执行 probe，见 `packages/runtime-sentinel/src/runner.ts:L18-L48`。它验证可观察运行信号，不验证心理科学准确率。API cleanup 可删测试数据且有生产额外 gate，见 `apps/api/src/modules/runtime-sentinel/runtime-sentinel.service.ts:L91-L96`；不能因工具名“监控”就允许在真实账号上执行清理。

## 9. EVA 最小复用顺序与发布门禁

| 顺序 | 复用目标 | 必须先通过的验收 |
| --- | --- | --- |
| 1 | 固定源码快照、版本与命名映射 | archive manifest 记录分支/SHA；保留 lock；先不大范围改包名/import |
| 2 | Core 契约、受控模板、当前题轮 | 模拟和现实来源区分；不搬运人格类型文案为新结论 |
| 3 | 数据库完整迁移、鉴权、Consent、删除 | 隔离空库及幂等迁移；真实 OTP；非 owner RLS；删除/恢复演练 |
| 4 | 游客序章 -> 登录认领 -> 本轮观察/回应 | 同一旅程刷新恢复、归属、幂等和失败可重试 |
| 5 | 动态问询 -> 生成 -> 校验 -> 播放 -> 候选证据 | 最终版本必须再验证；只存真实选择；队列故障/取消并发；参见 04 |
| 6 | 正式 claim/report/纠偏派生链 | 规则审批、v2 全消费面、来源组去重、未注册事件补链；不得用测试 fixture 假装真实生产者 |
| 7 | 本周回看、可选实验 | 先修复建议生产者/消费者断口；双周比较需要独立可比合同，不能默认上线 |
| 8 | Admin、Runtime 与发布 | 真实角色/敏感审计；API+worker+Web 同 SHA；真实任务往返，不能仅 health=200 |
| 9 | 可选 Web3 出口 | 用户逐次明确授权、最小披露、链/钱包/撤销/费用及证明含义另行决定 |

Web3 尚无当前实现可直接迁移。合理候选是“版本化、有来源且可撤销状态的证据摘要”，不是原文、邮箱、心理标签或数字人格上链；链上时间戳/签名最多证明特定数据由谁在何时声明，不能证明内容真实、来源独立或测量科学有效。选链、钱包身份绑定、SIWE/EAS/SAS、收费或代币参数均未由本次技术核查批准。

发布前必须确认唯一目标服务、分支和部署 SHA，再验证 schema、API/worker 角色、Redis、邮件、模型、备份/恢复和真实浏览器。API production 启动先检查配置形状，见 `apps/api/src/main.ts:L32-L41`、`apps/api/src/deploy/data-plane-preflight.ts:L102-L146`；worker 也有前置门禁，见 `apps/api/src/queue/worker.ts:L48-L53`。工作流同时检查 health/ready 与 EXPECTED_SHA，见 `.github/workflows/deploy-api.yml:L48-L75`。这只证明门禁代码存在，本次未触发部署或读取生产配置。

## 10. 本次验证与未确认事项

本次已执行：分支/HEAD/status 只读检查、受控文件及不存在计划文件检查、manifest/lock 版本提取、API装配及调用链读取、规范迁移数量核对、`node scripts/verify-migration-order.mjs`。迁移检查退出码 0，5 项顺序断言通过。文档写入后另校验引用文件和行号范围。

本次未执行：依赖安装、业务构建、Jest/Vitest/Bun 业务测试、数据库迁移、服务启动、Redis canary、真实 LLM/邮件、浏览器流程、任何生产或联网检查。当前测试文件存在不是本次测试通过；以前工作区的测试计数不属于本次提交验收。

关键交接缺口：outbox 只有 correction.withdraw_processed 注册；统一撤回/dispatcher 未落当前主线；confidence 来源独立组去重未兑现；动态校验改写后无复验；周回看没有双周 comparable content 和 suggested_experiment 生产；生产与科学验收仍未证明。详见 `04-AI与证据科学边界.md`。


---

# EVA / EVA Web3 迁移交接：证据、AI 与实施现状核查

## 1. 核查结论

**当前代码已经提供有边界的记录、模拟剧本、证据 v2 准入和 claim-bound 兼容报告，但不能称为完整的“证据驱动数字人格”“可恢复纠偏重算”“双周变化证明”或已科学校准的 Web3 能力凭证系统。**

唯一基准：`EVA` 分支、HEAD `6a02a10337057bc5cb8cb93b92edc3037995e535`，2026-10-06 只读核查。所有引用 `路径:L起点-L终点` 相对于交接包 `source-reference/eva-current/` 的仓库根。没有引用本机绝对路径，没有使用 9/18 worktree 作为实现基准。版本、拓扑、鉴权、删除和完整 API 地图见 `03-技术架构与代码地图.md`。

本文“已存在”表示源码/SQL可定位，不表示本次运行通过。“未找到”是当前受控代码与实际文件的核查结果，不是在断言历史工作未曾做过，也不推断代码被丢失、回滚或合并的原因。旧完成声明必须重新绑定到本次 SHA 才能沿用。

最重要的当前事实：

1. `FORMAL_EVIDENCE_VIEW` 指向 `portrait_eligible_evidence_v2`，准入条件真实存在；部分兼容写入、重算和 insight 读取仍不是这一统一入口。
2. 当前 worker **确实注册** `correction.withdraw_processed`，可失效相关画像修订；不存在 9/18 的 outbox-dispatcher / portrait-event.processor。
3. 当前 weekly worker 只用获授权的本周 captures，显式写 `mood_trend=NULL`；不写双周 comparison content，也不写 `content.suggested_experiment`。
4. 动态剧本路径保存接口已经存在，只采集实际走过的选择；生成完成本身不产生已作答证据。但 critical 校验后只改写一次，不复验最终版本。
5. confidence、RCI 数学函数存在，不等于得到实证信度、效度、准确率或真实能力变化证明。

## 2. 证据模型：不要把五种概念混成一个分数

| 概念 | 当前表示 | 不能推导出的结论 | 依据 |
| --- | --- | --- | --- |
| 存储入口 | source_type/source_id | 标签叫 test、diary 不证明测量或事实有效 | `packages/core/src/evidence/evidence-types.ts:L70-L78` |
| 用途/权重类别 | evidence_kind：formal/practice/calibration/reality/decision/correction/chat_legacy | 名称 formal 不自动满足正式画像准入 | 同文件 `L79-L86` |
| 认识论来源 | epistemic_source：unknown/user_self_report/system_interaction/authorized_external_record | 自述或系统互动不是独立外部验证 | `packages/core/src/evidence/evidence-semantics.ts:L1-L9` |
| 内容种类 | self_description/recalled_event/stated_intention/simulation_choice/product_action/user_correction/unknown | 游戏选择不是现实行为；回忆不是实时观察 | 同文件 `L2` |
| 来源独立组 | source_independence_group | 有 group 字段不表示计数/置信度真的去重 | 同文件 `L5-L16`；当前 confidence 实现在第 7 节 |
| 主体归因 | self/about_other/hypothetical/quoted/mixed/unknown | 非本人或假设不能当成本人画像依据 | 同文件 `L3`；SQL 使用 quality_metadata.attribution |
| 治理状态 | portrait_status + candidate + status_rule_id + purpose_scope | 用户“确认”不等于规则批准，也不等于事实验证 | `packages/database/src/migrations/2026-07-29-continuous-portrait-v1.sql:L22-L40` |

### 2.1 v2 正式准入是真的，但不是全链科学认证

当前 SQL `portrait_eligible_evidence_v2` 使用 security_barrier，要求：

- portrait_status='formal' 且 candidate=false；
- purpose_scope='portrait_inference'；
- epistemic_source 不为 unknown；
- content_kind 只允许 self_description / recalled_event / product_action；
- source_independence_group 非空；
- quality_metadata.attribution='self'；
- status_rule_id 对应 governance_rule_versions.status='approved'。

依据 `packages/database/src/migrations/2026-09-26-evidence-eligibility-v2.sql:L30-L42`。同迁移删除 9/10 自动晋升 trigger，将旧规则晋升但认识论来源仍 unknown 的特定 formal 行降为候选，并使旧 v1 view 指向 v2，见 `L11-L24`、`L44-L47`。不根据历史 source_type 猜补现实来源。

**approved 的数据库枚举不是科学同行验证。** 9/10 迁移实际插入过工程批准规则，见 `packages/database/src/migrations/2026-09-10-portrait-channel-repair.sql:L26-L38`；9/26 移除自动晋升并不代表删除所有旧规则行或完成科学校准。迁移接收方应核对 rule definition、批准者、evidence_ref 与适用用途，不能把 status='approved' 直接包装成“科学认证”。本次未连接数据库核实当前实际规则存量。

### 2.2 已迁移的消费面与残余兼容路径

正式入口常量见 `apps/api/src/common/formal-evidence.ts:L1-L5`。当前用它的包括画像读取/修订、正式观察及依据、Profile 正式证据、报告 claims、Agent 有授权证据计数、部分选题逻辑，关键定位：

- `apps/api/src/modules/portrait/portrait-v1.service.ts:L24-L51`、同文件 `L91-L107`；
- `apps/api/src/modules/portrait/observation-v1.service.ts:L9-L52`、同文件 `L56-L105`；
- `apps/api/src/modules/profile/profile.service.ts:L167-L210`；
- `apps/api/src/queue/report-claims.ts:L12-L46`；
- `apps/api/src/modules/agent-context/agent-context.service.ts:L45-L75`；
- `apps/api/src/modules/assessment/assessment.service.ts:L1053-L1079`。

不能声称“所有消费者已统一到 v2”：`EvidenceService.getByUser` 默认只有 candidate 过滤，getInsightCandidates 读兼容证据及 UBV，`recomputeDimension` 直接读 evidence_events，见 `apps/api/src/modules/evidence/evidence.service.ts:L181-L186`、同文件 `L235-L308`、`L404-L480`。此外 legacy snapshot/shift worker 使用旧 memory_state 和自己的计数，见 `apps/api/src/queue/worker.ts:L401-L419`、同文件 `L498-L574`。在 EVA 中恢复这些入口前要先完成调用范围与准入统一验收。

## 3. 当前证据生产者与正式画像之间的边界

| 入口 | 当前真正写入/返回什么 | 现状与局限 | 依据 |
| --- | --- | --- | --- |
| 游客固定序章 | guest_run 的结果及登录认领后的主题轮 item/answer/result | 同章共享 group，science_status=candidate_only；结果里的 evidence 不是自动写入正式 evidence_events | `packages/core/src/assessment/guest-episode.ts:L185-L199`；`apps/api/src/modules/theme-assessment/theme-assessment.service.ts:L318-L375` |
| 主题轮 | 本轮 answers、result_revisions、本人结果反馈 | 不是长期 published_observation 或稳定维度；complete 仍写主题结果表 | `apps/api/src/modules/theme-assessment/theme-assessment.service.ts:L626-L700` |
| 兼容 assessment | evidence_events 里显式 candidate=true、system_interaction、simulation_choice、assessment group | 可保留模拟记录，不符合 v2 的正式画像内容要求 | `apps/api/src/modules/assessment/assessment.service.ts:L245-L263` |
| captures | 原文、关键词线索、确认后候选证据 | user_self_report/recalled_event/capture group；确认也保持 candidate=true，非正式结论 | `apps/api/src/modules/captures/captures.service.ts:L139-L216`、同文件 `L285-L322` |
| 旧 diary | 带来源语义的候选记录 | 兼容路径仍保留，不自动当新产品主链 | `apps/api/src/modules/diary/diary.service.ts:L195-L219` |
| 动态剧本实际播放 | played_path + pending rows；阈值满足后按 script+dimension 写 practice 候选 | system_interaction/simulation_choice/dynamic-script group；不是现实迁移证明 | `apps/api/src/modules/assessment/services/micro-sandbox/dynamic-script-playback.service.ts:L28-L77`；`apps/api/src/modules/assessment/services/micro-sandbox/evidence-bridge.service.ts:L99-L160` |
| 正式观察反驳/澄清 | candidate evidence + correction_record + revision + validation_requested 事件 | 该 INSERT 未显式给 epistemic/content/group，依赖 unknown/null 默认；验证事件无当前业务处理器 | `apps/api/src/modules/portrait/observation-response.service.ts:L126-L155` |
| 通用兼容 evidence API | write/writeMany | 旧签名继续可用，未强制写语义；未知来源不能晋升正式 | `apps/api/src/modules/evidence/evidence.service.ts:L106-L123`、同文件 `L129-L178` |

`writeEvidence` 的扩展来源字段仍是可选，默认 epistemicSource/contentKind 为 unknown、group 可能缺失，而不是所有新写入方必须显式完整填写，见 `apps/api/src/modules/evidence/evidence.service.ts:L34-L43`、同文件 `L329-L387`。这说明“字段已添加”和“全部写入方已收口”是两件事。

captures 的 organize/analyze **当前不是 LLM 理解**：Core 摘录前 100 字；API analyze 回调是关键词规则。依据 `packages/core/src/evidence/capture-pipeline.ts:L100-L123`、`apps/api/src/modules/captures/captures.service.ts:L69-L134`、同文件 `L188-L192`。不可因表字段叫 ai_explanation 就称为供应商模型分析。

当前未找到 9/18 计划中的 related_source/event-link 写入与解绑 API、play_stance 输入、复制来源组继承完整实现；计划要求见 `docs/superpowers/plans/2026-09-18-eva-evidence-aware-self-model.md:L21-L30`。不应该靠时间邻近或文本相似自行假定独立性。

## 4. AI 动态剧本：已接通的链路与关键缺口

### 4.1 不要混淆三类体验

1. 游客 `/play` 使用固定 `rain-before-stop` 章节；完成后可登录认领，见 `apps/web/app/play/page.tsx:L130-L145`。
2. 主题轮是受控题库/本轮观察，可有一题可选 LLM 追问改写；保留 fallback 的角色、ID、选项结构，见 `apps/api/src/modules/theme-assessment/theme-followup-generator.service.ts:L19-L35`、同文件 `L79-L105`。只做格式、长度、禁用词检查，不等于语义等价/测量不变性已证实。
3. 登录动态剧本走 `/micro-sandbox/dynamic`：问询 -> 提取 -> 队列生成 -> 播放 -> 保存实际路径。页面与 API 是真实存在的另一条能力路径，不应把它描述成游客章节已经自动个性化的同一个实现。见 `apps/web/app/micro-sandbox/dynamic/page.tsx:L250-L286`、`apps/web/lib/api-dynamic-script.ts:L190-L240`。

### 4.2 问询、模型路由与受控生成

问询用 M2.7 conversational 包装，提取和剧本生成用 M3 JSON，四个验证 agent 用 M2.7 JSON，见 `apps/api/src/common/minimax/dynamic-script-funnel.config.ts:L75-L140`、`apps/api/src/modules/assessment/services/micro-sandbox/inquiry-agent.service.ts:L86-L127`。这些是当前代码配置名，不是本次验证的供应商模型可用性或价格。

动态配置需要 DYNAMIC_SCRIPT_API_KEY；base、M3/M2.7 model、timeout 可配，当前默认名 MiniMax-M3 / MiniMax-M2.7、默认 30 秒、maxRetries=2，见 `apps/api/src/common/minimax/dynamic-script-funnel.config.ts:L42-L70`。通用 LLM funnel 适配模型家族、超时、重试和输出收敛，见 `apps/api/src/common/llm-funnel.ts:L71-L126`、同文件 `L144-L195`、`L267-L305`。不是“所有 LLM 调用已经统一”：主题追问是独立 fetch adapter，worker 的周回看也有自身调用路径。

终止问询规则默认最少 3 轮、最多 5 轮、完整度阈值 0.7；判断对象为模型自报的 scenario/emotion/background/relationship，见 `apps/api/src/modules/assessment/dynamic-script.module.ts:L39-L51`、`apps/api/src/modules/assessment/services/micro-sandbox/completeness-evaluator.ts:L16-L22`。**0.7 是软件进度门槛，不是对一个人的理解准确率。**

ScriptGenerator 从 work/family/relationship 模板选型，模型填 narrative；scene ID、choice ID/text、dimension_signals 和 next_scene_map 来自模板，不交给模型自由改写，见 `apps/api/src/modules/assessment/services/micro-sandbox/script-generator.service.ts:L94-L137`、同文件 `L190-L219`。失败可用模板变量替换 fallback，见同文件 `L222-L254`。模板提供稳定工程结构，不代表构念/选项方向、文化适配及平行题效度已经科学批准。

### 4.3 异步生成和取消

complete 在短事务内锁定本人问询、复用已有 generation/幂等键；先提交 pending 再以 generation ID 为 jobId 入队，失败保留 pending 供用户重试，见 `apps/api/src/modules/assessment/services/micro-sandbox/dynamic-script.service.ts:L441-L533`。没有数据库/Redis跨存储原子提交，也没有已证实的动态任务无人自动补投恢复器。

worker 阶段为 pending -> generating -> validating -> revising（可选）-> saving -> ready/failed，检查 job 的 user/session/generation 归属；不可见 generation 抛错，归属错配写 job_scope_mismatch，见 `apps/api/src/queue/script-generation.processor.ts:L137-L190`。saving 行锁内把最终 script 与 ready 一起提交，见同文件 `L237-L274`。取消及前态检查存在，见 `apps/api/src/modules/assessment/services/micro-sandbox/dynamic-script.service.ts:L639-L693`。取消不能召回已发给供应商的请求；最终 ready 先提交时不能假定之后取消会删除结果。

### 4.4 四个校验 Agent 不是严格的最终发布证明

orchestrator 使用 Promise.allSettled：content_safety / measurement_alignment 技术错误 fail-closed；logic_consistency / personalization 技术错误合成 passed=true 并记录 fail-open reasoning。见 `apps/api/src/modules/assessment/services/micro-sandbox/validation/orchestrator.ts:L79-L119`。因此“4 个结果都 passed”可能包含未执行成功的质量检查。

**复用前高优先级缺口：critical 内容结论没有最终复验门禁。** 当前 has_critical_failure 只触发一次 shouldRevise；processor 改写失败保留原脚本，成功也不再运行 validate，随后仍保存 ready，并附初稿 validation_report。见 `apps/api/src/modules/assessment/services/micro-sandbox/validation/orchestrator.ts:L113-L129`、`apps/api/src/queue/script-generation.processor.ts:L190-L215`、同文件 `L266-L272`。

源码可以支持“安全/测量验证器技术错误时阻断”，**不支持**“任何 critical 脚本都被阻断”或“最终发布脚本通过四 Agent 验证”。本次只读定位此风险，未修改行为或用真实模型复现。迁移验收应增加：初稿 critical、改写仍 critical、改写技术失败、改写新增问题、质量 agent 不可用及最终版本报告绑定测试；最终校验未通过不得展示为已经验证。

### 4.5 播放保存和证据桥：只保存真实选择

POST `/assessment/micro-sandbox/dynamic/script/:script_id/play` 接受 played_path；GET generation result 使用 generation ID，两个 ID 不要互换。服务端检查本人、ready、未 abandoned；锁 script，对已完成相同路径幂等重放、不同路径 409；校验首节点、分支顺序、重复/循环、选项存在、维度和 0..1 信号、路径终止，见 `apps/api/src/modules/assessment/services/micro-sandbox/dynamic-script-playback.service.ts:L40-L116`。

路径与 chosen-only pending 写入同事务，commit 后才 flush；flush 失败不谎报路径回滚，见同文件 `L28-L35`、`L67-L77`。生成 ready 时 accumulate 的路径为空，因此不会自动为未选择分支写证据，见 `apps/api/src/queue/script-generation.processor.ts:L218-L225`。

EvidenceBridge 按 script+dimension 聚合平均 signal，写 practice/candidate=true/system_interaction/simulation_choice，独立组为 dynamic-script:scriptId；选中行和 flushed_at 同事务提交，见 `apps/api/src/modules/assessment/services/micro-sandbox/evidence-bridge.service.ts:L50-L88`、同文件 `L99-L160`。practice 权重引用 Core 常量，默认 flush threshold=3（pending 行数，不是三次独立真实任务），见 `apps/api/src/queue/script-generation.processor.ts:L119`。

flushStale 目前没有 worker scheduler 调用，而且仍使用同一阈值；低于阈值的旧 pending 不会因为时间已久就自动入证据，见 `apps/api/src/modules/assessment/services/micro-sandbox/evidence-bridge.service.ts:L170-L184`。不能承诺所有播放都会及时形成证据。

## 5. Claim、Observation、Report 的真实状态

### 5.1 表结构与生产链必须分别核查

当前有 observation_claims、claim_evidence、published_observations/revisions 关系表，见 `packages/database/src/migrations/2026-07-29-continuous-portrait-v1.sql:L132-L205`。主题 complete 不自动建这些正式关系，见 `apps/api/src/modules/theme-assessment/theme-assessment.service.ts:L645-L665`。本次在运行 API 源码未找到完整的 approved 聚合 -> materialized claims -> 正式发布生产闭环；测试/手工 fixture 中存在 claim 不能证明用户输入可自然产出正式 claim。

PortraitAggregationService 当前只允许 aggregateUnknown：合格输入 -> 不可变 unknown revision -> limitation-role input manifest -> current pointer -> unknown_revision_created 事件，见 `apps/api/src/modules/portrait/portrait-aggregation.service.ts:L17-L26`、同文件 `L69-L97`。不是成熟画像合成算法；该 outbox 类型目前也无注册处理器。

PortraitV1 读取过滤不再合格的关联证据，默认返回 unknown/限制；available 是读取已存 dimension_states 的能力，不证明当前已有合规生产者，见 `apps/api/src/modules/portrait/portrait-v1.service.ts:L24-L87`。

### 5.2 当前报告确实 claim-bound，但不是 LLM 自由总结

report worker 从当前本人 published/fallback 修订取最多 12 个 claims，排除最新 partial/refute/clarify；要求全部关联证据都仍在本人 v2 中，至少一条 support，分别返回 support/counterevidence IDs，见 `apps/api/src/queue/report-claims.ts:L12-L43`。

当前正文由固定受控模板拼 canonical claim，并加有限情境声明；零 claim 生成限制说明。**本段不调用 LLM**，也不送 chat、日记和纠偏原文让模型补人格结论，见 `apps/api/src/queue/worker.ts:L133-L153`。模板限制新增断言，但上游 canonical_claim 自身的科学/语义有效性仍需治理，模板不能修正一个本来就不合理的 claim。

生成前后检查 report_generation/report_storage；最终事务锁观察、证据及规则并复核 claim 清单，防止提交前撤回，见 `apps/api/src/queue/worker.ts:L128-L160`、`apps/api/src/queue/report-persistence.ts:L12-L47`、同文件 `L107-L157`。存储和兼容传输仍用 conversation_reports，不能描述成已完成一个全新的独立报告平台。

report 的恢复器是真实存在的**另一条恢复能力**：每 30 秒领取超过 2 分钟未更新的 generating 报告，job 缺失时按 report ID 和保存 locale 补投；终态 job 无结果则标失败。见 `apps/api/src/queue/report-recovery.ts:L16-L69`、`apps/api/src/queue/worker.ts:L595-L608`。这不是 outbox dispatcher，也不能推广为所有异步事件都已可恢复。

历史读取可对完整 evidence-v1 来源清单检查 current claim/revision/support/counterevidence ID 一致性，不一致返回 sources_changed；一致或无完整清单仍是 not_revalidated，不改正文，见 `apps/api/src/modules/report/report.service.ts:L21-L70`、同文件 `L147-L209`。not_revalidated 绝不能翻译成“验证有效”。

### 5.3 回应不等于事实确认

正式观察回应带 operation_id/fingerprint，绑定本人当前修订，confirm 首次/重放仍为 confirmed，并写 observation.confirmed 事件；不是 9/18 要求的 recorded/no-outbox 行为。见 `apps/api/src/modules/portrait/observation-response.service.ts:L34-L96`、同文件 `L111-L123`。

partial/refute/clarify 建 pending_validation 纠偏；列表和依据投影 needs_follow_up，并排除待核对内容进入新报告，见 `apps/api/src/modules/portrait/observation-v1.service.ts:L9-L52`、`apps/api/src/queue/report-claims.ts:L23-L40`。读取时失效/限制是已存在的保护，不代表纠偏已被自动验证成新事实。

## 6. Outbox 与撤回：必须纠正旧完成声明

### 6.1 当前 outbox 注册与送达语义

当前入口是 `apps/api/src/queue/outbox-poller.ts`，worker 在 `apps/api/src/queue/worker.ts:L590-L593` **注册 correction.withdraw_processed**。不能再写成“当前没有任何业务处理器”。

poller 只领取已注册类型、delivered_at IS NULL 的事件，批量 20，FOR UPDATE SKIP LOCKED；await handler 成功后才更新 delivered_at；失败回滚、以后固定周期再轮询，未注册事件保持 pending，见 `apps/api/src/queue/outbox-poller.ts:L21-L84`。

当前 delivered_at 的含义是**注册 handler 已返回成功**，不是 9/18 dispatcher 的“BullMQ 已接受事件”。poller 自身不把事件投到 BullMQ。outbox 的 schema 只有基础事件/送达列，见 `packages/database/src/migrations/2026-07-29-continuous-portrait-v1.sql:L241-L252`；未找到 attempts、next_attempt_at、last_error、dead_lettered_at 的恢复迁移。不要把 BullMQ 队列配置里的 retries 当成 portrait_outbox 的指数退避/死信实现。

唯一注册 handler 读取 payload.evidence_id，失效引用该证据的 portrait_revisions 并清除 current pointer，不自动计算新分数或创建替代画像，见 `apps/api/src/queue/correction-withdrawal-handler.ts:L13-L37`。它使用传入 pool 查询，不是 poller 锁定事件的同一个 client，因此业务修改与 delivered_at 不能概括成跨两次连接的单一原子事务；当前失效 SQL可重复执行，但不能据此证明所有未来 handler 都有幂等保障。

仍发射而未注册的类型包括 observation.confirmed、correction.validation_requested、portrait.unknown_revision_created，依据 `apps/api/src/modules/portrait/observation-response.service.ts:L115-L151`、`apps/api/src/modules/portrait/correction-v1.service.ts:L137-L141`、`apps/api/src/modules/portrait/portrait-aggregation.service.ts:L91-L95`。这些事件保存下来，不等于对应反馈权重/纠偏验证/发布行为执行。

### 6.2 撤回仍有两个不一致入口

- 直接 Profile withdraw：更新本人 evidence 为 withdrawn/candidate、同步关联 capture 线索，再调用 recomputeDimension 写旧 memory_state；重复撤回返回 already_withdrawn/recomputed=null。没有 operation_id 命令修订，也不发统一 evidence.withdrawn 事件。见 `apps/api/src/modules/profile/profile.service.ts:L232-L277`。
- CorrectionV1 withdraw：operation_id + revision_number、追加命令修订，撤回 correction 所挂 candidate/formal evidence，并发 correction.withdraw_processed。handler 负责失效相关画像；retry 发 validation_requested 但尚无验证 processor。见 `apps/api/src/modules/portrait/correction-v1.service.ts:L42-L146`。

当前未找到统一 EvidenceWithdrawalService；未实现计划所述所有入口返回 recalculation_pending、用 outbox ID 派生唯一重算操作并产生一条新结果修订。直接撤回写入与随后重算不是统一可恢复命令：中途失败后 evidence 可已撤回，重试又进入 already_withdrawn 分支，不能承诺派生重算最终自动完成。

正式读取会基于 v2 过滤已撤回来源、报告可标 sources_changed，这是重要保护；但其作用不等于物理历史删除、自动重算或对外链上凭证自动撤销。

## 7. Confidence、RCI 与科学承诺边界

### 7.1 Confidence 的工程实现

四因子算法真实存在：confidence = clamp(min(sufficiency, consistency, sourceCoverage, calibration))，并使用旧加权聚合器算 value，见 `packages/core/src/evidence/confidence-engine.ts:L153-L179`、同文件 `L266-L298`。它会排除 candidate、simulation_choice 和 withdrawn，但调用者必须传入相应字段。

**来源独立组去重没有在当前 confidence 中落实。** sufficiency 按 evidence_kind + local_date 分组后同日递减，sourceCoverage 按 evidence_kind 转 test/capture/decision 类别，未使用 source_independence_group 去重；calibration 的 dynamicPassed 仍硬编码 true。见 `packages/core/src/evidence/confidence-engine.ts:L183-L218`、同文件 `L232-L263`。数据库 group 字段和动态桥按剧本聚合是局部防护，不等于四因子全链保证一个独立来源只贡献一次。

`recomputeDimension` 直接从 evidence_events 读 candidate=false，但 SELECT 未带 content_kind、portrait_status、source_independence_group；扩展字段是可选，过滤器可能看不到它们；calibration timestamps 的 SQL 也没采用 v2。它以当前 memory.ubv.value 为 base，再聚合现有 delta，最后回写 memory_state，见 `apps/api/src/modules/evidence/evidence.service.ts:L404-L480`。这不是不可变、可重复 replay 的正式画像重算合同。

开启四因子取决于 `EVA_STRUCTURED_REFLECTION_V1=1`，否则走旧聚合，见 `apps/api/src/common/feature-flags.ts:L3-L11`。兼容 Profile 的 `EVA_PROFILE_SCORES_ENABLED=1` 可读取旧 UBV 分数，默认关闭，见 `apps/api/src/modules/profile/profile.service.ts:L24-L71`。因此“分数永远硬编码 null”已不准确，但也不能建议直接开关解锁科学能力。

confidence 是软件规则算出的证据状态指标，不是“结论有 X% 可能正确”，也不是个人能力百分位。阈值、权重、冲突判定和来源类别需要单独实证校准，不能因函数测试绿色就承诺准确率。

### 7.2 RCI 的数学函数与实际连接

`computeRCI` 存在，公式为 `(current.value - baseline.value) / sqrt(current.variance + baseline.variance)`，SE=0 返回 null，|RCI|>1.96 标 significant；detectYouShifted 会比较基线并组织文案，见 `packages/core/src/memory/memory.ts:L648-L669`、同文件 `L672-L759`。公式注释中的统计语义依赖方差估计、样本、可比测量和模型假设，不能从 1.96 推出“已得到 95%准确率”。

兼容 assessment 确实调用 enqueueSnapshot，不是全仓零调用，见 `apps/api/src/modules/assessment/assessment.service.ts:L281-L295`。snapshot worker 保存旧 UBV，shift 受默认关闭的 EVA_SHIFT_DETECTION_ENABLED 或 job.immediate 控制，见 `apps/api/src/queue/worker.ts:L64-L68`、同文件 `L498-L574`；memory aggregate worker 当前只跳过退役 UBV 聚合，见同文件 `L354-L367`。

另一个 calibration ShiftDetectionService 明确 fail-closed：shifted=false、五个 gates 全 false，见 `apps/api/src/modules/calibration/shift-detection.service.ts:L10-L29`。两种接口不能混写成“RCI已全面上线”，也不能写成“完全无 RCI代码”。

五 gate 的 parallelItem 当前通过证据计数近似，见 `apps/api/src/queue/worker.ts:L401-L419`；不等于经过等值校准的平行剧本。迁移前需核查 baseline来源、variance、量表版本、情境、语言、独立样本和多次比较风险。当前不应承诺用户“人格改变”“韧性提高18%”“潜意识被识别”或固定人格类型。

## 8. Weekly Review 与用户实验：部分存在，不是完整闭环

当前 weekly trigger 校验全局 weekly_review_analysis、本周允许分析且非 save_only 的 captures 数量，见 `apps/api/src/modules/weekly-reviews/weekly-reviews.service.ts:L46-L66`。worker 读取获授权的**本周** captures，没有读取上一周期；prompt明确不能判断跨周趋势，见 `apps/api/src/queue/worker.ts:L195-L245`。

发送前/返回后另有授权复核，最终事务锁授权与所选记录；写 summary、eva_message、dominant_emotion，**显式 mood_trend=NULL**，见 `apps/api/src/queue/worker.ts:L247-L301`。不会把没有记录当成真实稳定趋势。不过 schema 历史默认仍是 mood_trend='stable'，见 `packages/database/src/schema.sql:L245-L249`；不能声称全部历史行/所有生产者都已清除此值。

当前未写 weekly_reviews.content 的可比较双周 manifest、source coverage、comparison status 或 suggested_experiment。服务读 content 并不说明 worker生成它，见 `apps/api/src/modules/weekly-reviews/weekly-reviews.service.ts:L34-L43`。周界限由服务器本地 Date 定周，fallback captured_at::date 受数据库时区影响，见同文件 `L10-L24` 和 worker `L201-L212`；不能承诺用户时区、相邻周、采样口径与量表可比已统一。

周实验表/API/界面存在：create 必须本人周报包含 `content.suggested_experiment`，显式操作后创建；无建议返回 weekly_review_has_no_suggested_experiment；check-in 只写行动记录，不写 evidence_events，见 `apps/api/src/modules/weekly-reviews/weekly-experiments.service.ts:L18-L28`、同文件 `L47-L85`、`L88-L133`，及 `apps/web/app/weekly-review/page.tsx:L487-L533`。

**当前常规周报生产者与实验消费者断开。** 文本 prompt 包含“下周建议”不等于结构化 suggested_experiment。API单元测试用带建议fixture验证创建，也不能证明正常周回看会提供建议。可以复用实验命令与“自愿行动”边界，不能在本交接包把它标成自动可达闭环。

另外，禁用队列时 enqueueWeeklyReview 仍返回构造的 key，未真正入队；report 和 generic dynamic add 已显式失败，但该 weekly 专用方法没有同等行为。见 `apps/api/src/queue/queue.service.ts:L58-L73`、同文件 `L99-L117`。因此“所有队列禁用都报 queues_unavailable、绝不假 job ID”的旧声明不能沿用。

## 9. 9/18 实施计划：12 个 Task 全项抽查

抽查来源是当前受控的 `docs/superpowers/plans/2026-09-18-eva-evidence-aware-self-model.md`。状态按当前代码实质判断，不按计划里的复选框或旧 completion 摘要推定。**12 项全部核查，未把部分实现折算成完成率。**

| Task / 计划行号 | 计划要求 | 当前核查状态 | 当前证据和差异 |
| --- | --- | --- | --- |
| 1，`L131-L244` | 冻结语义契约，当前 writeEvidence 必填 | **部分** | enum/helper/type 已有：`packages/core/src/evidence/evidence-semantics.ts:L1-L16`；writer 字段仍可选/unknown默认：`apps/api/src/modules/evidence/evidence.service.ts:L34-L43`、`L329-L387` |
| 2，`L245-L302` | 扩展语义 schema 和 fail-closed 视图 | **核心结构已存在，日期不同** | 当前实际用 9/26 evidence-eligibility-v2，不是计划9/18文件；`packages/database/src/migrations/2026-09-26-evidence-eligibility-v2.sql:L4-L47`；本次未验实际数据库 |
| 3，`L303-L395` | 全写入方显式语义、candidate、谱系追溯 | **部分** | capture/assessment/dynamic已有显式字段；ObservationResponse候选缺新语义：`apps/api/src/modules/portrait/observation-response.service.ts:L127-L135`；write/writeMany仍旧签名，related_source关联未找到 |
| 4，`L396-L469` | 每个游戏/主题轮统一来源组、play_stance、重玩限制 | **部分** | guest result共享group、dynamic script组已有；`apps/api/src/modules/theme-assessment/theme-assessment.service.ts:L318-L375`；`apps/api/src/modules/assessment/services/micro-sandbox/evidence-bridge.service.ts:L129-L144`；play_stance未找到，不能说三入口全验收 |
| 5，`L470-L532` | 所有正式消费者v2、独立来源去重 | **部分，重要未完成** | 核心读取v2已有；recompute仍原表：`apps/api/src/modules/evidence/evidence.service.ts:L408-L445`；confidence按kind/date而非group：`packages/core/src/evidence/confidence-engine.ts:L183-L263` |
| 6，`L533-L607` | 当前观察回应、Profile边界；confirm统一recorded且不发事件 | **部分，行为不符计划** | 当前confirm仍confirmed且写observation.confirmed：`apps/api/src/modules/portrait/observation-response.service.ts:L111-L123`；needs_follow_up读取保护已有：`apps/api/src/modules/portrait/observation-v1.service.ts:L9-L52` |
| 7，`L608-L677` | claim-bound fail-closed报告、受控正文 | **核心策略已存在，非计划原文件** | 当前report-claims + worker固定模板 + persistence复核：`apps/api/src/queue/report-claims.ts:L12-L43`、`apps/api/src/queue/worker.ts:L133-L160`；report-evidence-policy文件未找到，当前不用LLM draft；上游生产闭环未证实 |
| 8，`L678-L734` | dispatcher -> BullMQ稳定outbox.id、指数退避/死信 | **当前未实现计划版本** | outbox-dispatcher及恢复迁移均不存在；当前outbox-poller注册类型过滤和完成后送达：`apps/api/src/queue/outbox-poller.ts:L32-L84`；worker注册correction.withdraw_processed：`apps/api/src/queue/worker.ts:L591` |
| 9，`L735-L792` | 统一撤回服务、evidence.withdrawn处理、recalculation_pending | **部分，不是计划闭环** | 两种撤回入口仍不同；`apps/api/src/modules/profile/profile.service.ts:L232-L277`、`apps/api/src/modules/portrait/correction-v1.service.ts:L121-L146`；现有handler只失效，不重算：`apps/api/src/queue/correction-withdrawal-handler.ts:L13-L37` |
| 10，`L793-L850` | 相邻双周可比、source-backed comparison、禁用队列显式错 | **安全降级已有，比较未实现** | worker只有本周captures、mood_trend NULL、不写content：`apps/api/src/queue/worker.ts:L195-L301`；weekly禁用仍假key：`apps/api/src/queue/queue.service.ts:L67-L73` |
| 11，`L851-L911` | 自愿实验与check-in | **命令/表/界面已存在，常规生产链未接通** | `apps/api/src/modules/weekly-reviews/weekly-experiments.service.ts:L47-L133`；所需suggested_experiment无当前weekly生产者；不能把fixture测试等同正常周报可达 |
| 12，`L912-L998` | bootstrap统一、真实端到端10场景、完整ID证据 | **脚本/顺序已存在，完整验收未证明** | `scripts/verify-evidence-aware-loop.mjs:L30-L79`；脚本可跳过空库且runtime另验，缺dispatcher列/processor闭环无法宣称计划完整通过；本次仅顺序检查通过 |

## 10. 旧完成声明差异清单

| 先前表述/文档 | 当前基准实际情况 | 交接措辞修正 |
| --- | --- | --- |
| 9/18 已完成 outbox dispatcher、evidence.withdrawn portrait processor、retry/dead-letter | 计划文件地图曾列这些文件：`docs/superpowers/plans/2026-09-18-eva-evidence-aware-self-model.md:L54-L67`；当前实际文件及git受控清单均无对应实现 | 只存在outbox-poller + correction.withdraw_processed失效处理；不沿用完成声明 |
| outbox没有任何业务handler | `docs/CURRENT-PRODUCT-TRUTH-2026-06-29.md:L124` 仍这样写；当前 `apps/api/src/queue/worker.ts:L591` 已注册一个 | 明确一个已注册handler；其他类型仍无处理器，不写“全无”或“全已完成” |
| delivered_at表示BullMQ接收 | 当前 `apps/api/src/queue/outbox-poller.ts:L54-L64` 在直接handler成功后填写 | 对当前poller解释为handler完成，不套worktree dispatcher语义 |
| 独立来源组已经让confidence每组最多贡献一次 | 当前 `packages/core/src/evidence/confidence-engine.ts:L186-L214` 不按group计数 | group字段存在；算法全链去重未落实 |
| 已统一撤回，始终recalculation_pending并异步重算 | Profile同步旧UBV重算；Correction失效事件不同 | 两入口分别记录；没有统一命令和可恢复重算承诺 |
| confirm统一recorded、不再写observation.confirmed | 当前仍confirmed并发未注册事件，见 `apps/api/src/modules/portrait/observation-response.service.ts:L111-L123` | confirmed表示记录用户回应，不表示科学事实或画像已更新 |
| 双周可比回看及实验建议已生成 | 当前 `apps/api/src/queue/worker.ts:L195-L301` 只有本周、NULL趋势、无content建议 | 写明安全的本周摘要与实验生产者断口 |
| 所有禁用队列都明确错误 | generic/report已改，weekly仍返回key：`apps/api/src/queue/queue.service.ts:L58-L73` | 分方法描述，保留weekly假成功风险 |
| Profile分数全部永远null | 当前存在默认关闭的score开关：`apps/api/src/modules/profile/profile.service.ts:L24-L71` | 默认不显示；开启读旧UBV，不等于批准科学测量 |
| RCI只是未接通函数/快照零调用 | 兼容assessment有enqueueSnapshot；另一个ShiftDetectionService仍fail-closed | 同时说明代码存在、调用所在路径、默认gate及非科学证明 |
| Next14/React18 | `README.md:L193-L195` 与当前 `bun.lock:L1746`、`L1918-L1920` 冲突 | 当前锁定Next16.3.6/React19.3.0，不沿用旧技术表 |
| 迁移28或33条、历史测试计数足以证明当前完成 | 当前规范迁移35条；本次未运行业务测试 | 历史计数仅历史；本次只读检查独立记录 |
| `/ready`只做SELECT 1 | `docs/CURRENT-PRODUCT-TRUTH-2026-06-29.md:L146` 是旧说明；当前查墓碑/users交集，见 `apps/api/src/health.controller.ts:L8-L12`、`L53-L64` | 描述当前恢复安全就绪查询，不照搬旧摘要 |

这些差异在交接文档中记录，**没有修改业务仓库的权威文档**。未对冲突原因作猜测；后续如获授权同步，需更新对应权威文档及冲突副本，而不是把本临时报告自动当成线上产品事实。

## 11. 复用/补链的优先顺序

1. 先保留Core来源/候选契约、固定游客章、当前主题轮反馈、记录原文/解释分离、授权与删除基础；不要第一步复制旧人格标签、UBV分数展示或链上NFT身份结论。
2. 在独立工作区补验动态最终校验gate、取消/入队故障、实际路径持久化、pending阈值与恢复；使用合成账号和拥有的隔离DB/Redis。
3. 收口所有写入方语义和v2消费面；为source_independence_group建立确定谱系并验证重复权重不增长，不允许“换个入口就新增独立证据”。
4. 明确当前outbox只处理哪个事件；需要新的恢复链时先有可恢复processor，再开放发射。若以后采用dispatcher，单独定义队列接受和业务完成两个状态，不把旧delivered_at当万能完成标志。
5. 统一撤回语义、幂等命令、旧报告状态和派生失效；确定是否仅失效或依据批准规则生成新修订，不为满足验收强迫分数改变。
6. 先接通周实验建议生产/消费合同，再谈双周比较；比较前固定时区、采样窗口、缺失语义、版本及规则，无条件就返回不可比较，不输出改善百分比。
7. 最后补正式claim发布治理与真实证据来源、科学校准和生产验证；未经用户授权，不选择链、签名主体、证据披露或代币商业参数。

建议首个EVA可验收闭环是：一个受控任务/模拟章 -> 明确来源的本轮观察 -> 用户确认/反驳/补充 -> 一个自愿现实行动 -> 可追溯结果记录。迁移/效果证据需要独立真实任务，不得把同章重复选择视为现实能力提高。

## 12. 不可承诺科学准确率

交接包不能承诺诊断准确率、人格识别准确率、潜意识真实性、95%置信的个人变化、跨文化效度或能力提高百分比。本次无独立标准标签、验证样本、量表信度、重测信度、测量不变性、外部效标或供应商真实推理验收数据。

格式校验、冻结模板、Agent自评、confidence阈值、RCI显著阈值、source ID存在、用户确认、甚至链上签名，都各自只解决有限工程问题。必须区分：

- **工程正确性**：输入校验、来源绑定、授权、事务、重试、可撤回状态。
- **语义可靠性**：文本是否真由来源支持，是否新增人格/因果断言。
- **测量科学性**：构念、等值、独立样本、信效度及变化判定是否经验证。
- **产品效果**：用户是否在独立现实任务中变得更能理解、纠正和行动。

Web3证明应限定为“某主体在某版本规则下对某证据摘要作声明，当前撤销状态如何”，不能写成“链上科学认证人格”。原始记录、心理敏感内容和可识别个人信息不应因迁移自动公开上链。

## 13. 本次验证证据与后续验收条件

本次实际执行并确认：分支/HEAD一致、受控业务文件无修改；对计划缺失文件同时检查git受控列表和磁盘存在性；版本锁条目提取；规范迁移受控数量35；只读迁移命名/顺序脚本通过（42 SQL=35规范+7副本，5项断言，退出码0）。文件写入后检查引用文件存在和行号范围、内容无本机绝对源路径。

当前聚焦测试定义可供下次授权运行，不是本次通过结果：

| 测试定位 | 当前能覆盖的范围 | 不足以证明 |
| --- | --- | --- |
| `apps/api/src/queue/outbox-poller.spec.ts:L53-L103` | 注册过滤、事务顺序、失败回滚的模拟查询 | 全事件dispatcher、真实DB重算、死信恢复 |
| `apps/api/src/queue/correction-withdrawal-handler.test.ts:L11-L29` | 失效SQL及坏payload拒绝 | 完整纠偏科学验证或替代画像生成 |
| `packages/database/src/migrations/evidence-eligibility-v2.test.ts:L7-L21` | SQL契约字符串 | 真实部署role/RLS和实际schema迁移 |
| `apps/api/src/queue/report-claims.test.ts:L4-L21` | claim查询所需过滤与历史清单查询范围 | 上游claim生产和真实报告全旅程 |
| `apps/api/src/modules/assessment/services/micro-sandbox/dynamic-script-playback.service.spec.ts:L28-L112` | 锁、路径校验、幂等、flush失败等定义 | 真实浏览器+供应商+BullMQ完成 |
| `apps/api/src/modules/weekly-reviews/weekly-experiments.service.spec.ts:L19-L95` | 无建议拒绝、所有权、显式创建与非法checkin | 当前weekly worker生成suggested_experiment |

未执行业务测试/构建、空库迁移、真实 Redis、服务启动、browser E2E、模型/邮件或部署；避免为静态核查写业务构建产物或意外连接真实资源。完整计划Task12要求的ID链、故障后修订收敛、双周比较、实验可达与生产门禁都不能由本次检查替代。

下一次正式迁移验收需绑定同一SHA、隔离数据目标和最小权限role，并记录task/session/round/generation/script/evidence/claim/revision/report/outbox/weekly-review/experiment等实际ID；同时验证前端可见状态、刷新恢复、同用户隔离、跨用户拒绝和删除/撤回后的读取。没有真实记录就标未验证，不填造ID、科学分数或上线结论。


---

# EVA Web3 迁移方案

日期：2026-10-06。状态：可评审的建议方案，尚未实现。项目名暂用 EVA / eva；品牌可另行定稿。

## 1. 对目标的理解

用户要建立一个与 EVA 同性质、不同名字的 Web3 项目。保持 IA 的目标、游戏与记录入口、可被纠正的证据模型和人的最终选择；把身份、授权和有边界的成果携带能力拓展到 Web3。

EVA 可用一句话描述：**一个通过情境探索、个人记录、可质疑观察和真实行动帮助人增强判断能力，并允许用户自主携带和授权使用这些成果的 IA 产品。**

这一描述是建议定位，不表示 EVA 已证明“提高智力”，也不表示 EVA 已实现链上身份或数字分身。

## 2. 最小完整版本

优先建立如下旅程：

```text
游客体验固定第一章
  -> 查看本章选择、依据与边界
  -> 注册或登录（邮箱可用，钱包可选）
  -> 安全认领自己的游客记录
  -> 玩下一轮情境 / 写一条记录
  -> 查看有限观察并确认、反驳、补充
  -> 自愿做一个实际小任务，回来记录结果
  -> 明确选择导出或分享一份成果
  -> 接收者验证出处、版本与当前状态
```

首个 Web3 闭环应让用户发现：换到另一个应用之后，仍能选择向谁提供哪份成果，查看对方如何使用，并撤回后续访问。连接钱包仅是其中一个动作。

首版范围建议：现有产品核心 + 可选钱包身份 + 明确授权的成果包 + 可验证签名。先做链下签名导出；有具体跨应用验证需求后，再做测试网公开存证。发币、交易、公开人格 NFT、DAO 和全面去中心化存储没有当前必要性。

## 3. 可选路线

| 路线 | 交付价值 | 代价与边界 |
|---|---|---|
| 钱包身份 + 私有数据 + 签名成果包 | 快速验证身份与可携带性，保留删除能力 | 仍由服务端提供 AI 和存储；签名不证明行为真实性 |
| 以上能力 + 用户可选链上承诺/撤销记录 | 多个应用可查公开的提交与撤销状态 | 地址、交易时间和活动关联可能公开；增加交易失败、确认与费用流程 |
| 客户端加密 + 多存储提供者 + 多 Agent 授权 | 更强的持有与供应商切换能力 | 密钥恢复、查询、AI 解密授权和删除责任复杂，需要独立阶段验证 |

推荐按表中顺序验证，默认第一条。不预先指定 EVM、Solana、L2 或钱包供应商。下一次选型依据是目标用户的钱包生态、实际合作方、费用承担方式与团队运维能力，不靠“上链越多越 Web3”。

## 4. 保留的核心与新增适配

| 能力 | 从 EVA 继承 | EVA 新工作 |
|---|---|---|
| 情境与记录 | 原题库、动态剧本、路径保存、Capture | 新品牌与新章文案；钱包接入不改变测量含义 |
| 用户模型 | evidence、来源组、当前/历史修订、纠正 | 可携带输出合同；原始数据与共享字段隔离 |
| 身份 | 用户 UUID、会话、游客 claim | 钱包挑战、签名验证、绑定/解绑、恢复 |
| 用途授权 | consent、Agent grant、原文读取闸门 | 可验证授权回执、明确对象与用途、撤回状态 |
| 成果 | 本轮观察、历史、受限报告 | 私有导出、签名、验签、公开承诺（可选） |
| 基础设施 | Web + API + worker + PostgreSQL + Redis | 链连接/交易确认适配；新项目独立环境 |

模块名 `@eva/core` 首阶段可以保留为内部来源标识。待复用行为稳定后，才一致地改 workspace 名称、导入路径、cookie、日志前缀和 UI 品牌。全局字符串替换可能破坏兼容路径与科学规则版本，应按模块迁移并测试。

## 5. 数据与计算放在哪里

```text
EVA Web
  -> 现有会话 / 可选钱包挑战
  -> EVA API：权限、数据归属、用途与当前状态
  -> PostgreSQL：私有记录、证据、claim、修订、授权
  -> Redis/BullMQ：异步生成、重试、删除状态
  -> LLM：仅本次用途许可的最小输入

用户主动分享
  -> 最小成果 payload + 规则/版本/范围
  -> 签名回执和当前状态查询
  -> 可选：公开承诺与撤销标记
```

日记原文、心情、冲突叙述、画像向量、证据引用、邮箱和私人解释默认保留在受控链下系统。链上至多保存经用户预览并批准的随机成果标识、承诺、公开规则版本及撤销状态。即使是摘要、哈希和钱包地址，也可能透露活动关联，应逐项解释并允许用户选择。

IPFS 是公共网络，公开 CID、网络元数据和未加密内容；传输加密不等于内容加密。因此把日记直接上传 IPFS 并不能实现“私有主权数据”。这是官方文档明确的边界。[IPFS 官方隐私与加密说明](https://docs.ipfs.tech/concepts/privacy-and-encryption/)

客户端加密可作为后续阶段：要同时设计设备丢失恢复、密钥轮换、用户允许模型读取的解密范围以及服务端无法解密时的降级。不能只写一个“加密存储”开关就声称问题已解决。

## 6. 钱包身份合同

用户的内部 `user_id` 继续使用 UUID。钱包只是一种可绑定的身份方法，不直接取代所有现有表的主键。钱包地址不等于唯一自然人，也不能证明年龄、国籍、教育或人格。

新增身份绑定建议至少包含：`user_id`、链命名空间、网络、地址、验证时间、解除时间。同一身份在当前有效状态下唯一；添加或更换钱包必须验证当前会话与新钱包；合并两名用户要验证两端所有权并明确告知。

若最终选择 EVM，登录可采用 ERC-4361 / SIWE：服务端生成挑战，验证域名、URI、链、一次性 nonce、签发与到期时间及签名；nonce 原子消费；成功后建立正常会话。标准定义的是链下认证会话。[ERC-4361 官方规范](https://eips.ethereum.org/EIPS/eip-4361)

EVM 合约钱包需要按所选网络验证合约签名，不能仅用普通 EOA 地址恢复算法。[ERC-1271 官方规范](https://eips.ethereum.org/EIPS/eip-1271)

登录签名、绑定签名、分享授权和付费交易应有不同文案及用途。先体验第一章，再在用户想保存或携带成果时出现钱包选项；用户不应每选一次剧情分支就签名。

## 7. 可携带成果包：建议合同

以下字段是设计合同，不是已经存在的 EVA API：

| 字段 | 含义 |
|---|---|
| `schema_version` | 接收者按哪个固定合同解释 |
| `artifact_id` / `revision_id` | 哪份成果及哪次修订 |
| `issuer` | 谁组织、签发或验证；不是自动赋予权威 |
| `subject_binding` | 用户主动选择是否公开的身份绑定 |
| `observation` | 经审批的有限文本，而非固定人格标签 |
| `context_scope` / `time_scope` | 情境与时间范围 |
| `source_nature` | 模拟选择、用户自述、系统动作、授权外部记录 |
| `rule_version` | 使用的规则与验证版本 |
| `limitations` | 证据不足、不独立、争议、未外部验证等 |
| `issued_at` / `expires_at` | 签发与可用期限 |
| `status_reference` | 查询已撤销、来源变化与历史状态 |
| `audience` / `purpose` | 允许谁为哪个用途使用 |

对外不默认附带数据库 evidence ID、原文引用或所有历史选择。跨应用证明“某次任务完成”时，要表明是用户自述、平台动作还是独立验证。接收者不能从“签名正确”推出“这个人具有某种人格”或“智能已经增强”。

EVM 的结构化授权可使用 EIP-712 表达有类型字段，但它自身不提供重放保护；仍需要域、nonce、到期时间与服务端状态检查。[EIP-712 官方规范](https://eips.ethereum.org/EIPS/eip-712)

## 8. 公开承诺与撤销

需要公开存证时，先对最小 payload 固定字段顺序、编码和 schema 版本，使用足够随机的独立 salt 计算承诺；salt 与私有 payload 由用户或受控存储保留。不要把短心情文本直接哈希上链：低熵内容可被猜测后比对。

承诺校验只说明“提供的内容与当时承诺相匹配”。证明什么时候提交、谁签名、使用哪个版本和是否撤销，与证明事实真实、模型科学或观察仍有效是不同检查。

如果链上设计加入撤销：签发者权限、撤销权限、权限轮换、不可转让身份绑定、nonce 与当前状态读取都需明确。使用现有 attestations 服务前还需验证其网络、撤销合同与升级边界。本包没有选定或部署某个证明协议。

撤回后的行为：停止新的分享/Agent 访问，撤销当前可用回执，原观察降级为历史或无效，再触发依赖失效。公开链上的历史交易及第三方已经复制的内容不能宣称即时删除。给用户的分享预览必须解释这一点。

## 9. Web3 与 AI 的边界

AI 负责整理许可范围内的输入、生成受约束场景、提出可质疑观察、帮助规划行动。服务端和规则负责来源、计分方向、权限、资格、幂等与证据引用。钱包证明密钥控制；链证明公开状态。三者都不能替用户决定，也不能相互自动升级可信度。

更科学的验证目标是：某个具体任务中判断是否改善、换一个情境能否迁移、效果是否保持、是否有负担或反作用。需要定义测量版本、比较条件、真实数据与校准；不能因游戏更沉浸而宣称更准。

## 10. 开始实现前的少数关键决定

1. 首个目标用户与真实任务是什么？首版保留哪一种 IA 能力改善？
2. 接收成果的另一应用是谁，实际需要哪些字段和撤销状态？没有接收方时先验证私有导出。
3. 钱包是否可选；邮箱与恢复如何支持没有 Web3 经验的用户？
4. 选择哪个链生态，公开承诺是否有必要，谁承担交易费用？
5. 首版分享什么、默认不分享什么，是否允许匿名或应用专用身份？

以上均为新项目待决策事项，本次无需决定链就能使用 EVA 的产品与代码交接材料。


---

# EVA 执行与验收指南

日期：2026-10-06。本指南面向开发者和代码初学者；步骤按依赖排序。文件夹中的参考源码不是自动重命名后的新产品。

## 1. 先锁定输入

- 参考基准：EVA 分支，提交 `6a02a10337057bc5cb8cb93b92edc3037995e535`。
- 阅读 01–05 文档，确认保留 IA 目标、无标签表达、可被纠正观察、权限与数据控制。
- 以当前快照为主，9 月 18 日设计只作历史规格。不要从旧分支覆盖新分支的 consent、删除队列和动态播放。
- 第一轮成功标准：新独立环境可完成游客章、注册认领、下一轮、反馈刷新恢复和数据控制；随后才接钱包与可携带成果。

## 2. 建立独立项目

在 `eva` 下新建 `app/` 工作目录，把 `source-reference/eva-current/` 中需要的源码复制进去。保留本交接包作为参考。源码快照没有原仓库 Git 历史、真实环境或供应商账户；新项目应建立独立 Git 仓库和环境。

首轮建议复用 `apps/web`、`apps/api`、`packages/core`、`packages/database`、相关 `scripts` 与测试。`apps/admin` 可以作为后续运维工具保留，不是游客主旅程的前置条件。`packages/runtime-sentinel` 为原 workspace 组成部分；删减前先查依赖。

不要先做全量重命名。UI 品牌、域名、邮件发件人、Cookie、工作空间包名、跨域白名单和部署目标分别记录与修改；变更 import 名时同步 workspace 和 lockfile，再做构建。

参考源码附带的 `.github/workflows/deploy-api.yml` 只用于理解原项目的 CI/部署门禁。不要直接激活该工作流；EVA 新仓库应重新定义自己的目标服务、secret 和发布规则。

## 3. 开发运行条件

当前 package 要求 Node.js `>=24 <25`，使用 Bun 工作空间。Web/Admin 是 Next.js 16 + React 19，API 是 NestJS 10，数据库 PostgreSQL，队列 Redis/BullMQ。安装 `psql` 以执行正式迁移。

新建空的开发 PostgreSQL 数据库和独立 Redis 实例。真实 LLM、邮件和正式运行要用新项目自己的账户与密钥。模板在 `templates/eva-api.env.example` 和 `templates/eva-web.env.example`；模板不是现成的连接凭证。

动态剧本使用独立的 `DYNAMIC_SCRIPT_*` 配置，仅填写 `OPENAI_API_KEY` 不能启用它。开发环境没有 `DYNAMIC_SCRIPT_API_KEY` 时该模块不会注册；生产缺少该配置也可能在初始化时失败。先按技术架构文档核对实际模型和接口可用性，再进行真实生成验收。

在 `app/` 目录、已设置本机开发环境后：

```bash
bun install --frozen-lockfile
node scripts/verify-migration-order.mjs
bun run db:bootstrap
bun run build:core
```

`db:bootstrap` 使用当前进程的 `DATABASE_URL`，不会因为存在 `.env` 就自动知道要连哪个数据库。先确认此变量明确指向新建的 EVA 开发库。迁移 runner 负责 schema 与 ledger，历史 SQL 不能随意重写。不要对已有 EVA 生产库执行该指南。

分终端运行，避免原 `dev-all.mjs` 从旧 `backend/.env` 读取配置：

```bash
# 终端 1：API，事先载入本机开发环境
PORT=3101 bun run dev:api

# 终端 2：Web 的本机产品预览
EVA_LOCAL_PRODUCT_PREVIEW=1 NEXT_PUBLIC_API_URL=http://127.0.0.1:3101 bun run --cwd apps/web dev

# 终端 3：worker，须拥有与 API 相同的开发数据库和 Redis 配置
bun run build:api
node apps/api/dist/queue/worker.js
```

API 的默认脚本会依据 `API_PORT` 设置端口；建议同时设 `API_PORT=3101`。当前 proxy 默认只开放首页、白皮书和语言 API，本机预览还要求 `development` 与 localhost。给 EVA 开放正式产品路径是后续显式发布任务，需要通过验收后调整，不能只依靠“Web 页面已写好”。

## 4. 第一个实施批次：产品核心

| 工作 | 复用起点 | 完成标准 |
|---|---|---|
| 游客固定第一章 | `apps/web/app/play`、guest episode、theme guest service | 无需登录可玩，回到页面不乱丢选择 |
| 注册认领 | auth + guest claim | 伪造、过期、跨用户认领被拒绝；相同认领幂等 |
| 主题轮 | theme-round + ThemeAssessmentService | 6–8 决策点、结果依据与边界、完成/继续刷新恢复 |
| 动态剧本 | dynamic session + generation processor + playback | 生成就绪才可玩；合法路径保存，重放不能换路径 |
| 记录与回应 | captures、feedback、Profile | 保存与 AI 用途分开；反驳后旧文案标为待核对 |
| 数据控制 | consent、账户删除、队列闸门 | 导出可追溯；删除中禁止新写入；活动任务不复活用户数据 |

游客认领完成不意味着正式人格画像建立；任何模拟选择和自述仍保留其来源性质。

## 5. 第二个批次：补齐当前真实缺口

先处理以下问题再将其写进 EVA 宣传：

- 长期聚合当前可产生 `unknown`；批准科学规则、建立可验证模型与选择算法前，保留限制状态。
- 当前周回看只分析获授权的本周 captures；跨周可比较清单、来源组去重、时区、测量版本与缺失处理需另外补齐。
- 自愿实验 API 已有；worker 是否真正提供和持久化 `suggested_experiment` 要补好，不能仅有一个 UI 按钮。
- outbox 当前实现与 9/18 的 dispatcher 设计不同；需要根据现有处理器、事务及当前状态设计重试/重放，不能宣称八次重试和死信已在主线。
- 个性化探索已有规则反馈和动态输入能力；“从所有历史资料自动生成最准确数字人格”仍需独立产品与科学验证。

完整差异见 04 与 07。每次只补一个有真实需求的闭环，先写能失败的行为检查，再复用现有模块做最小变更。

## 6. 第三个批次：可选钱包

先做链下挑战与身份绑定；保留 `user_id` 与所有权检查。建立域名/网络/nonce/过期校验、绑定/解绑、会话退出和恢复流程。新增登录方式后重新验收游客认领与重复账号。

必要测试：错误域、错误链、过期挑战、重用 nonce、钱包拒签、断线重试、其他用户已绑定的钱包、合约钱包、登录成功但认领失败的恢复。无钱包用户仍可以完成核心探索。

## 7. 第四个批次：可携带成果

定义签名 payload 与明确的受众、用途和期限。用户先预览后分享，验证接口同时检查签名、合同版本、撤销状态、来源是否变化和当前权限。LLM 不持有用户私钥，也不直接构造交易自动广播。

先做文件导出与另一个测试应用验签，证明跨应用真的能读懂限制。若再做链上承诺，测试网验证发送失败、重复请求、等待确认、链重组/最终性、撤销和签发者密钥轮换。只有需要公开状态时才加入链上组件。

## 8. 验收表

| 编号 | 场景 | 必须看到的结果 |
|---|---|---|
| A1 | 游客固定章 -> 注册认领 | 选择完整保存且仅归属本人 |
| A2 | 进行中主题轮刷新/继续 | 回到服务端的同一轮、同一进度 |
| A3 | 反馈与重放 | 原文保留；争议先展示；同 operation 不可换对象 |
| A4 | 动态剧本完成与保存失败 | ready 后可玩；非法路径拒绝；已保存操作不重复生成证据 |
| A5 | 用户只保存记录 | 记录可见；未经本用途授权不送 LLM |
| A6 | 同章/同事多记录 | 不冒充多个已证明独立样本 |
| A7 | 候选/未知/模拟/反驳来源 | 不自动进正式长期结论或有效成果证明 |
| A8 | 报告来源在生成期间撤回 | 重新核验、放弃当前发布或标为失效 |
| A9 | 当前 outbox 无处理器与失败 | 不标记业务成功；能追踪 pending 与失败 |
| A10 | 单周没有可比上周 | 不称稳定/变好/变差；缺失不是零分 |
| A11 | 自愿实验 | 先由用户主动创建；四种 check-in 都只记行动记录 |
| A12 | 删除中存在 worker 任务 | 禁止新入队与写入，活动任务状态如实返回 |
| W1 | 钱包挑战重放 | 原子拒绝已消费/过期/错域挑战 |
| W2 | 钱包绑定与恢复 | 不静默合并账号；退出和解绑不丢记录 |
| W3 | 签名成果篡改 | 签名或承诺验证失败，不能当有效成果 |
| W4 | 来源撤回/到期/更新 | 接收方看到历史或不可用状态 |
| W5 | 公开/私有信息检查 | 公开事务不泄露原文、邮箱、向量和私有 evidence ID |
| W6 | 真实任务与迁移任务 | 单独测能力改善；签名正确不能当效果证明 |

## 9. 当前可复用的检查命令

在源码 app 的依赖和环境已配好后：

```bash
bun run test:core
bun run test:database
bun run test:api
bun run test:web
bun run test:smoke:ci
bun run build:api
NEXT_PUBLIC_API_URL=http://127.0.0.1:3101 bun run build:web
```

真实 API / 数据库 / Redis smoke 与浏览器验收需要运行服务，mock 和静态 CI gate 不替代真实旅程。`verify:evidence-loop` 是聚合检查入口，但其中快速预检脚本不会自行证明所有 E2E。

## 10. 发布门禁

记录新项目自己的仓库、分支、commit、Web/API/worker/数据库/Redis 环境及域名。先测试预发布环境，核实真实邮箱与钱包、新用户旅程、用途撤回、删除/恢复、服务故障与回滚，再决定正式上线。原 EVA 的 Railway/Vercel 配置不是 EVA 的部署授权或配置。

交付证据至少包含：选定 SHA、schema ledger、测试结果、浏览器实际路径、钱包与证明接口行为、失败恢复记录、未通过项。测试数、HTTP 200、job ID、健康检查或交易 hash 单独都不足以证明用户结果已完成。


---

# 来源状态与交付边界

核查日期：2026-10-06。用途：让后续开发者知道哪些是当前事实，哪些是历史目标，哪些仍需验收。

## 1. 本次权威输入

| 来源 | 本次使用方式 |
|---|---|
| 当前本机 Git 分支 `EVA` | 以 HEAD `6a02a10337057bc5cb8cb93b92edc3037995e535` 的代码和依赖作为快照 |
| 当前源码 | 核实功能、接口、授权和真实实现；代码优先于 README 宣传性措辞 |
| `docs/CURRENT-PRODUCT-TRUTH-2026-06-29.md` | 使用其 9/29 IA 愿景和版本边界；历史运行/部署证据未重新在线验证 |
| 当前 `README.md` / `README.zh-CN.md` | 保留使命、原团队与商业专有声明；科技栈与完成状态以 package/代码核对 |
| 9/18 设计和实施计划 | 保留完整历史规格供复用，不能据此称当前主线都完成 |
| 9/25 数据控制设计、9/26 发布计划 | 了解授权/删除与发布门禁；不能当作今日生产状态证明 |
| 钱包与数据隐私官方标准 | 支撑 EVA 方案的协议边界，不表示已集成 |

原始材料位于 `source-reference/eva-current/` 对应相对路径。产品与技术文档引用的源码行号均针对本次快照；之后代码更改可能使行号失效。

## 2. 与上次“12 项完成”结论的关系

本对话上次完成声明对应 `codex/evidence-aware-self-model` 的 `63994b9`，不是此次所见的当前 `EVA` 分支。当前分支包含后续不同实现与整合结果。不能把旧分支的测试、重试设计和源码文件直接搬成当前事实。

本次已确认的差异包括：

| 项目 | 当前可见实现 | 不能据此声称 |
|---|---|---|
| 证据资格 | 9/26 v2 migration；模拟选择等不在正式内容白名单 | 每个游戏选择都是正式人格证据 |
| outbox | 当前 poller 只处理已注册事件；worker 注册 `correction.withdraw_processed` | 9/18 的独立 dispatcher、八次重试/死信和 `evidence.withdrawn` 全链路就在当前主线 |
| 报告 | 当前 claim 查询与持久化前复核模块 | 9/18 API-local policy 文件仍是主实现，或所有长期 claim 已科学校准 |
| 周回看 | 全局和逐条许可的本周 captures，`mood_trend=NULL` | 已完成双周可比 manifest、来源组比较和数值趋势 |
| 自愿实验 | 表、接口和页面逻辑存在 | 本周 worker 已持续产出并保存结构化建议，所有页面刷新/续用都已闭环 |
| 动态剧本 | 10/4 新增持久播放路径与候选证据累积 | 每位用户已通过跨情境科学测量获得准确数字人格 |
| 长期画像 | 资格视图、修订、数据结构与 `unknown` 降级 | 自我模型已经成熟、测量信效度已被证明 |

具体核查结果见 03、04 的代码证据。EVA 应选择当前更完整的鉴权、用途授权、删除与播放实现，再按当前需求补缺口；不能拼接两个分支导致失去最新安全与数据控制。

## 3. 已做的交接包检查

- 从 Git 的确定提交导出源码，未复制未跟踪本地文件。
- 源码清单记录每个文件的 Git blob、字节数和 SHA-256。
- 排除真实 `.env`、Git 元数据、依赖、构建缓存、浏览器/Agent 本地状态、数据库容器与截图。
- 排除 iCloud `... 2.ts` 等重复文件，保留当前 canonical 源文件与迁移。
- 通过已知格式检查私钥/API token 与含密码连接 URL；检查到的文档占位符和人工测试样例做了明确白名单记录。该检查不是完整专业密钥审计。
- 当前迁移排序脚本本次运行通过；源码快照内再次执行相同检查。
- 文档链接、必备入口、包清单与所有文件哈希由交付校验脚本检查。

真实检查结果写入 `verification/DELIVERY-CHECKS.md`。源快照的确切文件数与剔除原因写入 `verification/SOURCE-MANIFEST.json`。

## 4. 本次未验证或未实施

| 项目 | 状态 |
|---|---|
| 当前线上 API / 数据库 / Redis / 邮件 | 本次没有连接生产环境核查 |
| 当前全产品真实浏览器 E2E | 本次未执行；历史本地证据仅作来源材料 |
| 科学准确率与能力提升效果 | 没有新的真实样本或效度/迁移任务验证 |
| 新 EVA 应用代码 | 本次交付源码参考与指南，未实施钱包、链、合约或新发布 |
| Web3 网络、协议和供应商 | 待新项目按用户与集成对象决定 |
| Token、NFT、DAO 与链上市场 | 非本次必要范围，没有被定义为首版必做 |
| 原用户数据迁移 | 没有复制数据库；任何实际迁移需独立授权与用户数据处理方案 |
| EVA 公开发布与第三方分发权 | 本包不改变原项目专有许可，不替团队作出对外发布决定 |

## 5. 技术事实与产品判断分开

“接口存在”说明有开发起点；“聚焦测试通过”只支持那一组行为；“真实本机运行通过”不证明生产环境已准备；“链上验签正确”不证明内容真实；“有效画像有更多数据”不证明人更会判断。

交接后最重要的验证不是再写一份宏大定位，而是选一个具体能力任务、完成闭环，再让独立接收方读懂一份有限、可撤销的成果。


---

# 给下一位开发者或 AI 的任务书

可把下面任务书交给接手 EVA 的开发者。它依赖本包中的实际文档和源码，不依赖原始聊天历史。

## 项目说明

我要建立名为 EVA 的独立项目，产品性质继承 EVA，增加 Web3 身份、授权与成果携带能力。终极目标是人类的 IA：增强人的理解、学习、推理、判断、创造和行动能力。Self OS、自我模型、文字游戏、Agent 与 Web3 是可选机制。

先阅读交接包 README、docs/01–08 和 `verification/SOURCE-MANIFEST.json`。当前源码参考基准是 EVA 分支 `6a02a10337057bc5cb8cb93b92edc3037995e535`；旧 14/16 题、人格类型、9/18 修复分支和历史部署不能当作当前产品事实。

## 本次允许做的第一阶段

1. 在独立目录和独立 Git 仓库建立 EVA，复用 `apps/web`、`apps/api`、`packages/core`、`packages/database` 的必要代码与测试。
2. 明确新项目运行环境，不使用 EVA 真实环境文件、用户数据、数据库或供应商项目。
3. 完成无标签的游客章 -> 注册保存/认领 -> 后续探索 -> 有依据的观察 -> 用户回应 -> 记录/自愿行动闭环。
4. 核查并补齐当前阻碍这个闭环的最小缺口，尤其是用途授权、反馈刷新、候选隔离、动态路径保存、删除与任务恢复。
5. 给出实际运行证据与未通过项。第一阶段通过后再确定钱包网络、跨应用成果合同和公开存证需要。

此任务书是本次交接的建议执行起点；实际执行者仍应听从新任务中的明确范围与目标。不能把本文件当成部署生产、管理第三方账户、花费资金或公开数据的授权。

## 永久产品与工程边界

- 不能恢复 MBTI 式人格标签、八型格、固定数字性格或未经验证的诊断语言。
- 游戏中的选择只说明该模拟情境的选择；用户回忆仍是自述；确认与签名不是外部事实验证。
- 每条观察保留来源、情境、时间、规则版本、支持/反例和限制；没有足够证据时承认未知。
- 保留用户质疑、补充、撤回、导出和删除；不要默默把反驳文案再次当无争议结论。
- 保存授权与每次 AI 读取用途分开；没有当前授权不读原文，不用钱包登录代替隐私同意。
- 同一经历/章的多个节点不能自动变成独立样本；记录复制要保留来源依赖。
- 真实正文与画像向量不默认公开上链；用户必须理解分享字段与不可删除的公开历史。
- 不重写历史迁移，不复用原部署身份，不把 build、job ID 或交易 hash 当用户闭环完成。
- 只做必要改动，复用现有功能，改完验证。两个独立工作流可并行；同文件不得并行写。

## Web3 阶段的实现目标

先提供可选钱包身份与私有、签名成果包。内部用户主键保留 UUID，钱包是验证过的身份绑定。签名必须有域、用途、nonce、到期与当前状态；绑定、解绑、账号恢复和游客认领都要验收。

选 EVM 才使用 SIWE/EIP-712/ERC-1271 相应标准；选其他生态则按该生态的真实标准实现。不要从本包的 EVM 说明推断链已经选定。

证明的语义是：誰声明了什么、用哪个规则与版本、在什么情境范围、当前是否撤销或来源变化。让一个独立测试接收方正确解释这些字段。公开承诺只在实际需要时加入。

## 请交回的结果

每个阶段交付：改动文件、实际验证、用户旅程截图/行为证据、失败恢复、未解决项与下一阶段需要的关键决定。最终提交中标明新项目 SHA 和配置变量名称，不包含真实密钥或私人原文。

不要只回复“可以做”或给空泛规划，也不要为了追求完成率把未验证的功能标为完成。

