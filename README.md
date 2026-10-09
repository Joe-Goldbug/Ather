# Eva

## 1. Eva 是什么 / What Is Eva

**中文**：Eva 是一面用于反映人内在真实自我的计算化心智镜像（Computational Mind Mirror）。它不以刻板性格标签定义用户，也不靠虚假奉承取悦用户，而是通过 AI 引导的情境互动，帮助用户理解自己的思考模式，探索其性格特质、人格底色与情绪性情。

**English**: Eva is a computational mind mirror designed to reflect a person’s inner self. Rather than defining users with rigid personality labels or superficial flattery, Eva uses AI-guided situational interactions to help users understand their thinking patterns and explore their character, temperament, and personality traits.

## 2. 如何运作 / How It Works

**中文**：Eva 以沉浸式情境互动取代死板问卷。在压力、摩擦或人际互动中，Eva 观察用户呈现出的惯常应对方式与心理防御姿态，例如直面问题、设立边界、抽离退缩或理性化，再温和地呈现这些情境中的反应模式，供用户理解、补充和纠正。它表达的是基于互动的观察，不是诊断，也不把推断当作不可更改的事实。<br>
**English**: Eva replaces rigid questionnaires with immersive, context-driven interactions. In moments of pressure, friction, or interpersonal exchange, Eva observes habitual coping and defensive patterns in how a user responds—such as confronting an issue, setting boundaries, withdrawing, or intellectualizing—and gently reflects those patterns for the user to review, add context to, or correct. These are interaction-based observations, not diagnoses or unchangeable facts.

## 3. 核心价值 / Key Innovation

**中文**：
- **看见动态的自我**：持续记录用户授权保留的互动与自述，帮助用户回看思考模式、性格特质和情绪性情随时间的变化（You Shifted）。
- **私密记录与自主分享**：私密心智记录和对话原文不公开写入区块链。Web3 方向以密码学可验证凭证支持用户核验选定记录，并由用户自主授权分享。

**English**:
- **See a dynamic self**: With the user’s permission, Eva preserves interactions and self-reports so users can revisit how their thinking patterns, character traits, and temperament change over time (“You Shifted”).
- **Private records and user-authorized sharing**: Private reflections and raw conversations are not published on a blockchain. Eva’s Web3 direction uses cryptographically verifiable credentials to help users verify selected records and share them with their authorization.

> 以上描述项目方向；情境观察和人格性格解读不等同于临床诊断或经验证的心理测量结论。具体功能以实际实现为准。 / This describes Eva’s direction. Situational observations and personality interpretations are not clinical diagnoses or scientifically validated psychological assessments. Available features depend on what has actually been implemented.


## 4. 架构方向：Web2＋Web3 / Architecture: Web2 + Web3

**中文**：Eva 采用渐进式 Web3 架构。情境互动、AI 理解、私密记录与用户纠正由应用及链下服务承载；用户需要导出、独立查验或授权分享时，再选择可验证凭证、钱包绑定及必要的链上功能。用户可直接体验 Eva，钱包不是日常互动的使用前提。

**English**: Eva follows a progressive Web3 architecture. The application and offchain services support situational interactions, AI understanding, private records, and user corrections. Users can opt into verifiable credentials, wallet linking, and relevant onchain features when they need to export, independently verify, or authorize sharing of selected records. A wallet is not required for everyday interaction.

- **私密内容留在链下 / Keep private content offchain**：原始对话、情绪与完整画像不公开写入公链或公共 IPFS；权限、加密与 AI 处理授权需要分别验证。 / Raw conversations, emotions, and complete profiles are not published on public chains or public IPFS. Access control, encryption, and authorization for AI processing require separate validation.
- **凭证验证来源与完整性 / Verify provenance and integrity**：凭证支持查验选定记录的签发者、版本及状态，不证明人格解读或心理结论的准确性。 / Credentials support verification of the issuer, version, and status of selected records; they do not establish the accuracy of personality interpretations or psychological conclusions.
- **首阶段链 / First-stage chain**：已确认使用 **Base**。开发和 Demo 验收使用 **Base Sepolia（chain ID 84532）**；Base 主网须通过合约、安全、隐私、密钥与运行验收后再评估启用。 / **Base** is selected for the first Web3 phase. Development and demo acceptance target **Base Sepolia (chain ID 84532)**; Base mainnet requires contract, security, privacy, key-management, and operational validation.
- **实施顺序 / Implementation sequence**：统一工程环境 → 验证隐私隔离 → 可携带签名凭证 → 可选钱包绑定 → Base Sepolia 真实合约与交易验证。 / Align the engineering environment → validate privacy isolation → portable signed credentials → optional wallet linking → verify a real contract and transactions on Base Sepolia.

