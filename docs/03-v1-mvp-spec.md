# Eva Web3 V1 MVP 功能规格说明书

> 当前项目定义见 [项目定位](PROJECT-POSITIONING.md)。下文为早期技术探索，不作为当前产品定位或已批准功能范围。 / See [project positioning](PROJECT-POSITIONING.md) for the current definition. The material below is earlier technical exploration, not current positioning or an approved feature scope.

> **历史方案已被更新（2026-10-09）**：当前架构与第一版实施顺序以 [Web2＋Web3 架构方案](02-architecture-and-boundary.md) 为准。下文的 RWA 金库、保本／固定收益、永久免费算力、公开性格指标、默认 SBT 与强制钱包接入均是早期探索，不属于当前第一版范围，也不是已验证能力或对用户的承诺。 / **Superseded historical proposal (2026-10-09)**: The [Web2 + Web3 architecture plan](02-architecture-and-boundary.md) defines the current direction and implementation sequence. The vault, principal/yield guarantees, permanently free compute, public personality metrics, default SBTs, and mandatory wallet integration below are earlier proposals, not current V1 scope, verified capabilities, or user commitments.

> **设计原则**：必须有理有据，真实有效，给用户带来立竿见影的直接利益。

---

## 1. V1 核心功能概览

Eva Web3 V1 坚决砍掉一切伪需求（不发治理代币、不做虚拟地皮、不做空气流动性挖矿），仅聚焦于解决用户的两个根本诉求：
1. **经济利益诉求**：使用高阶 AI 认知分析很贵，如何免去按月续费？
2. **主权与信誉诉求**：如何让我的心智分析成果真正属于我，并能在现实中获得认可？

基于此，V1 确立 **两大核心功能模块**：

---

## 2. 功能一：RWA“零损耗心智算力基金”（Compute Vault）

### (1) 用户真实利益（Why this matters）
* **现状痛点**：传统 Web2 AI 产品（如 ChatGPT Plus、各类心理/认知平台）均采用订阅制（每月 $20）。对于用户而言，这属于“纯消费型沉没成本”。一旦停止续费，特权立即中断。
* **Web3 RWA 创新利益**：
  * **本金 100% 属于用户**：随时可原路提现，平台无法挪用。
  * **真实世界收益（Real Yield）折抵算力**：用户质押 200 ~ 500 USDC 购买合规美债资产（如 Ondo USDY），年化 ~5% 的无风险底层国债利息，由智能合约每日自动换算为 Eva 内部的“高阶 AI 算力额度”。
  * **心理与财务闭环**：“用现实世界的钱袋子赚利息，为自己心智的终身成长买单”。

### (2) 交互链路与流程
1. 用户在结算页或个人主页点击 **【开启心智成长基金】**。
2. 调起 Coinbase Smart Wallet，存入 USDC（合约内部直接 mint 或路由至 USDY 等生息代币）。
3. 合约记录用户的存入份额 `shares`。
4. 后端监听 Base 链上利息结算事件，实时为用户的账户追加 `compute_tokens` 额度。
5. 当用户发起高级剧情定制或深度多轮心智对谈时，扣除该算力额度。
6. 用户随时可点击 **【全额取回本金】**，智能合约即时返还 USDC，算力恢复为普通游客额度。

---

## 3. 功能二：认知证据链防伪凭证（Cognitive Attestation SBT）

### (1) 用户真实利益（Why this matters）
* **现状痛点**：用户在 Web2 平台做完测评后，只得到一张静态的网页截图。截图容易被 P 图伪造，且平台一旦停运，数据灰飞烟灭；此外，用户在求职或社交时想证明自己具有“高抗压性/系统思考力”，不得不提供完整的聊天记录，极易泄露内心深处的脆弱与隐私。
* **Web3 创新利益**：
  * **不可篡改防伪**：Eva 作为签发方，将经过多轮证据链验证的心理指标与状态指纹签名上链。
  * **零知识/选择性证明**：用户向第三方出示链上凭证，对方仅凭链上签名即可 100% 确认真实性，而用户无需交出任何私密对话。
  * **永久属于用户**：铸造成 SBT（Soulbound Token），永久记录在用户的链上身份中。

### (2) 交互链路与流程
1. 用户完成一段完整的剧情章节或深度主题测评。
2. 系统在后台生成完整的证据链，并计算出状态根哈希 `evidenceRootHash = keccak256(...)`。
3. 结算页面展示：**【生成我的链上防伪认知凭证】**。
4. 用户使用指纹/Face ID（Passkey）确认，**Eva 官方 Paymaster 代付 Gas**。
5. 合约签发一枚包含哈希与脱敏维度的不可转让凭证（SBT），前端展示赛博朋克/心智风格的“加密认知晶体”。

---

## 4. Web2 / Web3 混合接入与无感体验规范

* **免助记词**：强制采用 `@coinbase/onchainkit` / `wagmi` 提供的 Passkey 智能钱包，全程无需让用户抄写 12 个助记词。
* **Gas 赞助预算控制**：
  * SBT 凭证铸造单笔 Gas < $0.005，由 Eva 赞助池每日设置上限（如前 10,000 名用户完全免费）。
* **渐进式引导**：
  * 用户前序体验 100% 保持原有 Web2 游客状态，不弹钱包窗口；仅在测试完成想要“固化资产”或“开启理财抵扣”时才轻量唤起。
