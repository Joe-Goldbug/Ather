# Science-References 下一步完善计划

> 记录时间：2026-04-25
> 优先级：从高到低排列

---

## 第一优先：跑起来第一个验证实验

**目标**：让 EVA 从"有科学理论"变成"有自己的实验数据"

**任务清单**：
- [ ] 下载 OpenPsychometrics 的 BFI 或 IPIP 数据集（CSV）
- [ ] 设计 20-30 题的初步 EVA 对话流程（冷启动版）
- [ ] 招募 50-100 名内测用户完成：①Ather 对话 ②BFI-10 量表
- [ ] 计算 EVA 推断维度与 BFI-10 分数的相关系数 r
- [ ] 目标：r ≥ 0.40 可以对外宣称初步并发效度

**参考文件**：`08-Ather科学盲点与实验路线图.md` → 实验 1（Concurrent Validity）

---

## 第二优先：补充"对话科学"这个最大的文献空白

**问题**：science-references 目前覆盖人格/认知/临床/社会/神经/测量/纵向，唯独缺少"对话本身的科学机制"。

**需要新建的文件**：`10-对话科学与动机式访谈.md`

**应该覆盖的内容**：
- 动机式访谈（Motivational Interviewing, Miller & Rollnick）
- 共情准确性（Empathic Accuracy, Ickes 1993）
- 提问质量与开放式追问增益（Socratic questioning, CBT 领域）
- 治疗联盟破裂与修复（Rupture & Repair, Safran & Muran）
- 对话分析（Conversation Analysis）在心理健康干预中的应用

---

## 第三优先：下载 5 篇基准论文（本地 PDF）

不需要大量下载，只要这几篇留在本地作为不可反驳的权威底牌：

| 论文 | 来源 | 优先级 |
|---|---|---|
| Youyou, Kosinski & Stillwell (2015, PNAS) | Semantic Scholar 免费 | ★★★ |
| DeYoung et al. (2010) 大五神经基础 | Semantic Scholar 免费 | ★★★ |
| Gross (1998) 情绪调节 | Sci-Hub / Google Scholar | ★★★ |
| Jacobson & Truax (1991) RCI 方法论 | Semantic Scholar 免费 | ★★ |
| Onnela & Rauch (2016) 数字表型 | Semantic Scholar 免费 | ★★ |

---

## 第四优先：补充"安全与分流"科学边界文件

**问题**：EVA 不做临床诊断，但没有清晰科学边界等于随时踩红线。

**需要新建的文件**：`11-安全边界与危机分流科学.md`

**应该覆盖的内容**：
- 危机干预等级划分（如 Columbia Suicide Severity Rating Scale, C-SSRS）
- LLM 安全评估方法论（Woebot 等 AI 产品的安全设计范式）
- 心理援助转介触发条件（什么情况 EVA 必须停止并转介）
- AI 在高危情境的响应边界（APA 与 NICE 的行业标准）

---

## 第五优先：补充"人机信任与解释性"研究

**需要新建的文件**：`12-人机信任、解释性与校准.md`

**应该覆盖的内容**：
- Automation bias（自动化偏见）：用户会盲目相信 AI 判断
- Algorithmic Aversion（算法厌恶）：某些人群反而抗拒 AI 解释
- Explainability vs Interpretability 的实践区别
- Calibrated Uncertainty（置信度校准）：AI 系统该在什么时候表达不确定
- 相关实验：explanation A/B 测试（已规划于实验 6）

---

## 数据集下载待办（可操作）

| 数据集 | 地址 | 说明 |
|---|---|---|
| OpenPsychometrics BFI/IPIP | https://openpsychometrics.org/_rawdata/ | 下载 CSV，约 1M 条 |
| StudentLife EMA | https://studentlife.cs.dartmouth.edu/ | 申请下载，约 10 周纵向数据 |
| OSF 复现数据 | https://osf.io/ezcuj/ | 可直接下载原始数据与分析代码 |

---

## 总结优先级

```
1. 跑起来实验 1（Concurrent Validity）
2. 新建 10-对话科学文件
3. 下载 5 篇基准 PDF
4. 新建 11-安全边界文件
5. 新建 12-人机信任文件
6. 下载上述 3 个数据集
```

**当前最关键的行动**：招募内测用户 + 数据集下载，而不是继续写文档。