> **状态 / Status**：代码已包含 EIP-712 钱包挑战与绑定接口、Ed25519 记录凭证签发/核验，以及 Base 锚定任务框架。当前 Base 默认配置指向 Sepolia；锚定提交仍生成占位交易哈希，没有真实合约广播，不应宣称链上存证已上线。 / The code includes EIP-712 wallet challenges and binding endpoints, Ed25519 record credential issuance/verification, and a Base anchoring job scaffold. The default Base configuration targets Sepolia; anchor submission still returns a placeholder transaction hash and does not broadcast to a real contract. Onchain anchoring is not live.

完整设计、源码审核问题与验收条件见 [Web2＋Web3 架构方案](docs/02-architecture-and-boundary.md)。 / See the [Web2 + Web3 architecture plan](docs/02-architecture-and-boundary.md) for the design, source audit findings, and acceptance criteria.

## 商业项目声明与知识产权归属 | Commercial Project & Ownership Notice

> ### ⚠️ 重要法律与商业声明 / IMPORTANT LEGAL & COMMERCIAL NOTICE
>
> **本项目为严肃商业专有项目，受严格知识产权法律及商业秘密保护。**
> **This repository and its entire codebase represent a proprietary commercial project subject to strict intellectual property protections and commercial confidentiality.**
>
> ---
>
> #### 项目团队与支持 / Team & Project Support
> - **中文**：Eva 目前由 **Ethan 与 Whitepeace 两人**共同推进。两人都在持续为项目作出贡献，项目不对外陈述个人分工。目前没有其他个人或组织参与项目，也没有其他资金或外部资源投入。
> - **English**: Eva is currently developed by **Ethan and Whitepeace**. Both contribute to its ongoing development, and no individual role breakdown is stated publicly. No other people or organizations are involved, and no other funding or external resources have supported the project.
>
> #### 4. 严苛权利保留与侵权追责 / Strict Reservation of Rights & Prohibitions
> - **中文**：本项目**非开源项目**。未经创始团队正式书面明确授权，严禁任何实体或个人以任何形式进行复制、分发、镜像抓取、派生（fork/mirror）、反向工程、衍生开发、商业使用或向第三方披露。创始团队保留追究一切法律责任的权利。
> - **English**: This project is **strictly NOT open-source**. Any unauthorized reproduction, modification, distribution, mirroring, forking, decompilation, reverse engineering, commercial exploitation, or public disclosure, in whole or in part, without prior explicit written authorization from the founding team is strictly prohibited and legally actionable. All rights reserved.

## 项目文档 / Project Documents

- [项目定位 / Project positioning](docs/PROJECT-POSITIONING.md)：当前项目定义。 / The current project definition.
- [IA 与 Web3 探讨 / IA and Web3 discussion](docs/00-eva-ia-web3-discussion.md)：产品方向与技术探索。 / Product direction and technical exploration.
- [链选择 / Chain decision](docs/01-chain-selection.md)：已确认首阶段使用 Base，含网络范围与当前实现状态。 / Base is selected for the first phase, with network scope and implementation status.
- [架构边界 / Architecture boundaries](docs/02-architecture-and-boundary.md)：当前混合架构方向、实施阶段与验收条件。 / Current hybrid architecture direction, implementation stages, and acceptance criteria.
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

## Base 本地技术准备 / Base Local Development Setup

本节记录 Eva 在 Base 上进行合约开发、前端集成和测试网验证所需的本地技术准备。首阶段使用 Base Sepolia；Base 主网配置另行验收后再启用。

### 1. 安装 Foundry / Install Foundry

Foundry 提供 `forge`（构建与测试）、`cast`（读取和发送链上请求）及 `anvil`（本地 EVM 测试节点）。按官方安装说明安装：

```bash
curl -L https://getfoundry.sh/install | bash
foundryup
forge --version
cast --version
anvil --version
```

