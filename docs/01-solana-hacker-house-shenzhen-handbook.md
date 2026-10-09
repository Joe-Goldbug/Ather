# Colosseum 全球黑客松 深圳站（Solana Mini Hacker House 冲刺站）参赛备忘手册

> 来源飞书文档：`https://my.feishu.cn/wiki/CMS7wa31RiZsyJk2PrYcl39bnbc`  
> 归档时间：2026-10-09  
> 参赛项目：**EVA**（AI 认知镜像与算力金库 / AI Agent + Solana Cognitive SBT + DePIN Compute Vault）

---

## 1. 活动基本信息

| 字段 | 详情 |
| :--- | :--- |
| **比赛名称** | **Colosseum 全球黑客松 深圳站（Solana Mini Hacker House 冲刺站）** |
| **活动时间** | **2026.10.09 – 2026.10.11（共 3 天）** |
| **活动地点** | 深圳市南山区南头南达街 21 号 **跳海 Living 青年社区酒店（南头古城）** |
| **每日签到** | **10.09（Day 1 今日）：14:00 签到**<br>10.10（Day 2）与 10.11（Day 3）：每日 10:00 签到 |
| **Demo Day** | **10.11（Day 3）14:00 - 18:00（全体队伍必须参加展示）** |
| **全球提交入口** | **https://colosseum.com/arena/hackathon** |
| **提交截止时间** | **10.11（周日）12:00 中午**（切勿拖到临近截止才首次提交） |
| **参与硬性要求** | 所有入选队伍**必须提交项目并参与 Demo Day**。如无法满足需提前联系小助手。 |

---

## 2. 三日详细日程（重点标出时间节点）

### Day 1（10.09 今日）：开营、破冰、组队与海外分享
- **14:00** 签到入场（跳海 Living）
- **下午** 开场分享与参赛规则讲解
- **下午** 自我介绍、项目介绍（EVA Pitch）与组队
- **21:00** **Helius 英文分享**（Solana RPC 基础设施领头羊）
- **22:00** 桌游破冰与自由交流

### Day 2（10.10 明天）：高强度 Coding 与导师辅导
- **10:00** 签到
- **白天** 现场集中 Coding
- **12:00** 午餐自行安排
- **15:00** **Tiny 熊技术分享**：《Vibe coding at Solana》
- **16:00** 现场继续 Coding
- **17:00** 全场进度汇总与同步
- **20:00** **Mikhail 英文分享**：
  - 《How to choose which product to build & Guidelines on how to pitch better & How to grow and get your first users》

### Day 3（10.11 后天）：冲刺、提交与 Demo Day 决战
- **10:00** 签到
- **11:00** **小龙技术分享**：《从 Preconfirmation 到 Finality：Solana 交易“确定性”的新时间线》
- **12:00** **【硬性截止】Demo 提交截止**（提交至 Colosseum 平台）
- **12:00 - 14:00** 午餐与 Demo 演练准备
- **14:00 - 18:00** **Demo Day 路演评审**（所有队伍轮流上台展示与答辩）
- **18:00** 颁奖、大合照与结营

---

## 3. 开发技术准备要求

### 3.1 链端开发环境（如需部署/修改 Rust 合约）
```bash
# 1. Solana CLI 官方安装
sh -c "$(curl -sSfL https://release.anza.xyz/stable/install)"
solana --version

# 2. Anchor 框架（通过 AVM 管理器）
cargo install --git https://github.com/coral-xyz/anchor avm --locked --force
avm install latest
avm use latest
anchor --version

# 3. 切换 Devnet 与领水（会场水龙头极易被限流，务必提前领好）
solana config set --url devnet
solana-keygen new
solana airdrop 2

# 4. 本地单机离线节点（断网兜底神器）
solana-test-validator
```

### 3.2 前端与 Web3 交互集成（EVA 现状）
- **官方推荐技术栈**：`Next.js + React`（**与 EVA 的 `apps/web` 100% 吻合**）。
- **链上交互库**：`@solana/web3.js`、`@solana/wallet-adapter`（支持 Phantom、Solflare 等一键连接与签名）。
- **RPC 节点推荐**：公共 Devnet 端点容易被全场几百人并发刷爆，推荐在 [Helius](https://www.helius.dev) 注册免费专属 RPC API Key。

---

## 4. 线下实战离线准备（防断网 / 防断电）

1. **依赖预装**：出发前在本地全部跑一遍 `bun install` / `npm install`。
2. **仓库与镜像**：相关 GitHub 仓库全部 clone 到本地，Docker 镜像拉取完毕。
3. **硬件电力**：**自带插线板与多口大功率充电头**（现场插座先到先得）。
4. **备用网络**：开启手机 5G 热点随时作为备用。
5. **本地关键凭证**：测试私钥、离线文档、测试数据保存在本地。
