# Eva (Eva-web3)

> **项目仓库 / Repository**：[https://github.com/EthanLau1/Eva-web3](https://github.com/EthanLau1/Eva-web3)  
> **核心定位 / Core Positioning**：IA（Intelligence Augmentation，增强人类智能）与 Web3 自主认知凭证平台。

## 商业项目声明与知识产权归属 | Commercial Project & Ownership Notice

> ### ⚠️ 重要法律与商业声明 / IMPORTANT LEGAL & COMMERCIAL NOTICE
>
> **本项目为严肃商业专有项目，受严格知识产权法律及商业秘密保护。**  
> **This repository and its entire codebase represent a proprietary commercial project subject to strict intellectual property protections and commercial confidentiality.**
>
> ---
>
> #### 1. 创始团队与排他性所有权 / Founding Team & Exclusive Ownership
> - **中文**：本项目由创始团队 **Ethan** 与 **Whitepeace** 两人共同创立，享有对本项目全部资产与权益的唯一、完全且排他的所有权。
> - **English**: This project was founded and is exclusively owned by its two co-founders: **Ethan** and **Whitepeace**. They hold sole and full ownership over all project assets and rights.
>
> #### 2. 团队协作与分工声明 / Executive Structure & Division of Labor
> - **中文**：创始团队实行整体共治，对外**不陈述亦不拆分个人具体分工**。
> - **English**: The founding team operates under joint executive responsibility; **no breakdown of individual internal division of labor, specific roles, or departmental assignments is represented or disclosed**.
>
> #### 3. 独立创作与排他性（无任何第三方参与）/ Sole Authorship & Strict Exclusivity
> - **中文**：本项目的全部构想、业务逻辑、系统架构、算法设计、工程代码、交互界面、技术文档及衍生知识产权，**完全且仅由创始团队 Ethan 与 Whitepeace 两人独立设计、研发与构建**。**截至目前，不存在任何其他个人、机构、顾问、外包团队或第三方实体参与过本项目的构想、开发或设计，没有任何第三方做出过任何形式的贡献，亦无任何第三方对本项目享有任何权利、主张或权益**。
> - **English**: All strategic concepts, business logic, system architectures, algorithmic models, software codebases, interfaces, technical documentation, and derivative intellectual properties were created and engineered **solely and exclusively by the founding team (Ethan & Whitepeace)**. **To date, no other individuals, external entities, consultants, contractors, agencies, or third parties have ever participated in, contributed to, or held any interest, claim, or title in this project or codebase**.
>
> #### 4. 严苛权利保留与侵权追责 / Strict Reservation of Rights & Prohibitions
> - **中文**：本项目**非开源项目**。未经创始团队正式书面明确授权，严禁任何实体或个人以任何形式进行复制、分发、镜像抓取、派生（fork/mirror）、反向工程、衍生开发、商业使用或向第三方披露。创始团队保留追究一切法律责任的权利。
> - **English**: This project is **strictly NOT open-source**. Any unauthorized reproduction, modification, distribution, mirroring, forking, decompilation, reverse engineering, commercial exploitation, or public disclosure, in whole or in part, without prior explicit written authorization from the founding team is strictly prohibited and legally actionable. All rights reserved.

## 架构与设计规范 (Docs)

本项目关于 IA 目标、Web2/Web3 边界、公链选型与 V1 MVP 规划的设计文档已归档于 `docs/`：

- [00-eva-ia-web3-discussion.md](docs/00-eva-ia-web3-discussion.md)：Eva IA 与 Web3 首个 Demo 讨论总纲
- [01-chain-selection.md](docs/01-chain-selection.md)：基础设施选型评估（首选 Base 链）
- [02-architecture-and-boundary.md](docs/02-architecture-and-boundary.md)：Web2 / Web3 边界架构与系统设计
- [03-v1-mvp-spec.md](docs/03-v1-mvp-spec.md)：V1 MVP 功能规格说明书（RWA 算力基金 + 认知凭证 SBT）
- [04-industry-insights-and-pitfalls.md](docs/04-industry-insights-and-pitfalls.md)：行业案例借鉴与避坑指南

---

## What this repository is

A closed loop: read the whitepaper → play the first chapter → get a result.
No login, no session, no database, no LLM, no queue.

```
GET  /v1/story/guest-opening          → new run + shuffled options
POST /v1/story/guest-opening/complete → scored result + claim token
```

Both endpoints are public by design. The whole service is pure in-memory
computation, which is why it needs no auth layer and no RLS.

## Layout

| Path | What |
|---|---|
| `packages/core/src/assessment/theme-round.ts` | Theme question bank and scoring |
| `packages/core/src/assessment/guest-episode.ts` | Episode 1 question bank (6 nodes × 4 options) |
| `packages/core/src/shared/` | Locale types (used by web i18n) |
| `apps/api/src/modules/theme-assessment/` | The two anonymous endpoints |
| `apps/web/app/whitepaper/` | Whitepaper viewer with full-text search |
| `apps/web/app/play/` | The assessment page |
| `apps/web/messages/` | zh-CN / en / ja / es bundles |

## Layout system

The visual identity comes from three pieces that must stay in sync with the
original. All three are aligned with the upstream baseline design system:

| File | What it provides |
|---|---|
| `app/layout.tsx` | Loads four Google fonts (Inter, Space Grotesk, Share Tech Mono, Caveat) and injects the `--font-*` CSS variables, plus the hand-drawn border SVG filters |
| `app/providers.tsx` + `app/providers-impl.tsx` | SSR locale from cookie, translation lookup with `{key}` interpolation, cookie persistence |
| `components/PageShell.tsx` + `TopBar.tsx` + `GlobalLanguageSwitcher.tsx` | The 60px top bar and language switcher |
| `app/globals.css` | The entire design system |

`globals.css` references `--font-display`, `--font-sans`, `--font-mono` and
`--font-handwriting`. Those variables are only defined by the font loaders in
`layout.tsx` — drop or rewrite that file and every heading silently falls back
to a system font, which changes the whole page's appearance.

The landing hero uses `container` / `hero` / `hero-brand` / `hero-coming-soon`,
and the single entry point uses `.hero-cta` inside `.cta-group`. Both classes
already exist in `globals.css` (a second `.hero-cta` rule at the end of the file
overrides the first — it applies the hand-drawn border, the `sketch-wobble` SVG
displacement filter, and the white-on-hover pill treatment).

Do not reuse `.choices` for landing-page buttons: `.choices button` forces
`width: 100%` and `text-align: left`, which is correct for answer options but
renders as a heavy full-width stack on a landing page.

The whitepaper is reachable from the top bar only; the landing page deliberately
does not repeat it.

## Run it

```bash
npm install
npm run build:core

# terminal 1 — API on :3001
node apps/api/dist/main.js

# terminal 2 — web on :3000
cd apps/web && NEXT_PUBLIC_API_URL=http://127.0.0.1:3001 npx next start
```

Then open http://localhost:3000. No database, no `.env` required in development.

Production needs one variable:

```bash
GUEST_CLAIM_SECRET=...   # HMAC key for the claim token
```

## Tests

```bash
# terminal 1 + 2 running, then:
npm run test:e2e
```

The e2e script drives a real browser through the whole loop: home → adult gate →
six decision nodes → result → whitepaper search. Set `E2E_WEB_URL` to target a
different host, or `CHROME_PATH` if Playwright has no bundled Chromium.

## How the anti-memorisation works

Every `GET /guest-opening` mints a fresh `guest_run_id`. Options are then sorted
by `sha256(guest_run_id:node_id:option_id)`, so the order is:

- **stable within a run** — a refresh mid-chapter never reorders under you
- **different across runs** — you cannot memorise "always pick A"

## 核心体系与产品架构 (Architecture & Capabilities)

Eva 是一个以增强人类智能（IA，Intelligence Augmentation）为终极目标的个人认知系统与 Web3 自主凭证平台：

1. **赛道与产品定位**：
   - **核心赛道**：`AI Platforms / Agents`（AI 智能体与推理平台，帮助人理解问题、检验假设、制定行动）。
   - **产品形态**：`Consumer Apps`（面向个人的日常应用，融入真实生活）。
   - **Web3 支撑**：`Identity & Privacy`（去中心化身份、可撤销授权、链下验签与选择性披露）。

2. **创新经济模型：Compute Vault (美债 RWA 算力金库)**：
   - 用户在智能合约存入 USDC（如 $500 USDC）。
   - 合约自动申购链上合规美债 RWA（如 Ondo USDY，年化 ~5%）。
   - 年化产生的利息收益自动转换为 Eva 的 AI 对话与高级推理算力额度。
   - 用户“零成本”持续使用 Eva，且在任何时候均可 100% 全额赎回本金，实现“无损使用，零沉没成本”。

3. **五环认知飞轮 (The 5-Loop Engine)**：
   - **Play (情境探索)**：固定第一章《雨停之前》+ 主题决策轮 + 动态微沙盒推演。
   - **Record (现实自述)**：现实决策与情绪瞬间记录（Captures 原文）。
   - **Observe (有限观察)**：有来源、有情境、有边界的模式揭穿与观察（绝不贴固定人格标签）。
   - **Correct (用户纠偏)**：用户拥有一票否决权（确认、部分符合、反驳、补充、撤回）。
   - **Action (现实行动)**：发起现实生活小实验，闭环复盘。

## Monorepo 模块布局

| 目录 | 职责与技术栈 |
|---|---|
| `packages/core` | 领域契约、证据准入 v2、题库、剧本引擎与国际化算法 (Bun / TypeScript) |
| `packages/database` | PostgreSQL 核心 Schema、35+ 迁移版本与 RLS 权限治理 |
| `apps/api` | NestJS 10 后端服务、认证、主题评估、微沙盒生成与队列接口 |
| `apps/web` | Next.js 14/16 前端用户界面、Play、白皮书、主题测试与多语言 |
| `docs/` | 完整的技术方案、公链选型、MVP 规程与桌面交接文档 (`docs/handover/`) |
| `scripts/` | 自动化迁移、冒烟自检、合规验证与同步脚本 |

## 快速构建与验证 (Build & Test)

```bash
# 安装依赖
bun install

# 构建所有工作区包
bun run build:core
bun run build:api
bun run build:web

# 一键全局构建
bun run build

# 运行测试
bun run test:core     # Core 领域算法与契约单测 (378 项测试)
bun run dev:api       # 启动开发 API 服务 (:3101)
bun run dev:web       # 启动开发前端服务 (:3000)
```

## 权限与数据边界原则

- **无固定人格标签**：不输出 MBTI 式永久人格分类或心理学诊断。
- **模拟与自述隔离**：游戏选择标记为 `simulation_choice`，用户回忆标记为自述，不冒充外部核验证据。
- **用户裁决权优先**：用户随时可反驳、撤回、导出及删除数据。
- **隐私保护**：未获明确授权不读取原文，真实数据与向量不默认公开上链。

## 知识产权与版权许可 | License & Copyright

**PROPRIETARY & CONFIDENTIAL. UNLICENSED.**  
Copyright © 2026 Ethan & Whitepeace. All Rights Reserved.  

- **商业专有项目**：未授予任何公开使用、修改或分发许可。未经创始团队正式书面许可，严禁以任何方式使用、复制、分发或反向编译。
- **Commercial & Proprietary**: No public license is granted. Unauthorized use, copying, reproduction, distribution, or decompilation is strictly prohibited.


