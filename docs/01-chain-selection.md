# Eva Web3 基础设施选型：公链深度评估报告

> 当前项目定义见 [项目定位](PROJECT-POSITIONING.md)。下文为早期技术探索，不作为当前产品定位或已批准功能范围。 / See [project positioning](PROJECT-POSITIONING.md) for the current definition. The material below is earlier technical exploration, not current positioning or an approved feature scope.

> **项目**：Eva Web3  
> **编制日期**：2026-10-05  
> **适用范围**：Eva V1 最小可行 Demo (MVP) 及长期网络演进

---

## 1. 选型维度与评分模型

Eva 作为一个面向人类认知探索、心智建模与智能体（Agent）协作的系统，公链选型围绕以下 5 个核心维度进行严格权衡：

1. **EVM 等价性与开发上线速度（权重 25%）**：是否能无缝使用业界最成熟的 Web3 库（TypeScript、Viem、Wagmi、OpenZeppelin），极大缩短试错与上线周期。
2. **Web2 级无感门槛（账户抽象与 UX）（权重 25%）**：是否原生支持 Passkey（Face ID / Touch ID 免私钥助记词）、是否支持 Paymaster 零 Gas 代付。
3. **RWA 与机构合规生态成熟度（权重 25%）**：法币合规出入金、底层国债/生息稳定币（Circle USDC、Ondo USDY、BlackRock BUIDL 等）的流动性深度与合规接口。
4. **交互成本与确定性（权重 15%）**：单笔交易费是否低于 $0.01，确认延迟是否小于 2 秒。
5. **生态与产品调性契合度（权重 10%）**：偏向真实用户消费级应用、身份凭证与认知探索，而非高频投机赌博。

---

## 2. 候选公链全景横向对比

| 候选公链 | EVM 等价 | Demo 开发周期 | 用户上手门槛 (UX) | RWA 合规生态 | 单笔成本 (Gas) | 综合评级 |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Base** | ✅ 原生等价 | ⚡ 3~5 天 | ⭐⭐⭐⭐⭐ (Passkey 原生) | 🟢 极强 (Coinbase 全面背书) | ~$0.003 | **★★★★★ (首选推荐)** |
| **Arbitrum One** | ✅ 原生等价 | ⚡ 3~5 天 | ⭐⭐⭐⭐ (成熟钱包接入) | 🟢 强 (DeFi 深度第一) | ~$0.01 | **★★★★☆ (次选方案)** |
| **Solana** | ❌ (Rust/Anchor) | ⏱️ 2~3 周 | ⭐⭐⭐⭐ (TipLink/Phantom) | 🟡 快速增长 (Token-2022) | ~$0.001 | **★★★☆☆ (阶段备选)** |
| **Ethereum L1** | ✅ 原生 | ⚡ 3~5 天 | ⭐ (Gas 昂贵，无法代付) | 🟢 机构 TVL 第一 | $5.00~$30.00+ | **★☆☆☆☆ (绝对不宜用于 Demo)** |
| **Robinhood Chain** | ⚠️ 部分开放 | ⏳ 不可控 (生态封闭) | ❓ 依赖特定客户端入口 | 🟡 强机构预期但封闭 | 未知 | **★☆☆☆☆ (不宜作为自研基础)** |
| **Hyperliquid** | ⚠️ HyperEVM | ⏳ 1~2 周 | ⭐⭐⭐ (交易员偏向) | 🔴 弱 (核心是永续合约) | ~$0.002 | **★☆☆☆☆ (产品场景严重错配)** |
| **Tempo** | ❌ 专用/小众 | ⏳ 周期漫长 | ❓ 基建不完备 | 🔴 几乎无公开成熟 RWA | 未知 | **★☆☆☆☆ (试错成本过高)** |

---

## 3. 为什么 Eva 首选 Base？（三大核心胜出理由）

### (1) 极致的开发效率与零技术栈沉没成本
* Eva 无论是前端还是后端，都能以标准 TypeScript 生态无缝对接 Base。
* 不需要为了写合约重学 Rust/Anchor（Solana），避免踩 PDA/ATA 等非 EVM 账户模型的坑。现成的开源模板库和安全审计工具（OpenZeppelin, Foundry, Hardhat）可在数天内跑通。

### (2) 真正的 Web2 级“隐形钱包”体验
* **Coinbase Smart Wallet 原生集成**：依托 Base 的 ERC-4337 账户抽象体系，用户可直接使用手机或电脑自带的 **Passkey（Face ID / 指纹）** 生成链上账户，彻底告别 12 个助记词。
* **Paymaster 官方代付**：Eva 可以直接为用户代付上链防伪凭证所需的 Gas 费（单笔仅需 $0.002 ~ $0.005），用户完成认知探索后点击“生成链上防伪凭证”，体验和在 Web2 点“保存报告”一样流畅。

### (3) RWA 资产端与合规通道的天然高地
* Base 背后的 Coinbase 是美股上市公司，也是 Circle (USDC) 的核心合作伙伴与美国现货 ETF 的主要托管机构。
* 全球主要的合规收益型 RWA 资产（如 Ondo 旗下的短期美债资产 **USDY**、Superstate、贝莱德 BUIDL 跨链拓展）均首批支持 Base 原生流动性。Eva 接入此类资产不存在跨链合规与桥接安全风险。

---

## 4. 阶段演进路线

1. **阶段 1（V1 Demo）**：
   * 采用 **Base Sepolia 测试网** -> **Base 主网**。
   * 专注于跑通“SBT 凭证签发 + RWA 储蓄金库调优”。
2. **阶段 2（生态扩展期）**：
   * 若后续需要打通更高并发的社交/微支付场景，或与 Solana 生态的项目（如 Vana、Itheum）进行数据跨链互通，可基于跨链协议（如 Wormhole/LayerZero）将凭证哈希广播至 Solana 或 Arbitrum。