如果当前终端找不到命令，重新打开终端，或在 zsh 中运行 `source ~/.zshrc`。参见 [Foundry 官方安装说明](https://getfoundry.sh/introduction/installation/)。

### 2. 本地测试：Anvil / Local testing with Anvil

运行本地开发链：

```bash
anvil
```

默认 RPC 地址为 `http://127.0.0.1:8545`，本地 chain ID 为 `31337`。Anvil 提供的预置账户和余额只存在于本地开发链，私钥是公开的测试值，不能用于真实资产或连接公共网络。

Anvil 是本地 EVM 测试节点，不是 Base 网络节点；在上面执行的交易不会广播到 Base。需要测试 Base Sepolia 上已有合约状态时，可通过 RPC 启动本地分叉：

```bash
anvil --fork-url "$BASE_SEPOLIA_RPC_URL" --chain-id 31337
```

分叉启动时需要访问 Base Sepolia RPC；分叉上的写入仍只改变本地测试状态。Base 专有预编译合约只有在确实使用时才需安装 [Base 的 base-anvil 工具](https://docs.base.org/sdks/base-anvil)。

### 3. Base Sepolia 测试网 / Base Sepolia testnet

Eva 首阶段的测试网络为 Base Sepolia，chain ID 为 `84532`；Base 主网 chain ID 为 `8453`。连接真实测试网时，钱包必须切换到 Base Sepolia，部署或发送交易需要该网络的测试 ETH。可从 [Coinbase Developer Platform 测试币水龙头](https://www.coinbase.com/developer-platform/products/faucet)领取；领取额度和资格以水龙头当前规则为准。

测试网资产没有主网价值。开发、演示和测试不得使用主网私钥或真实资金。网络 ID 以 [Base 官方说明](https://docs.base.org/base-chain/api-reference/ethereum-json-rpc-api/eth_chainId)为准。

### 4. Eva 前端与 RPC 配置 / Eva frontend and RPC setup

Eva 使用 Bun workspace。依赖应在相应 workspace 的 `package.json` 中声明，并与根目录锁文件一起提交；从仓库根目录执行 `bun install`。不要在现场临时安装一套与仓库清单不一致的依赖。

钱包连接采用 `wagmi`、`viem` 与 `@tanstack/react-query`。Base 当前文档说明 OnchainKit 已停止维护，并提供迁移到 wagmi/viem 的指引，因此本准备清单不要求安装 `@coinbase/onchainkit`。[Base 迁移说明](https://docs.base.org/onchainkit/wallet/wallet-dropdown-disconnect)

共享测试或部署环境建议使用专属 Base Sepolia RPC 地址。将 RPC 地址或密钥保存在本机未提交的环境变量文件中；不要把私钥、助记词或 RPC 密钥提交到 GitHub。公共 RPC 可能有限流或可用性限制。

### 5. 准备完成的检查 / Readiness checks

- `forge --version`、`cast --version` 和 `anvil --version` 均能输出版本。
- `anvil` 启动后，本地应用可连接 `http://127.0.0.1:8545`，并明确显示为本地测试网络。
- 连接 Base Sepolia 时，钱包和 RPC 都报告 chain ID `84532`；本地 Anvil 与 Base Sepolia 不混用。
- 测试网交易使用 Base Sepolia 测试 ETH；没有把本地 Anvil 测试账户当作真实钱包。
- 智能合约目录建立后，再运行该目录对应的 `forge build` 和 `forge test`；合约测试通过不代表已经部署或写入 Base。

## 记录与隐私 / Records and Privacy

认知记录由用户自主授权分享；可验证凭证不等同于人格结论或心理诊断已获验证。原始私密内容不应默认公开上链。 / Users authorize sharing of their cognitive records. Verifiable credentials do not validate personality conclusions or psychological diagnoses. Private source content should not be public on-chain by default.

## 知识产权与版权许可 | License & Copyright

**商业专有与保密，未授予许可。 / PROPRIETARY & CONFIDENTIAL. UNLICENSED.**
版权所有 © 2026 Ethan & Whitepeace，保留所有权利。 / Copyright © 2026 Ethan & Whitepeace. All Rights Reserved.

- **商业专有项目**：未授予任何公开使用、修改或分发许可。未经创始团队正式书面许可，严禁以任何方式使用、复制、分发或反向编译。
- **Commercial & Proprietary**: No public license is granted. Unauthorized use, copying, reproduction, distribution, or decompilation is strictly prohibited.


