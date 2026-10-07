# Eva

**中文**：Eva 是一个增强人类智能（IA）的平台，通过 AI 引导的互动体验，帮助用户理解自己的思考模式、了解用户自身人格性格，其 Web3 方向通过可验证凭证与用户自主授权分享，让用户更好地掌控自己的认知记录。

**English**: Eva is an intelligence augmentation (IA) platform that uses AI-guided interactive experiences to help users understand their thinking patterns and explore their personality traits. Its Web3 direction uses verifiable credentials and user-authorized sharing to give users greater control over their cognitive records.

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

## 项目文档 / Project Documents

- [项目定位 / Project positioning](docs/PROJECT-POSITIONING.md)：当前项目定义。 / The current project definition.
- [IA 与 Web3 探讨 / IA and Web3 discussion](docs/00-eva-ia-web3-discussion.md)：产品方向与技术探索。 / Product direction and technical exploration.
- [公链选型 / Chain evaluation](docs/01-chain-selection.md)：基础设施候选方案。 / Infrastructure candidates.
- [架构边界 / Architecture boundaries](docs/02-architecture-and-boundary.md)：Web2 与 Web3 分工研究。 / Research into Web2 and Web3 responsibilities.
- [MVP 探索 / MVP exploration](docs/03-v1-mvp-spec.md)：早期功能方案，以当前项目定位为准。 / Earlier feature proposals, subject to the current project positioning.
- [行业参考 / Industry references](docs/04-industry-insights-and-pitfalls.md)：行业案例与待验证事项。 / Industry examples and open validation questions.

## 代码结构 / Code Structure

| 目录 / Directory | 用途 / Purpose |
|---|---|
| `packages/core` | 领域类型、题库与核心逻辑。 / Domain types, question banks, and core logic. |
| `packages/database` | 数据库结构与迁移。 / Database schema and migrations. |
| `apps/api` | 后端 API。 / Backend API. |
| `apps/web` | 用户界面与国际化内容。 / User interface and localized content. |
| `apps/admin` | 管理界面。 / Administration interface. |
| `docs` | 产品与技术文档。 / Product and technical documentation. |
| `scripts` | 构建、迁移及验证工具。 / Build, migration, and verification tools. |

## 构建与开发 / Build and Development

```bash
# 安装依赖 / Install dependencies
bun install
# 构建核心、API 与 Web / Build core, API, and web
bun run build:core
bun run build:api
bun run build:web
# 核心测试 / Core tests
bun run test:core
# API 开发服务 / API development server
bun run dev:api
# Web 开发服务 / Web development server
bun run dev:web
```

环境配置请参考 `.env.example`；测试说明见 `TESTING.md`。 / Refer to `.env.example` for environment configuration and `TESTING.md` for testing instructions.

## 记录与隐私 / Records and Privacy

认知记录由用户自主授权分享；可验证凭证不等同于人格结论或心理诊断已获验证。原始私密内容不应默认公开上链。 / Users authorize sharing of their cognitive records. Verifiable credentials do not validate personality conclusions or psychological diagnoses. Private source content should not be public on-chain by default.

## 知识产权与版权许可 | License & Copyright

**商业专有与保密，未授予许可。 / PROPRIETARY & CONFIDENTIAL. UNLICENSED.**
版权所有 © 2026 Ethan & Whitepeace，保留所有权利。 / Copyright © 2026 Ethan & Whitepeace. All Rights Reserved.

- **商业专有项目**：未授予任何公开使用、修改或分发许可。未经创始团队正式书面许可，严禁以任何方式使用、复制、分发或反向编译。
- **Commercial & Proprietary**: No public license is granted. Unauthorized use, copying, reproduction, distribution, or decompilation is strictly prohibited.


