// apps/web/app/whitepaper/page.tsx
// Whitepaper viewer with full-text search and section navigation.

'use client';

import './whitepaper.css';
import { useState, useMemo, useCallback, useRef } from 'react';
import { Search, X, ArrowUp, ArrowDown } from 'lucide-react';
import { useLocale } from '@/app/providers-impl';
import type { Locale } from '@/lib/i18n';

// ── Whitepaper content (embedded at build time) ─────────────────────────────
// Source: docs/Ather_内部总纲白皮书_2026-04-25.md
const WHITEPAPER_MD = `# Ather 内部纲领

> 历史归档说明（2026-06-29）：
> 本文写于 Ather 仍把“长期记忆 + 结构化对话 + 持续陪伴式 chat”当作主产品定义的阶段。
> 当前正式产品已收敛为 \`14 题基线测评 -> 画像 -> 现实记录 -> 单题测试 -> 用户纠正\`。
> 本文仅保留作早期定位演化参考，不作为当前产品、页面、部署或研发口径。

内部版本 v1.0
日期：2026-04-25

---

## 1. 这份白皮书的目的

**统一 Ather 内部对项目现阶段的最新陈述。**



---

## 2. Ather 的最新定义


**Ather 是一个以长期记忆、结构化对话、日常追踪和变化检测为核心的“计算化自我探索系统”，目标是成为最懂用户的 AI 伴侣。**

它是一个持续更新的自我模型。


它更接近：

**帮助人类持续看见自己、理解自己。**

这也是 Ather 能从“产品”走向 “IA，Intelligence Amplification” 的起点。

---

## 3. Ather 不是什么

为了避免项目跑偏，内部必须先统一非目标。

### 3.1 Ather 不是临床诊断系统

Ather 不做疾病诊断，不给出医学结论，不替代心理医生，不声称提供治疗。

### 3.2 Ather 不是伪科学人格标签机

Ather 的核心不是给用户贴一个固定标签，也不是用单次测试永久定义一个人。

Ather 不应该把底层模型建立在僵硬类型学上，更不应该通过强结论制造“被说中”的错觉。

### 3.3 Ather 不是泛聊天机器人

Ather 的 chat 不是陪聊，不是情绪陪伴式闲聊，也不是任意问答。

Ather 的对话必须服务于三个目标：
- 形成更高质量的个人理解
- 发现矛盾、不确定性、变化点
- 生成能被回溯和修正的证据

### 3.4 Ather 不是靠机构牌照才能成立的项目

机构合作很重要，但不是 Ather 成立的前提。

Ather 的第一性成立条件不是“有没有教授背书”，而是：

- 用户是否真的感到被理解
- 长期数据是否能证明系统在变准

---

## 4. Ather 的核心价值结构

Ather 当前已经比较清晰地形成了四层价值结构。

### 4.1 第一层：入口价值

**生活场景短测 / 第一层剧本** 负责降低进入门槛。

它的作用不是完成测量，而是让用户快速进入一种“这个系统开始理解我”的状态。

### 4.2 第二层：关系价值

**结构化对话** 负责把“一次测试”转化成“持续关系”。

关键不是问很多，而是问得准、接得住、能引用证据、能发现矛盾、能自然追问。

### 4.3 第三层：时间价值

**Daily Mirror / 对话即日记 / 长期记忆** 负责让 Ather 有时间维度。

没有时间，就没有真正的理解。
有了时间，Ather 才可能看到稳定特质、短期波动、关系模式和叙事方式的变化。

### 4.4 第四层：洞察价值

**You Shifted** 是当前最关键的价值核。

不是“我记录了你”，而是“我比你更早发现你变了”。

这类洞察一旦成立，会同时带来：
- 用户的震撼感
- 复访动机
- 付费理由
- 品牌差异化

所以内部必须统一：

**Daily Mirror 是入口，I Remember 是连续性，You Shifted 才是最高价值。**

---

## 5. 当前最重要的产品定位

### 5.1 外部定位

最优外部定位不是“AI 心理测评”或“AI 心理疗愈”。

当前最稳妥、最有战略空间的定位是：

**计算化心智镜像 / 自我探索型 AI 伴侣**

英文可对应为：
- Computational Mind Mirror[计算心智镜像]
- Self-Discovery Companion[自我探索伙伴]
- Reflective AI Companion[反思型AI伙伴]

### 5.2 为什么不能走“专业心理工具”主叙事

原因不是这个方向没有价值，而是现阶段风险过高：
-【太无聊】
-【市场同类多】
- 需要强机构背书
- 容易越界到医疗叙事
- 用户预期会被拉高到“专业诊疗级准确度”
- 一旦 chat 出现误导，品牌、合规风险、法律问题都更大

### 5.3 为什么“计算化自我探索”更适合 Ather

因为它与 Ather 当前真实能力一致：
- 有结构化剧本和向量化表示
- 有持续记忆和证据引用
- 有贝叶斯更新和变化检测【其核心思想是将先验知识与新观测数据相结合，计算得到后验概率】
- 有可反驳和可修正机制

这条路不是降级，而是换赛道定义。

不是和医院竞争，而是创造新的用户心智：

**Ather 是一个持续理解你的系统，而不是一次性判断你的机构。**

---

## 6. Ather 的科学立场

这是内部必须统一的高压线。

### 6.1 原则：不造科学，只锚定已有科学

Ather 不能把自己包装成新的心理学理论。

Ather 的正确做法是：
- 站在已有实证心理学和心理测量学之上
- 把这些理论转成更连续、更动态、更可交互的产品系统
- 用工程系统去承载，而不是重新发明学科本身

### 6.2 四层科学框架

Ather 当前可依赖的科学层级应明确区分：

**L1 核心层，直接应用**
- 人格心理学
- 心理测量学
- 情绪心理学
- 依恋理论
- 认知心理学
- 临床心理学中的低风险探针思路
- 心理语言学
- 社会心理学
- 发展心理学

**L2 设计原则层，谨慎应用**
- 行为经济学
- 动机心理学
- 创伤心理学
- 神经心理学
- 时间心理学

**L3 前沿参考层，不作为主要依据**
- 预测加工
- 计算精神病学
- 情感神经科学
- 进化心理学等

**L4 工程实现层**
- NLP
- HCI
- 数据可视化
- 自适应系统

### 6.3 科学表达的底线

内部和外部都必须避免以下表达：
- 声称 Ather 能诊断某类问题
- 声称某个神经机制已经被 Ather 直接识别
- 用脑科学术语做营销夸张
- 把理论参考误说成临床级证据

---

## 7. 在没有专业机构背书时，Ather 如何建立可信度

这是当前最现实的战略问题。


### 7.1 第一条线：借用成熟量表与文献体系

Ather 不应该从零发明量表。

当前最优策略是把关键维度锚定到已有 validated 工具，例如：
- Big Five：BFI-10 / TIPI
- 情绪调节：DERS-16
- 韧性：CD-RISC-10
- 依恋：ECR-R 短版

这意味着 Ather 不是在验证这些量表，而是在验证：

**Ather 的动态推断结果，是否与成熟量表有足够一致性。**

### 7.2 第二条线：产品自证

对消费级产品而言，最强的验证不是一张证书，而是持续、可重复的用户确认。

Ather 可以建立三种内部有效性证据：
- YouShifted 触发后的用户确认率
- 对“你刚才的变化判断准确吗”的主观认同率
- 长期使用后用户对“被理解感”的提升曲线

### 7.3 第三条线：透明机制

没有机构担保，就必须更透明。

Ather 的白盒原则应该是：
- 结论尽量附证据引用
- 关键推断能说明依据
- 用户能反驳和修正
- 系统承认不确定性，而不是伪装绝对确定

**白盒透明，是 Ather 在无机构阶段最重要的信任机制。**

---

## 8. Ather 的差异化护城河

内部统一时，必须看清 Ather 真正的护城河在哪里。

### 8.1 不是题库护城河

题目可以被抄，风格可以被模仿，UI 可以被快速复制。

### 8.2 真正护城河有三层

**第一层：时间护城河**
长期数据积累本身就是壁垒。别人无法瞬间复制用户已经在 Ather 上沉淀的时间和记忆。

**第二层：关系护城河**
如果 Ather 能稳定做到“I Remember”和“You Shifted”，用户离开的成本不是迁移数据，而是失去一个真正懂自己变化的系统。

**第三层：机制护城河**
Ather 不是简单聊天，而是：
- 剧本输入
- 结构化对话
- 证据沉淀
- UBV 更新（Unified Business View，统一业务视图）
- 长期追踪
- 变化检测
- 反驳修正

这个闭环一旦跑顺，复制成本会远高于表层聊天产品。

---

## 9. 当前已明确的项目风险

这部分必须写给内部，因为现在不是“愿景不清”，而是“愿景已清，执行层还不一致”。

### 9.1 科学表达风险

项目容易滑向“心理学很强、脑科学也懂、还能做行为判断”的全能叙事。

这个方向短期最危险。

### 9.2 维度体系风险

当前存在前后端维度表述不一致、报告维度和雷达维度不一致的问题。

如果不统一，用户看见的是两个不同的 Ather。

### 9.3 RCI（RiskControlIndicators风险控制指标）与变化检测风险

当前“变化”相关表达有真实 RCI 与阈值判断混用的风险。

如果内部不先纠正命名和算法边界，后面对外表达会失真。

### 9.4 Chat 与测量目标脱钩风险

如果 chat 只追求好聊、不追求可解释的测量价值，Ather 会退化为普通陪聊产品。

### 9.5 API 与系统契约漂移风险

如果前端展示逻辑、后端结构、代理兼容逻辑长期不统一，产品看起来能跑，但系统认知会越来越分裂。
【有funnel漏斗-不同层级，去处理不同API和各种模型来应对每个用户】
---

## 10. 

Ather 当前最优是聚焦四件事。

### 10.1 第一优先：统一维度和语言体系

统一：
- 用户看到的维度
- 后端产出的维度
- 报告里的维度
- GrowthMap 和变化检测的维度
- 文案中对这些维度的解释

### 10.2 第二优先：把 You Shifted 做成真正可验证的核心体验

不是只写概念，而是落成闭环：
- 明确触发逻辑
- 展示证据
- 让用户确认准确性
- 记录准确性反馈

### 10.3 第三优先：建立最小可信度体系

包括：
- 用成熟量表做锚定
- 给关键维度补文献依据
- 设计 concurrent validity（同时效度是指一种测量工具或方法与其他已知的标准测量方法之间的一致性或相关性，通常用于验证该测量工具的有效性） 内测流程
- 形成第一批内部验证数据

### 10.4 第四优先：把白盒与可反驳机制产品化

Ather 的可信度不应该只靠解释文案，而要靠交互机制：
- 为什么这么判断
- 哪段证据支持这个判断
- 用户是否认同
- 不认同时如何修正

---

## 11. 当前阶段不应该做什么

为了保证项目不失焦，以下方向当前不应成为主战场：
- 不把项目包装成专业诊断系统
- 不在没有验证闭环前大谈脑科学与神经机制
- 不优先做大而全的剧本矩阵
- 不优先追求语音、硬件、多端花哨体验
- 不把 Web3、积分、代币等叙事提前到核心链路前面
- 不为了“显得专业”而堆砌术语

当前阶段最重要的不是“看起来很大”，而是：

**让一个用户在第一次使用、一周使用、一个月使用后，明显感到 Ather 越来越懂自己。**

---

## 12. 内部统一结论

Ather 当前的正确项目陈述可以收束为一句话（内部理解）：

**Ather 是一个以长期记忆、结构化对话、动态自我模型和变化检测为核心的计算化自我探索系统，它不依赖先有机构认证才能成立，而是通过透明机制、成熟科学锚点和用户持续确认来逐步建立可信度，并最终成为最懂用户的 AI 伴侣。**

再压缩一层，就是内部共识版：

**Ather 就像是“会越来越懂你的心智镜像系统”。**

这句话【Ather成为理解人类和协助人类的IA】，应该成为当前产品、算法、内容、设计、品牌对齐时的基础判断。

---

## 13. 建议的内部使用方式

这份白皮书建议用于三类内部场景：
- 新成员 onboarding
- 需求评审和优先级讨论
- 对团队内部，产品功能命名的统一校对

建议任何新需求立项前，先过三道判断：
- 它是否让 Ather 更懂用户，而不是更像一个花哨工具
- 它是否增强了白盒可信度，而不是制造黑盒神秘感
- 它是否服务于长期关系与变化检测，而不是一次性结果展示

如果三条都不满足，这个需求大概率不该优先做。
`;

// Retained only as the September 2026 short-form snapshot.  It is not rendered.
const LEGACY_SHORT_WHITEPAPERS: Record<Locale, string> = {
  'zh-CN': `# Ather 白皮书

## 1. Ather 是什么

Ather 是一个帮助你持续观察、整理和理解自身经验的工具。

它不给人贴固定标签，也不会把一次回答当成最终结论。

---

## 2. 我们的立场

人会变，情境也会变。理解自己也应该留有余地。

Ather 帮你看见自己的选择、感受和变化，而不是替你定义人生。

---

## 3. 你的权利

- 你可以查看 Ather 用来理解你的依据。
- 你可以纠正、补充或删除自己的记录。
- 你的原话和 Ather 的解释会清楚区分。

---

## 4. 边界

Ather 不是医疗、精神或心理诊断、治疗服务，也不替代专业支持。

当需要医疗、心理危机或紧急帮助时，请联系合格的专业人士或当地紧急服务。

---

## 5. 方向

我们正在构建一种更诚实的自我探索体验：证据可回看，理解可修正，结论随时间保持开放。`,
  en: `# Ather Whitepaper

## 1. What Ather is

Ather is a tool that helps you notice, organise, and understand your own experience over time.

It does not put a fixed label on you, and it does not treat a single answer as a final conclusion.

---

## 2. Our position

People change. So does self-understanding — it should leave room for uncertainty.

Ather helps you see your choices, feelings, and changes. It does not define your life for you.

---

## 3. Your rights

- You can see the evidence Ather uses to understand you.
- You can correct, add to, or delete your own records.
- Your words and Ather's interpretation are kept separate.

---

## 4. Boundaries

Ather is not a medical, psychiatric, psychological, or therapeutic service. It does not replace professional care.

If you need medical help, are in a mental-health crisis, or need urgent support, contact a qualified professional or your local emergency service.

---

## 5. Direction

We are building a more honest self-discovery experience: evidence you can revisit, understanding you can correct, and conclusions that stay open as time goes on.`,
  ja: `# Ather ホワイトペーパー

## 1. Ather とは

Ather は、自分自身の経験を時間をかけて観察・整理・理解するためのツールです。

固定的なラベルは貼りません。一度の回答を最終結論にもしません。

---

## 2. 私たちの立場

人は変わります。状況も変わります。自分を理解することにも、不確かさを含めていいはずです。

Ather はあなたの選択、感情、変化を見つめる手助けをします。人生を代わりに定義することはありません。

---

## 3. あなたの権利

- Ather があなたを理解するために使った根拠を確認できます。
- 自分の記録を訂正・補足・削除できます。
- あなたの言葉と Ather の解釈は明確に区別されます。

---

## 4. 境界

Ather は医療・精神・心理・治療のサービスではなく、専門的支援の代わりでもありません。

医療が必要、心の危機、緊急の支援が必要なときは、資格を持つ専門家または地域の緊急サービスに連絡してください。

---

## 5. 方向性

私たちは、根拠を見返せて、理解を修正できて、結論を時間とともに開いたままにできる、より誠実な自己探索体験をつくります。`,
  es: `# Whitepaper de Ather

## 1. Qué es Ather

Ather es una herramienta para observar, organizar y comprender tu propia experiencia a lo largo del tiempo.

No te pone etiquetas fijas ni trata una sola respuesta como una conclusión final.

---

## 2. Nuestra posición

Las personas cambian. También la comprensión de uno mismo: debe dejar espacio para la incertidumbre.

Ather te ayuda a ver tus decisiones, sentimientos y cambios. No define tu vida por ti.

---

## 3. Tus derechos

- Puedes revisar la evidencia que Ather usa para entenderte.
- Puedes corregir, añadir o eliminar tus propios registros.
- Tus palabras y la interpretación de Ather se mantienen separadas.

---

## 4. Límites

Ather no es un servicio médico, psiquiátrico, psicológico ni terapéutico. No sustituye la atención profesional.

Si necesitas ayuda médica, estás en una crisis de salud mental o requieres apoyo urgente, contacta a un profesional cualificado o a los servicios de emergencia locales.

---

## 5. Dirección

Construimos una experiencia de autodescubrimiento más honesta: evidencias que puedes revisar, comprensión que puedes corregir y conclusiones que se mantienen abiertas con el tiempo.`,
};

// The previously public 13-section manifesto is the canonical source.  Each
// translation preserves its historical framing, claims, caveats, and structure.
const HISTORICAL_WHITEPAPERS: Record<Locale, string> = {
  'zh-CN': WHITEPAPER_MD,
  en: `# Ather Internal Manifesto

> Historical note (29 June 2026): this document was written when Ather defined its product around long-term memory, structured conversation, and ongoing companion-style chat. The current formal product has since narrowed to a 14-question baseline, a portrait, real-world records, single-question checks, and user correction. This is retained as an early positioning record, not as a statement of current product, deployment, or engineering scope.

Internal version v1.0
25 April 2026

---

## 1. Purpose of this whitepaper

**To align Ather internally on the project’s current statement at that time.**

---

## 2. Ather’s definition at that time

**Ather was conceived as a computational self-exploration system built on long-term memory, structured conversation, daily tracking, and change detection, with the ambition to become an AI companion that understands its user deeply.**

It was a continuously updated model of the self: a way to help people keep seeing and understanding themselves, and a starting point for Intelligence Amplification.

---

## 3. What Ather is not

### 3.1 Not a clinical diagnostic system

Ather does not diagnose illness, provide medical conclusions, replace a psychologist, or claim to offer treatment.

### 3.2 Not a pseudoscientific labelling machine

It must not assign fixed labels or let one test define a person permanently. Its model must not rest on rigid typologies or manufacture the feeling of being “accurately read” through overconfident conclusions.

### 3.3 Not a general-purpose chatbot

Conversation is not casual companionship or unrestricted Q&A. It must improve personal understanding, surface contradictions, uncertainty, and change, and create evidence that can be revisited and corrected.

### 3.4 Not a project that requires institutional licensing to exist

Institutional collaboration matters, but it is not the precondition for Ather. The first questions are whether users genuinely feel understood and whether longitudinal data shows the system becoming more accurate.

---

## 4. Ather’s core value structure

### 4.1 Entry value

**Short assessments in everyday situations / first-layer scripts** lower the barrier to entry. Their job is not to finish measurement, but to let a user feel that the system has begun to understand them.

### 4.2 Relationship value

**Structured conversation** turns a one-off assessment into an ongoing relationship. What matters is not asking more questions, but asking precisely, holding context, citing evidence, noticing contradictions, and following up naturally.

### 4.3 Value over time

**Daily Mirror, conversation-as-journal, and long-term memory** give Ather a temporal dimension. Without time there is no real understanding; with it, Ather may distinguish stable traits, short-term variation, relationship patterns, and changes in narrative style.

### 4.4 Insight value

**You Shifted** was the central value proposition: not “I recorded you,” but “I noticed your change before you did.” If it works, it can create surprise, a reason to return, willingness to pay, and brand differentiation. Daily Mirror is the entry, I Remember is continuity, and You Shifted is the highest value.

---

## 5. The most important product positioning

### 5.1 External positioning

The preferred position was not “AI psychological assessment” or “AI therapy,” but a **computational mind mirror / self-exploration AI companion**: Computational Mind Mirror, Self-Discovery Companion, or Reflective AI Companion.

### 5.2 Why not lead with a professional psychology-tool narrative

At that stage it was too risky: crowded positioning, dependence on strong institutional endorsement, proximity to medical claims, heightened expectations of clinical-grade accuracy, and greater brand, compliance, and legal exposure when conversation misleads.

### 5.3 Why computational self-exploration fit Ather

It matched the then-intended capabilities: structured scripts and vector representations, persistent memory and evidence references, Bayesian updating and change detection, plus mechanisms for challenge and correction. This was not a downgrade; it defined a different category: a system that continues to understand you, rather than an institution that judges you once.

---

## 6. Ather’s scientific position

### 6.1 Principle: do not invent science; anchor to established science

Ather must not present itself as a new psychological theory. It should build on empirical psychology and psychometrics, translate them into a more continuous, dynamic, interactive product system, and let engineering carry the system rather than reinventing a discipline.

### 6.2 Four layers of scientific reference

**L1 — direct foundations:** personality, psychometrics, emotion, attachment, cognitive, psycholinguistic, social, and developmental psychology; low-risk probing ideas from clinical psychology.

**L2 — cautious design principles:** behavioural economics, motivation, trauma psychology, neuropsychology, and time psychology.

**L3 — frontier references, not primary evidence:** predictive processing, computational psychiatry, affective neuroscience, and evolutionary psychology.

**L4 — engineering:** NLP, HCI, data visualisation, and adaptive systems.

### 6.3 Boundaries for scientific language

Neither internal nor external communication may claim diagnosis, direct identification of a neural mechanism, neuroscience marketing hype, or clinical-grade proof where there is only theoretical reference.

---

## 7. Building trust without institutional endorsement

### 7.1 Use established scales and literature

Ather should not invent scales from zero. Relevant dimensions can be anchored to validated tools such as BFI-10/TIPI (Big Five), DERS-16 (emotion regulation), CD-RISC-10 (resilience), and the short ECR-R (attachment). The question is not whether Ather validates those scales, but whether its dynamic inferences agree with them sufficiently.

### 7.2 Product self-evidence

For a consumer product, the strongest evidence is repeated user confirmation: confirmation after You Shifted triggers, perceived accuracy of change judgements, and the longer-term trajectory of feeling understood.

### 7.3 Transparent mechanisms

Without institutional guarantee, transparency is essential: conclusions should cite evidence where possible, key inferences should explain their basis, users must be able to challenge and correct them, and the system must admit uncertainty. White-box transparency is the core trust mechanism in this phase.

---

## 8. Ather’s differentiated moat

### 8.1 Not a question-bank moat

Questions, visual style, and UI can be copied.

### 8.2 Three real layers

**Time moat:** accumulated personal history cannot be copied instantly.
**Relationship moat:** if Ather reliably remembers and notices change, leaving means losing a system that understands one’s evolution, not merely moving data.
**Mechanism moat:** scripted input, structured conversation, evidence accumulation, UBV updates, long-term tracking, change detection, and challenge-and-correction create a loop that is harder to copy than surface chat.

---

## 9. Known project risks

### 9.1 Scientific-language risk

The project can drift into an all-powerful story that claims deep psychology, neuroscience, and behavioural judgement. That is the most dangerous short-term direction.

### 9.2 Dimension-system risk

If frontend, backend, report, and radar dimensions differ, users encounter two different Athers.

### 9.3 Risk-control and change-detection risk

Language around change may conflate real risk-control indicators with threshold judgements. Naming and algorithmic boundaries must be corrected before external claims are made.

### 9.4 Chat drifting away from measurement

If chat only optimises for pleasant conversation instead of explainable measurement value, Ather becomes ordinary companionship chat.

### 9.5 API and system-contract drift

If frontend display logic, backend structure, agent compatibility, model routing, and API contracts diverge, the product may appear to run while its system understanding fragments.

---

## 10. Current priorities

### 10.1 Unify dimensions and language

Align user-facing dimensions, backend outputs, report dimensions, GrowthMap and change detection, and the copy that explains them.

### 10.2 Make You Shifted verifiable

Define trigger logic, show evidence, let the user confirm accuracy, and record that feedback.

### 10.3 Establish a minimum credibility system

Anchor key dimensions in mature scales, add literature support, design an internal concurrent-validity process, and build the first validation dataset.

### 10.4 Productise white-box and challenge mechanisms

Trust must come from interaction: why a judgement was made, which evidence supports it, whether the user agrees, and how they can correct it.

---

## 11. What Ather should not do at this stage

Do not package the project as a professional diagnostic system; make grand claims about neuroscience before a validation loop exists; prioritise a huge script matrix, voice, hardware, or flashy multi-device experiences; introduce Web3, points, or token narratives before the core loop; or pile up jargon to look professional.

The priority is that, after a first use, a week, and a month, a user can clearly feel that Ather understands them better over time.

---

## 12. Shared internal conclusion

**Ather was a computational self-exploration system based on long-term memory, structured conversation, a dynamic self-model, and change detection. It did not need institutional certification to begin; it needed transparent mechanisms, mature scientific anchors, and continuous user confirmation to earn trust progressively.**

In shorter form: **Ather is a mind-mirror system that can understand you better over time.** This was intended as the foundation for aligning product, algorithms, content, design, and brand.

---

## 13. Suggested internal use

This document was intended for new-member onboarding, requirement and priority reviews, and consistent naming across the product.

Before starting a new requirement, ask: does it help Ather understand the user rather than become a flashy tool; does it strengthen white-box trust rather than black-box mystique; and does it serve a long-term relationship and change detection rather than a one-off result? If none apply, it was unlikely to be a priority.`,
  ja: `# Ather 内部マニフェスト

> 履歴に関する注記（2026年6月29日）：本書は、Ather が「長期記憶・構造化された対話・継続的な伴走型チャット」を主な製品定義としていた時期に書かれました。現在の正式な製品は「14問のベースライン評価 → ポートレート → 現実の記録 → 単問テスト → ユーザーによる訂正」へと収束しています。本書は初期の位置づけの変遷を記録するものであり、現在の製品、ページ、デプロイ、開発方針を示すものではありません。

内部版 v1.0
2026年4月25日

---

## 1. この白書の目的

**当時のプロジェクトに関する Ather の最新の共通認識を、内部でそろえること。**

---

## 2. 当時の Ather の定義

**Ather は、長期記憶、構造化された対話、日々の追跡、変化検知を核にした「計算による自己探索システム」であり、ユーザーを深く理解する AI コンパニオンを目指すものでした。**

それは継続的に更新される自己モデルであり、人が自分自身を見つめ、理解し続けるための仕組みです。Intelligence Amplification へ向かう出発点でもあります。

---

## 3. Ather ではないもの

### 3.1 臨床診断システムではない

Ather は病気を診断せず、医学的結論を出さず、心理職の代わりにならず、治療を提供すると主張しません。

### 3.2 疑似科学的なラベリング装置ではない

固定的なラベルを貼ったり、一度のテストで人を永続的に定義したりしません。硬直した類型論や、断定によって「見抜かれた」と感じさせる設計に依存してはなりません。

### 3.3 汎用チャットボットではない

対話は雑談や無制限の Q&A のためではありません。個人理解を深め、矛盾・不確かさ・変化を見つけ、後から見直し訂正できる根拠をつくるためのものです。

### 3.4 機関の認可がなければ成立しないプロジェクトではない

機関との協働は重要ですが、Ather の前提条件ではありません。重要なのは、ユーザーが本当に理解されたと感じるか、そして長期データがシステムの精度向上を示せるかです。

---

## 4. Ather の中核となる価値構造

### 4.1 入り口の価値

**生活場面の短い評価／第一層のスクリプト** は参加のハードルを下げます。測定を終えることではなく、「このシステムは自分を理解し始めた」と感じられる状態をつくることが役割です。

### 4.2 関係性の価値

**構造化された対話** は、一回きりの評価を継続的な関係へ変えます。質問数ではなく、的確に問い、文脈を受け止め、根拠を参照し、矛盾に気づき、自然に掘り下げることが重要です。

### 4.3 時間の価値

**Daily Mirror、日記としての対話、長期記憶** は時間軸を与えます。時間がなければ本当の理解はありません。時間があって初めて、安定した特性、短期的な揺れ、関係パターン、語り方の変化を見られます。

### 4.4 洞察の価値

**You Shifted** は最重要の価値核でした。「記録した」ではなく「あなたより先に変化に気づいた」ということです。成立すれば驚き、再訪理由、支払い理由、ブランドの差別化を生みます。Daily Mirror は入り口、I Remember は連続性、You Shifted は最高の価値です。

---

## 5. 最も重要な製品ポジショニング

### 5.1 外部向けの位置づけ

「AI心理評価」や「AI心理療法」ではなく、**計算による心の鏡／自己探索の AI コンパニオン** が最も適した位置づけでした。英語では Computational Mind Mirror、Self-Discovery Companion、Reflective AI Companion と表せます。

### 5.2 専門的な心理ツールを主語にしない理由

当時はリスクが高すぎました。同種の多さ、強い機関的裏づけへの依存、医療的な語りへの近接、臨床級の精度への期待、誤解を招く対話が生むブランド・コンプライアンス・法的リスクがあるためです。

### 5.3 計算による自己探索が Ather に合う理由

構造化スクリプトとベクトル表現、継続記憶と根拠参照、ベイズ更新と変化検知、反論と訂正の仕組みという当時の実力に合っていました。これは格下げではなく、一度だけ判断する機関ではなく、継続して理解するシステムという別のカテゴリーを定義することでした。

---

## 6. Ather の科学に対する姿勢

### 6.1 原則：科学をつくらず、既存の科学に根を張る

Ather は新しい心理学理論として自らを見せてはなりません。実証心理学と心理測定学を土台にし、それを継続的・動的・対話的な製品システムへ翻訳し、工学で支えるべきです。

### 6.2 四層の科学的参照枠組み

**L1・直接の基盤：** パーソナリティ、心理測定、感情、愛着、認知、心理言語、社会、発達心理学、および臨床心理学の低リスクな探索の考え方。
**L2・慎重に使う設計原則：** 行動経済学、動機づけ、トラウマ心理学、神経心理学、時間心理学。
**L3・主要根拠にはしない先端の参照：** 予測処理、計算論的精神医学、情動神経科学、進化心理学。
**L4・工学実装：** NLP、HCI、データ可視化、適応システム。

### 6.3 科学的表現の境界

診断、神経機構の直接検出、神経科学を用いた誇大な販促、理論的な参照を臨床級の根拠とみなすことは、内部でも外部でも避けなければなりません。

---

## 7. 機関の裏づけなしに信頼を築く方法

### 7.1 確立した尺度と文献を借りる

尺度をゼロから発明してはなりません。Big Five の BFI-10/TIPI、感情調整の DERS-16、レジリエンスの CD-RISC-10、愛着の短縮版 ECR-R などに重要な次元を結びつけられます。検証するのは尺度そのものではなく、Ather の動的推論がそれらと十分に整合するかです。

### 7.2 製品自身による証拠

消費者向け製品では、反復されるユーザー確認が最も強い証拠です。You Shifted 後の確認率、変化判断への主観的な納得度、長期利用での「理解されている感」の推移を扱います。

### 7.3 透明な仕組み

機関による保証がなければ、透明性が不可欠です。結論には可能な限り根拠を添え、重要な推論は理由を説明し、ユーザーが反論・訂正でき、システムは不確かさを認めます。ホワイトボックスの透明性がこの段階の中心的な信頼の仕組みです。

---

## 8. Ather の差別化された堀

### 8.1 問題集は堀ではない

質問、表面的なスタイル、UI は模倣できます。

### 8.2 本当の三層

**時間の堀：** 蓄積された個人史は一瞬には複製できません。
**関係性の堀：** Ather が確実に記憶し変化に気づくなら、離れることはデータ移行ではなく、自分の変化を理解するシステムを失うことです。
**仕組みの堀：** スクリプト入力、構造化対話、根拠の蓄積、UBV更新、長期追跡、変化検知、反論と訂正のループは、表層的なチャットより模倣が難しいものです。

---

## 9. 現在認識されているプロジェクトリスク

### 9.1 科学的表現のリスク

深い心理学、神経科学、行動判断までできる万能な物語へ流れやすいことが、短期では最も危険です。

### 9.2 次元体系のリスク

フロントエンド、バックエンド、レポート、レーダーの次元が異なれば、ユーザーには二つの Ather が見えます。

### 9.3 リスク管理と変化検知のリスク

変化に関する言葉が、実際のリスク管理指標と閾値判断を混同するおそれがあります。外部に語る前に、命名とアルゴリズムの境界を正す必要があります。

### 9.4 チャットが測定目的から離れるリスク

対話の心地よさだけを最適化し、説明可能な測定価値を追わなければ、Ather は普通の伴走チャットになります。

### 9.5 API とシステム契約の乖離

画面表示、バックエンド構造、エージェント互換、モデルルーティング、API契約がずれると、動いて見えてもシステム理解は分裂します。

---

## 10. 現在の優先事項

### 10.1 次元と言葉を統一する

ユーザーが見る次元、バックエンド出力、レポート、GrowthMapと変化検知、それらを説明する文言をそろえます。

### 10.2 You Shifted を検証可能にする

発火ロジックを定め、根拠を示し、ユーザーに精度を確認してもらい、そのフィードバックを記録します。

### 10.3 最小の信頼性体系をつくる

重要な次元を成熟した尺度に結び、文献の支えを加え、内製の同時的妥当性プロセスを設計し、最初の検証データを集めます。

### 10.4 ホワイトボックスと反論の仕組みを製品化する

信頼は文言ではなく相互作用から生まれます。なぜ判断したか、どの根拠が支えるか、ユーザーが同意するか、どう訂正できるかを扱います。

---

## 11. この段階で Ather がすべきでないこと

専門的な診断システムとして装うこと、検証ループの前に神経科学を大きく語ること、巨大なスクリプト群、音声、ハードウェア、多端末の派手な体験を優先すること、コアループの前にWeb3・ポイント・トークンを持ち込むこと、専門的に見せるための専門用語の積み上げはしません。

最優先は、初回、一週間、一か月後に、ユーザーが Ather が時間とともに自分をより理解していると明確に感じられることです。

---

## 12. 共通の内部結論

**Ather は、長期記憶、構造化された対話、動的な自己モデル、変化検知を核にした計算による自己探索システムでした。最初から機関認証を必要とするのではなく、透明な仕組み、成熟した科学的な足場、継続的なユーザー確認を通じて段階的に信頼を得ることを目指していました。**

短く言えば、**Ather は時間とともにあなたをより理解できる心の鏡のシステム**です。製品、アルゴリズム、内容、デザイン、ブランドをそろえる基盤として意図されました。

---

## 13. 想定していた内部での使い方

本書は新メンバーのオンボーディング、要件と優先順位のレビュー、製品機能名の統一のために使うことを想定していました。

新しい要件の前に、これは派手な道具ではなく Ather がユーザーをより理解することに寄与するか、ブラックボックス的な神秘性ではなくホワイトボックスの信頼を強めるか、一回限りの結果ではなく長期関係と変化検知に役立つかを問います。どれも満たさなければ、優先度は低いはずです。`,
  es: `# Manifiesto interno de Ather

> Nota histórica (29 de junio de 2026): este documento se escribió cuando Ather definía su producto en torno a la memoria a largo plazo, la conversación estructurada y un chat de acompañamiento continuo. El producto formal actual se ha acotado a una línea de base de 14 preguntas, un retrato, registros de la vida real, pruebas de una sola pregunta y correcciones del usuario. Se conserva como referencia de una etapa temprana; no describe el producto, las páginas, el despliegue ni el desarrollo actuales.

Versión interna v1.0
25 de abril de 2026

---

## 1. Propósito de este whitepaper

**Alinear internamente la formulación de Ather sobre el proyecto en aquella etapa.**

---

## 2. La definición de Ather en aquel momento

**Ather se concebía como un sistema computacional de autoexploración basado en memoria a largo plazo, conversación estructurada, seguimiento diario y detección de cambios, con la ambición de llegar a ser un acompañante de IA que entendiera profundamente a cada persona.**

Era un modelo de uno mismo que se actualiza de forma continua: una manera de ayudar a las personas a seguir viéndose y entendiéndose. También era un punto de partida hacia la amplificación de la inteligencia.

---

## 3. Lo que Ather no es

### 3.1 No es un sistema de diagnóstico clínico

Ather no diagnostica enfermedades, no da conclusiones médicas, no sustituye a profesionales de la psicología ni afirma ofrecer tratamiento.

### 3.2 No es una máquina de etiquetas pseudocientíficas

No debe poner etiquetas fijas ni dejar que una sola prueba defina a alguien para siempre. Su modelo no debe depender de tipologías rígidas ni producir la ilusión de «me ha leído» mediante conclusiones excesivamente seguras.

### 3.3 No es un chatbot generalista

La conversación no es charla casual ni preguntas y respuestas sin límite. Debe mejorar la comprensión personal, detectar contradicciones, incertidumbre y cambios, y generar evidencias que se puedan revisar y corregir.

### 3.4 No es un proyecto que solo exista con licencias institucionales

La colaboración institucional importa, pero no es la condición previa de Ather. Las preguntas fundamentales son si las personas se sienten realmente comprendidas y si los datos longitudinales muestran que el sistema gana precisión.

---

## 4. La estructura central de valor de Ather

### 4.1 Valor de entrada

**Evaluaciones breves en situaciones cotidianas / guiones de primera capa** reducen la barrera de entrada. No buscan terminar una medición, sino hacer que la persona sienta que el sistema ha empezado a comprenderla.

### 4.2 Valor de relación

**La conversación estructurada** convierte una evaluación aislada en una relación continua. No importa preguntar mucho, sino preguntar con precisión, sostener el contexto, citar evidencias, detectar contradicciones y profundizar de forma natural.

### 4.3 Valor del tiempo

**Daily Mirror, la conversación como diario y la memoria a largo plazo** dan a Ather una dimensión temporal. Sin tiempo no hay comprensión real; con él puede distinguir rasgos estables, variaciones breves, patrones relacionales y cambios en la manera de narrarse.

### 4.4 Valor de la percepción

**You Shifted** era el núcleo de valor: no «te he registrado», sino «he advertido tu cambio antes que tú». Si funciona, puede generar sorpresa, motivos para volver, razones para pagar y diferenciación de marca. Daily Mirror es la entrada, I Remember es la continuidad y You Shifted es el valor más alto.

---

## 5. El posicionamiento de producto más importante

### 5.1 Posicionamiento externo

La mejor posición no era «evaluación psicológica con IA» ni «terapia con IA», sino un **espejo mental computacional / acompañante de IA para la autoexploración**: Computational Mind Mirror, Self-Discovery Companion o Reflective AI Companion.

### 5.2 Por qué no liderar con el relato de una herramienta psicológica profesional

En aquella fase el riesgo era demasiado alto: un mercado saturado, dependencia de aval institucional fuerte, cercanía a afirmaciones médicas, expectativas de precisión clínica y mayor exposición de marca, cumplimiento y legal cuando una conversación induce a error.

### 5.3 Por qué la autoexploración computacional encajaba con Ather

Encajaba con las capacidades previstas: guiones estructurados y representaciones vectoriales, memoria persistente y referencias de evidencia, actualización bayesiana y detección de cambios, además de mecanismos para cuestionar y corregir. No era un descenso de ambición, sino la definición de otra categoría: un sistema que te comprende de forma continua, no una institución que te juzga una sola vez.

---

## 6. La posición científica de Ather

### 6.1 Principio: no inventar ciencia; anclarse en ciencia establecida

Ather no debe presentarse como una nueva teoría psicológica. Debe apoyarse en psicología empírica y psicometría, traducirlas a un sistema de producto más continuo, dinámico e interactivo, y dejar que la ingeniería sostenga el sistema en vez de reinventar una disciplina.

### 6.2 Cuatro capas de referencia científica

**L1, fundamentos de aplicación directa:** psicología de la personalidad, psicometría, emoción, apego, cognición, psicolingüística, psicología social y del desarrollo, e ideas de exploración de bajo riesgo de la psicología clínica.
**L2, principios de diseño de uso prudente:** economía conductual, motivación, psicología del trauma, neuropsicología y psicología del tiempo.
**L3, referencias de frontera y no evidencia principal:** procesamiento predictivo, psiquiatría computacional, neurociencia afectiva y psicología evolutiva.
**L4, ingeniería:** PLN, IHC, visualización de datos y sistemas adaptativos.

### 6.3 Límites del lenguaje científico

No se deben afirmar diagnósticos, detección directa de mecanismos neuronales, publicidad exagerada basada en neurociencia ni pruebas de nivel clínico cuando solo existe una referencia teórica.

---

## 7. Cómo construir confianza sin respaldo institucional

### 7.1 Usar escalas y bibliografía consolidadas

Ather no debería inventar escalas desde cero. Puede anclar dimensiones relevantes a herramientas validadas como BFI-10/TIPI para los Cinco Grandes, DERS-16 para regulación emocional, CD-RISC-10 para resiliencia y la versión corta de ECR-R para apego. La pregunta no es validar esas escalas, sino si las inferencias dinámicas de Ather concuerdan suficientemente con ellas.

### 7.2 Evidencia del propio producto

En un producto de consumo, la evidencia más fuerte es la confirmación reiterada de las personas: confirmación tras una alerta de You Shifted, acuerdo subjetivo con una interpretación de cambio y evolución a largo plazo de la sensación de ser comprendida.

### 7.3 Mecanismos transparentes

Sin garantía institucional, la transparencia es indispensable: las conclusiones deben citar evidencia cuando sea posible, las inferencias importantes deben explicar su base, las personas deben poder cuestionarlas y corregirlas, y el sistema debe reconocer la incertidumbre. La transparencia de caja blanca es el mecanismo central de confianza en esta fase.

---

## 8. La ventaja diferencial de Ather

### 8.1 Un banco de preguntas no es la ventaja

Las preguntas, el estilo y la interfaz se pueden copiar.

### 8.2 Tres capas reales

**Ventaja del tiempo:** la historia personal acumulada no se puede copiar de inmediato.
**Ventaja de relación:** si Ather recuerda con fiabilidad y detecta cambios, irse no significa solo mover datos, sino perder un sistema que entiende la propia evolución.
**Ventaja del mecanismo:** entrada guiada, conversación estructurada, acumulación de evidencias, actualizaciones de UBV, seguimiento prolongado, detección de cambios y bucle de cuestionamiento y corrección son más difíciles de copiar que un chat superficial.

---

## 9. Riesgos de proyecto ya identificados

### 9.1 Riesgo del lenguaje científico

El proyecto puede deslizarse hacia un relato omnipotente que presume de psicología profunda, neurociencia y juicio conductual. Es la dirección más peligrosa a corto plazo.

### 9.2 Riesgo del sistema de dimensiones

Si las dimensiones del frontend, backend, informe y radar no coinciden, la persona usuaria se encuentra con dos Ather distintos.

### 9.3 Riesgo de control y detección de cambios

El lenguaje sobre «cambio» puede confundir indicadores reales de control de riesgo con juicios de umbral. Hay que corregir nombres y límites algorítmicos antes de hacer afirmaciones externas.

### 9.4 Riesgo de que el chat se aleje de la medición

Si el chat solo optimiza una conversación agradable y no el valor de una medición explicable, Ather se convierte en un chat de compañía convencional.

### 9.5 Deriva entre API y contratos del sistema

Si la lógica de presentación, la estructura del backend, la compatibilidad de agentes, el enrutamiento de modelos y los contratos de API divergen, el producto puede parecer funcional mientras su comprensión de sistema se fragmenta.

---

## 10. Prioridades actuales

### 10.1 Unificar dimensiones y lenguaje

Alinear las dimensiones que ve la persona usuaria, las salidas del backend, las dimensiones del informe, GrowthMap y detección de cambios, y los textos que las explican.

### 10.2 Hacer verificable You Shifted

Definir la lógica de activación, mostrar evidencia, permitir que la persona confirme la precisión y registrar esa respuesta.

### 10.3 Establecer un sistema mínimo de credibilidad

Anclar dimensiones clave en escalas maduras, añadir apoyo bibliográfico, diseñar un proceso interno de validez concurrente y formar el primer conjunto de datos de validación.

### 10.4 Convertir la caja blanca y la impugnación en producto

La confianza debe surgir de la interacción: por qué se emitió un juicio, qué evidencia lo apoya, si la persona está de acuerdo y cómo puede corregirlo.

---

## 11. Lo que Ather no debe hacer en esta etapa

No debe presentarse como un sistema profesional de diagnóstico; hacer grandes afirmaciones sobre neurociencia antes de contar con un bucle de validación; priorizar una enorme matriz de guiones, voz, hardware o experiencias llamativas multidispositivo; introducir Web3, puntos o tokens antes del bucle central; ni acumular jerga para parecer profesional.

La prioridad es que, después del primer uso, de una semana y de un mes, una persona pueda sentir con claridad que Ather la comprende mejor con el tiempo.

---

## 12. Conclusión interna compartida

**Ather era un sistema computacional de autoexploración basado en memoria a largo plazo, conversación estructurada, un modelo dinámico de sí mismo y detección de cambios. No necesitaba certificación institucional para comenzar: buscaba ganarse la confianza de forma progresiva mediante mecanismos transparentes, anclajes científicos maduros y confirmación continua de las personas usuarias.**

En breve: **Ather es un sistema de espejo mental que puede comprenderte mejor con el tiempo.** Esta formulación debía alinear producto, algoritmos, contenido, diseño y marca.

---

## 13. Uso interno previsto

Este documento se pensó para la incorporación de nuevos miembros, revisiones de requisitos y prioridades, y una nomenclatura coherente de las funciones del producto.

Antes de iniciar un requisito, conviene preguntar: ¿ayuda a Ather a comprender mejor a la persona en vez de convertirse en una herramienta vistosa?, ¿fortalece la confianza de caja blanca en vez del misterio de caja negra?, ¿sirve a una relación de largo plazo y a la detección de cambios en vez de a un resultado aislado? Si no cumple ninguna, probablemente no era una prioridad.`,
};

// The public whitepaper describes the present product truth and the hypotheses
// Ather still needs to validate. Historical material remains above for context.
const SHORT_PUBLIC_WHITEPAPERS: Record<Locale, string> = {
  'zh-CN': `# Ather 白皮书

> Ather 是一个持续演进的自我探索系统。它尝试把人的表达、系统的观察、可回看的证据和人的主动修正连接起来，让自我理解不再停留在一次测试或一个固定标签上。

## 1. 起点：人不会停在同一个版本

人会在经历、关系、压力、选择和时间中改变。今天说出的答案可能真实，却未必能代表半年后的自己；某个情境里的反应可能很强烈，却未必是稳定人格。传统的一次性测试通常把复杂的人压缩成一个分数、一组类型或一份结论，然后在最需要继续追问的地方停止。

Ather 从另一个问题出发：如果理解一个人不是一次判断，而是一个能够持续积累证据、接受本人修正、重新检查旧认识的过程，会发生什么？

项目的起点不是制造一个更漂亮的标签，而是让人能够看见自己如何形成选择、如何应对情境、哪些部分相对稳定、哪些部分正在变化。Ather 希望成为承载这一过程的系统。

## 2. Ather 的项目定义

Ather 是一个以结构化自我探索、证据呈现、用户反馈和时间维度为核心的计算系统。

它不试图用一句话概括一个人，而是把每次理解拆成可以检查的组成部分：观察是什么、依据来自哪里、哪些信息仍然不足、本人是否认同，以及这次理解以后是否需要被修正。

在当前阶段，Ather 首先把一轮自我探索做清楚：提出有限数量的问题，形成有限范围的观察，展示相应证据与边界，并接收反馈。长期方向则是在获得足够证据和验证之后，把多次互动组织成一个可更新、可追溯、不会假装确定的自我模型。

## 3. 核心命题：理解不是定义

Ather 不把任何一次输出视为对人的最终定义。系统产生的是观察和假设，而不是身份判决。

同一句话在不同生活背景中可能有不同含义；相似行为背后也可能存在完全不同的动机。一个人拒绝聚会，可能是需要独处、缺少准备、对特定关系不安全，或只是当天已经精疲力尽。脱离上下文的标签看似简洁，却可能抹去真正重要的信息。

因此，Ather 坚持三个原则：结论必须有限，依据必须可见，理解必须允许被反驳。系统越接近人的内在世界，就越需要克制地表达自己知道什么、不知道什么，以及为什么暂时这样理解。

## 4. 不贴标签，也不制造“被说中”的错觉

Ather 不以固定人格类型作为终点，也不依赖模糊、普适的描述制造准确感。

“你有时喜欢独处，但也渴望被理解”可以适用于许多人，却没有真正解释任何人。Ather 更关心具体证据：什么表达支持这项观察，它只适用于哪个情境，是否存在相反证据，以及本人如何解释。

一个诚实的系统可以说“现有信息不足”“这一观察只适用于本轮主题”或“你的补充改变了原先的理解”。承认不确定性不是能力不足的掩饰，而是防止系统越界的基本能力。

## 5. 当前正式体验

**当前能力**

Ather 当前的正式体验从一轮 6–8 个主题问题开始。问题并不是为了尽可能多地收集信息，而是围绕一个有限主题，引导使用者表达选择、感受、理由和现实情境。

完成后，系统呈现本轮观察、支持观察的证据，以及这些观察不能说明什么。使用者可以选择确认、部分符合、不符合，或补充自己的解释。反馈会被保存，并与对应轮次一起出现在历史中。

这一阶段的目标很明确：先证明一次有限的理解是否清楚、有依据、可回应。Ather 不会把单轮结果自动包装成完整人格，也不会把当前观察冒充已经成立的长期画像。

## 6. Ather 的最小理解单元

Ather 把“观察—证据—边界—反馈”视为最小理解单元。

- 观察：系统从本轮内容中看见了什么。
- 证据：哪些原始表达或选择支持这项观察。
- 边界：这项观察适用于什么范围，还有哪些未知。
- 反馈：本人是否认同、部分认同、反驳或补充。

这四部分必须一起存在。只有观察而没有证据，容易变成黑箱判断；只有证据而没有边界，容易过度推断；只有系统结论而没有反馈，理解就失去了最重要的校准来源。

这种结构也意味着，Ather 的基本对象不是一个神秘分数，而是一条能够被检查、被讨论、被更新的理解记录。

## 7. 证据、反馈与修正

Ather 的方向不是证明系统永远正确，而是建立一套发现错误、接受错误并留下修正痕迹的机制。

例如，一个人说：“我不是不喜欢社交，只是不喜欢没有准备的聚会。”这句话不是对系统的小修饰，而可能改变原先的解释：问题也许不在社交意愿，而在可预期性、精力分配或对失控的敏感。好的系统不应继续坚持旧标签，而应记录新的证据，并在以后遇到相关信息时重新检验。

**正在验证**

当前产品已经能够保存反馈。哪些反馈应影响后续理解、影响范围多大、何时可以认为旧观察已经失效，以及如何把这种变化清楚展示出来，仍需要产品实验和真实数据验证。

## 8. 为什么时间是必要维度

没有时间，系统只能看到片段。加入时间之后，才有可能区分相对稳定的倾向、短期情绪、特殊事件和真正的变化。

一次表达可能受到疲劳、冲突或环境影响；同一主题在不同阶段反复出现，意义则可能完全不同。Ather 的长期价值不应来自保存更多文字，而应来自对时间关系的理解：什么持续存在，什么只出现一次，什么逐渐增强，什么已经被新的证据推翻。

时间维度也带来更高的责任。历史信息不能天然被视为永远有效，旧结论不能因为被保存就获得更高权威。任何长期理解都必须允许过期、冲突、降级和重新确认。

## 9. Ather 的概念架构

Ather 的公开概念架构由五个相互约束的层次组成。

- 结构化探索层：围绕有限主题提出问题，获得带有上下文的表达。
- 证据层：保存支持观察的原始依据，并区分原话与系统解释。
- 理解层：形成有限观察，表达适用范围与不确定性。
- 校准层：接收确认、反驳和补充，使本人能够参与修正。
- 时间层：在条件成熟后比较不同轮次，检验稳定、冲突与变化。

这不是一条只向前运行的流水线，而是一个循环。新的反馈可能要求回看旧观察，新的情境可能改变证据的意义，新的轮次也可能证明过去的理解只适用于特定阶段。

Ather 不公开具体提示词、完整题库、参数、权重、阈值、模型路由或内部接口。这些实现细节会持续变化，也不是项目可信度的来源。真正需要被检验的是：系统是否展示依据、是否尊重反馈、是否正确表达边界，以及后续理解是否因此改善。

## 10. 结构化探索，而不是无限聊天

自由对话能够产生丰富表达，但丰富不等于可理解，更不等于可验证。如果系统只是不断聊天、不断生成听起来贴心的回应，它很容易退化成没有连续结构的陪聊工具。

Ather 采用结构化探索，是为了让每轮互动拥有明确主题、有限目标和可回看的结果。问题数量不应无限增长，追问也不应只是为了延长停留时间。每一次提问都应该帮助澄清情境、补充证据、发现矛盾或识别未知。

未来可以存在更自然的交互形式，但形式必须服务于理解闭环。无论入口是问题、记录还是对话，最终都需要回到同一原则：表达如何成为证据，证据如何支持观察，观察如何接受本人修正。

## 11. 动态自我模型与变化识别

**长期愿景**

Ather 希望逐步形成一个动态自我模型：它不是人格档案的静态集合，而是对当前证据、历史反馈、情境差异和不确定性的有组织表示。

动态意味着模型可以更新，也可以撤回旧认识。某项倾向可能长期稳定，也可能只在特定关系或压力条件下出现；两条相互冲突的证据不应被强行平均，而应保留冲突并等待更多信息。

变化识别是这一愿景中最有价值、也最需要谨慎的部分。系统若要指出“你正在改变”，必须说明比较了什么、依据是什么、变化是否超过正常波动，以及本人是否认同。没有这些条件，所谓变化只是一句有感染力但无法验证的话。

因此，正式长期画像和变化结论在科学规则、产品机制与验证条件未满足时必须保持未知。Ather 宁可暂时不回答，也不以流畅文字填补证据空缺。

## 12. 科学立场

Ather 不创造新的心理学理论，也不把工程系统包装成临床科学突破。

项目可以参考人格心理学、心理测量学、认知心理学、情绪研究、依恋研究、社会心理学、人机交互和自适应系统等已有知识，但必须区分三个层次：成熟研究可以提供概念锚点，产品机制需要独立验证，具体输出仍然只是针对当前证据的有限观察。

理论相关不等于测量有效，测量相关不等于能够诊断，模型能够生成解释也不等于解释已经得到科学证明。Ather 的科学表达必须保持这些边界。

项目真正要建立的不是术语密度，而是可重复的验证过程：同样的证据是否得到相对一致的处理，用户修正是否被正确记录，后续结果是否体现修正，以及系统在信息不足时是否能够停止推断。

## 13. 可信度如何形成

Ather 的可信度不能只来自品牌声明、模型能力或外部背书。它需要在产品行为中逐步形成。

第一，重要观察应尽量带有可回看的证据，让人知道系统为什么这样理解。第二，观察必须表达适用范围，不把局部信息扩大成完整人格。第三，系统必须允许反驳，而且反驳不能只是一个没有后果的按钮。第四，任何“越来越懂你”的主张都需要通过后续行为验证。

验证将沿着一条递进路径进行：先检查一轮体验是否有用，再检查反馈是否改善下一次体验，然后检查多轮信息是否能形成更稳定、更少矛盾的理解，最后才讨论长期变化识别。

完成率、证据查看、确认与反驳、补充质量、后续修正、复访和持续使用都可以成为产品证据，但指标本身不等于成功。只有当它们能够共同说明理解质量正在提高，才支持更强的项目结论。

## 14. 人的判断权与系统责任

Ather 可以提供观察、问题和可能的解释，但最终判断权属于本人。系统不应利用权威语气迫使人接受结论，也不应把反驳视为用户“不够了解自己”。

人的反馈同样不是自动正确的最终答案。自我理解本身可能矛盾、变化或受到当下情绪影响。Ather 的责任不是在“系统正确”和“本人正确”之间简单二选一，而是保留不同证据，清楚表达冲突，并在新的情境中继续检验。

与个人有关的信息越丰富，系统越需要遵守目的限制、最少必要和可追溯原则。哪些信息被用于哪次理解、系统增加了什么解释、本人做过哪些修正，应在产品能力逐步完善时保持清楚。尚未实现的控制能力不能提前写成已经兑现的承诺。

## 15. 医疗、心理与安全边界

Ather 不是医疗、精神医学、心理诊断或治疗服务，不替代医生、心理咨询师或其他合格专业人士。

项目不诊断疾病，不根据有限表达判断精神健康状态，不声称识别具体神经机制，也不会把研究概念直接转化成临床结论。任何涉及危机、伤害或紧急风险的情况，都应寻求当地紧急服务或合格专业支持。

这条边界并不削弱 Ather 的意义。自我探索、记录证据、发现矛盾、表达变化和修正理解，本身就是有价值的产品空间。Ather 的目标是把这一空间做好，而不是通过越界获得更强烈的宣传效果。

## 16. 项目演进路线

**现在**

把主题轮、观察、证据、边界、反馈和轮次历史做成一个完整且可信的最小闭环。重点不是增加更多功能，而是确保每一项理解都能被看见、回应和保存。

**下一阶段**

验证反馈能否真正改善后续体验：系统是否记住了正确的内容，是否避免重复已经被反驳的解释，是否能在相似主题中使用新的上下文，以及这种变化是否能被本人感知。

**更长期**

在证据、校准和科学规则成熟之后，再建立跨轮次的动态自我模型与变化识别。长期能力必须从已经验证的较小能力生长出来，不能通过提前命名一个宏大概念来假装完成。

路线可以调整，但顺序不能颠倒：先让一次理解可信，再让多次理解连续，最后才让时间产生洞察。

## 17. 差异化、风险与克制

Ather 的差异化不在题库、界面风格或某个模型。题目可以被模仿，界面可以被复制，模型也会快速变化。真正困难的是让证据、解释、反馈、修正和时间形成一个持续可用的闭环。

这个方向同时存在明确风险：系统可能过度推断，科学语言可能被营销放大，历史信息可能被错误固化，不同模块可能对同一个人给出相互矛盾的说法，流畅表达也可能掩盖证据不足。

因此，Ather 当前不应把重点放在无限扩张题库、制造神秘评分、追逐花哨交互、假装临床专业，或用宏大概念遮盖尚未完成的验证。项目需要的不是看起来无所不能，而是在有限范围内持续做到真实、透明和可纠正。

克制不是保守。它是在为更长期的能力保留可信基础。

## 18. 终极目标：从自我探索到智能增强

Ather 的终极目标不是生成一份关于人的报告，而是帮助人建立一种更持续、更清晰的自我认识能力。

当系统能够保存证据而不把历史固化成标签，能够提出观察而不夺走人的判断权，能够接受修正并在时间中重新检验，它就不再只是测评工具。它开始成为一种心智镜像：让人看见自己如何思考、如何选择、如何在关系和环境中变化。

再向前一步，Ather 所追求的是 Intelligence Amplification——不是用人工智能代替人的判断，而是增强人理解自己、发现盲点、辨认变化和作出选择的能力。

这个目标不会由一句口号完成。它只能从每一次有依据的观察、每一次被认真处理的反驳、每一次对不确定性的诚实表达中逐步建立。

Ather 想成为的，不是一个替你回答“你是谁”的系统。

它是一面会随证据更新、会接受你纠正、也能陪你看见变化的镜子。`,
  en: `# Ather Public Whitepaper

> Version note: this public document explains Ather’s product principles, current experience, and validation direction for users, partners, and investors. It does not disclose model parameters, prompts, question banks, thresholds, or internal system configuration.

## 1. Why Ather

People change, and so do their circumstances. One test or one interpretation should not define a person.

Ather aims to turn your real expressions, observations, and feedback over time into a self-understanding process you can revisit.

## 2. We do not label people

Ather does not provide medical or psychological diagnoses, and it does not place you in a fixed personality category.

Every conclusion should be treated as a current, limited understanding. You can add to it, challenge it, or correct it.

## 3. What you can experience today

The current formal experience begins with a themed round of 6–8 questions. When it ends, you can see the observations from that round, the evidence that supports them, and their limits.

You can confirm, partly agree, disagree, or add your perspective. That feedback is saved and appears in your round history.

## 4. Evidence and correction

Ather is not here to make final judgments about you. Its direction is to make the basis for an interpretation visible and open to correction.

Example: you say, “It is not that I dislike socializing; I dislike unplanned gatherings.” A good system should not cling to its earlier interpretation. It should treat that addition as one input for understanding you later.

Feedback is recorded today. Exactly which feedback should shape later understanding, when it should do so, and how that change should be shown are product questions we are still validating.

## 5. Boundaries matter more than promises

Ather is not a medical, psychiatric, psychological, or therapeutic service, and it does not replace professional support.

An observation from one current round is not a formal long-term portrait. Until its scientific rules are approved, a formal long-term portrait must remain unknown rather than be made to sound certain.

If you need medical, crisis, or urgent support, contact a qualified professional or your local emergency services.

## 6. The long-term value we are testing

Our hypothesis is that self-exploration becomes more useful than a one-off test when people can see the basis, correct misunderstandings, and later feel that the system has learned something from them.

That is a hypothesis to validate, not a completed promise. We will first establish whether one round is useful, then whether continued use leads to clearer understanding.

## 7. You keep the final judgment

Ather’s role is to offer observations and questions, not to decide who you are.

We treat explainability, the ability to challenge an interpretation, and honest uncertainty as product principles. User feedback belongs in the understanding process; it is not an exception to ignore.

## 8. How we will validate value

We will look at whether people complete themed rounds; read and use the evidence in their results; confirm, challenge, or add context; see recorded feedback reflected in later experiences; and choose to return.

These are a validation plan, not public claims about business or scientific results. Stronger claims will be supported only by evidence we have actually validated.

## 9. For partners and investors

Ather’s opportunity is not another test or chat window. It is a credible, correctable self-understanding experience that can accumulate over time.

Its business value depends on three conditions that still need proof: whether people return, whether feedback makes the next experience more useful, and whether that continued value is worth paying for. We will answer those questions with product behavior and real data, not opaque scores or untestable model stories.`,
  ja: `# Ather 公開ホワイトペーパー

> 版について：これはユーザー、パートナー、投資家に向けた公開説明です。Ather の製品原則、現在の体験、検証の方向性を説明します。モデルのパラメータ、プロンプト、設問バンク、しきい値、内部システムの設定は公開しません。

## 1. なぜ Ather なのか

人は変わり、置かれる状況も変わります。一度のテストや一度の解釈で、その人を定義するべきではありません。

Ather は、あなた自身の言葉、観察、フィードバックを、あとから見返せる自己理解のプロセスにしていくことを目指します。

## 2. 私たちはラベルを貼りません

Ather は医療的・心理的な診断を提供せず、あなたを固定された性格タイプに分類しません。

どの結論も、その時点での限られた理解として扱うべきです。補足、反論、修正ができます。

## 3. 現在体験できること

現在の正式な体験は、テーマに沿った 6〜8 問の質問から始まります。完了すると、その回の観察、それを支える根拠、そして限界を確認できます。

あなたは「合っている」「一部は合っている」「合っていない」を示したり、自分の見方を補足したりできます。フィードバックは保存され、回ごとの履歴に表示されます。

## 4. 根拠と修正

Ather の役割は、あなたについて最終判断を下すことではありません。解釈の根拠を見えるようにし、修正を受け入れることを目指します。

例：「人付き合いが嫌いなのではなく、準備のない集まりが苦手です」とあなたが言ったとします。良いシステムは以前の解釈に固執せず、この補足を後であなたを理解するための一つの材料として扱うべきです。

現在、フィードバックは記録されます。どのフィードバックが後の理解に影響するべきか、いつ影響するか、その変化をどう見せるかは、私たちが引き続き検証する製品課題です。

## 5. 約束よりも境界を大切にする

Ather は医療、精神医療、心理支援、治療のサービスではなく、専門家による支援の代わりにはなりません。

現在の一回の観察は、正式な長期ポートレートではありません。科学的なルールが承認されるまでは、正式な長期ポートレートは不明のままにすべきで、確かなように見せかけるべきではありません。

医療、危機対応、緊急の支援が必要なときは、有資格の専門家または地域の緊急サービスに連絡してください。

## 6. 私たちが検証している長期的な価値

根拠を確認でき、誤解を修正でき、後の体験でシステムが何かを学んだと感じられるなら、自己探索は一度きりのテストより役立つものになる。これが私たちの仮説です。

これは検証すべき仮説であり、すでに果たされた約束ではありません。まず一回の体験が役立つかを確かめ、その後、継続利用がより明確な自己理解につながるかを検証します。

## 7. 最後に判断するのはあなたです

Ather の役割は観察と問いを提供することであり、あなたが誰かを決めることではありません。

説明できること、解釈に異議を唱えられること、不確かさを正直に扱うことを、私たちは製品原則と考えます。ユーザーのフィードバックは理解のプロセスの一部であり、無視すべき例外ではありません。

## 8. 価値をどう検証するか

テーマラウンドを完了するか、結果にある根拠を読み使うか、確認・反論・補足を行うか、記録されたフィードバックが後の体験に反映されるか、そしてまた戻ってくるかを見ます。

これは検証計画であって、事業や科学に関する対外的な実績の主張ではありません。より強い主張は、実際に検証できた根拠だけで支えます。

## 9. パートナーと投資家の皆さまへ

Ather の機会は、もう一つのテストやチャット画面を作ることではありません。時間とともに積み重なり、修正でき、信頼できる自己理解の体験をつくることです。

事業価値は、まだ証明が必要な三つの条件にかかっています。人が繰り返し戻ってくるか、フィードバックが次の体験をより役立つものにするか、そしてその継続的な価値に対価を払う意思があるかです。私たちは不透明なスコアや検証不能なモデルの物語ではなく、製品上の行動と実データで答えます。`,
  es: `# Whitepaper público de Ather

> Nota de versión: este documento público explica los principios de producto, la experiencia actual y la dirección de validación de Ather para usuarios, socios e inversores. No revela parámetros de modelo, prompts, bancos de preguntas, umbrales ni configuración interna del sistema.

## 1. Por qué Ather

Las personas cambian, y sus circunstancias también. Un test o una interpretación no deberían definirte.

Ather busca convertir tus expresiones, observaciones y comentarios a lo largo del tiempo en un proceso de autoconocimiento al que puedas volver.

## 2. No te ponemos etiquetas

Ather no ofrece diagnósticos médicos o psicológicos ni te clasifica en una categoría fija de personalidad.

Toda conclusión debe tratarse como una comprensión actual y limitada. Puedes añadir contexto, cuestionarla o corregirla.

## 3. Lo que puedes experimentar hoy

La experiencia formal actual comienza con una ronda temática de 6 a 8 preguntas. Al terminar, puedes ver las observaciones de esa ronda, la evidencia que las respalda y sus límites.

Puedes confirmar, estar parcialmente de acuerdo, discrepar o añadir tu perspectiva. Esos comentarios se guardan y aparecen en tu historial de rondas.

## 4. Evidencia y corrección

Ather no está para emitir un juicio final sobre ti. Su dirección es hacer visible la base de una interpretación y dejarla abierta a corrección.

Ejemplo: dices: «No es que no me guste socializar; no me gustan las reuniones sin preparación». Un buen sistema no debería aferrarse a su interpretación anterior. Debería tratar ese matiz como un elemento para comprenderte más adelante.

Hoy se registran los comentarios. Qué comentarios deberían influir en la comprensión posterior, cuándo deberían hacerlo y cómo debería mostrarse ese cambio son preguntas de producto que seguimos validando.

## 5. Los límites importan más que las promesas

Ather no es un servicio médico, psiquiátrico, psicológico ni terapéutico, y no sustituye el apoyo profesional.

La observación de una ronda actual no es un retrato formal a largo plazo. Hasta que se aprueben sus reglas científicas, un retrato formal a largo plazo debe permanecer como desconocido, en vez de presentarse como algo seguro.

Si necesitas apoyo médico, ante una crisis o con urgencia, contacta a un profesional cualificado o a los servicios de emergencia de tu localidad.

## 6. El valor a largo plazo que estamos comprobando

Nuestra hipótesis es que la autoexploración será más útil que un test puntual si puedes ver la base, corregir malentendidos y sentir en experiencias posteriores que el sistema ha aprendido algo de ti.

Es una hipótesis por validar, no una promesa ya cumplida. Primero comprobaremos si una ronda es útil y después si el uso continuado conduce a un autoconocimiento más claro.

## 7. Tú mantienes el juicio final

El papel de Ather es ofrecer observaciones y preguntas, no decidir quién eres.

Consideramos principios de producto que una interpretación se pueda explicar, cuestionar y que la incertidumbre se trate con honestidad. Tus comentarios forman parte del proceso de comprensión; no son una excepción que deba ignorarse.

## 8. Cómo validaremos el valor

Observaremos si las personas completan rondas temáticas; leen y usan la evidencia de sus resultados; confirman, cuestionan o añaden contexto; ven sus comentarios registrados reflejados en experiencias posteriores; y eligen volver.

Esto es un plan de validación, no una afirmación pública sobre resultados de negocio o científicos. Solo usaremos evidencia realmente validada para sostener afirmaciones más fuertes.

## 9. Para socios e inversores

La oportunidad de Ather no es crear otro test o una ventana de chat. Es crear una experiencia de autoconocimiento creíble, corregible y acumulativa con el tiempo.

Su valor de negocio depende de tres condiciones que aún debemos demostrar: que las personas vuelvan, que los comentarios hagan más útil la siguiente experiencia y que ese valor continuado merezca un pago. Responderemos con comportamiento de producto y datos reales, no con puntuaciones opacas ni relatos de modelos imposibles de comprobar.`,
};

// The current public whitepaper is intentionally kept separate from the
// historical and short-form drafts above. Each locale carries the same product
// claims, boundaries, and 18-section structure in culturally natural language.
const PUBLIC_WHITEPAPERS: Record<Locale, string> = {
  'zh-CN': SHORT_PUBLIC_WHITEPAPERS['zh-CN'],
  en: `# Ather Whitepaper

> Ather is an evolving system for self-exploration. It connects a person’s expression, the system’s observations, revisitable evidence, and the person’s own corrections—so self-understanding does not end with a single test or a fixed label.

## 1. The starting point: people do not remain one version of themselves

People change through experience, relationships, pressure, choices, and time. An answer can be truthful today without representing someone six months from now. A strong reaction in one situation may not be a stable trait. One-off tests commonly compress this complexity into a score, a type, or a conclusion, then stop precisely where further inquiry matters most.

Ather begins with a different question: what if understanding a person were not a one-time judgment, but a process that can accumulate evidence, accept correction, and revisit what it thought it knew?

The project is not about making a more appealing label. It is about helping people see how they make choices, respond to situations, what remains relatively stable, and what is changing.

## 2. What Ather is

Ather is a computational system built around structured self-exploration, visible evidence, personal feedback, and time.

It does not try to summarize a person in one sentence. It separates each act of understanding into inspectable parts: what was observed, what supports it, what remains unknown, whether the person agrees, and whether the interpretation should later be revised.

At the current stage, Ather concentrates on making one exploration round clear. Its longer direction is to organize repeated interactions into an updateable, traceable model of self—only when there is enough evidence and validation to do so honestly.

## 3. The central proposition: understanding is not defining

Ather treats each output as an observation or hypothesis, not a final identity judgment.

The same words can mean different things in different lives. Similar behaviour can arise from entirely different motives. Avoiding a gathering may reflect a need for solitude, lack of preparation, an unsafe relationship, or simple exhaustion. A label can feel concise while erasing the context that matters.

That is why Ather holds three principles: conclusions must be limited, their basis must be visible, and interpretations must be open to challenge. The closer a system gets to someone’s inner life, the more carefully it must state what it knows, what it does not know, and why it currently sees things this way.

## 4. No labels, and no illusion of being perfectly seen

Ather does not treat fixed personality categories as an end point, nor does it rely on vague statements that create a feeling of accuracy.

“You sometimes enjoy solitude, yet want to be understood” may apply to many people while explaining no one. Ather is concerned with concrete evidence: which expression supports an observation, which context it applies to, what contradicts it, and how the person explains it.

An honest system can say that information is insufficient, that an observation belongs only to the present theme, or that new context changed an earlier interpretation. Uncertainty is not a weakness to hide; it is a basic safeguard against overreach.

## 5. The current formal experience

**Available now**

Ather’s current formal experience begins with a themed round of 6–8 questions. The purpose is not to collect as much information as possible, but to explore a defined theme through choices, feelings, reasons, and real situations.

At the end, Ather presents observations from that round, the evidence that supports them, and what those observations cannot establish. A person can confirm, partly agree, disagree, or add their own account. Feedback is saved with the relevant round and appears in its history.

The immediate goal is precise: establish whether one limited interpretation can be clear, grounded, and answerable. Ather does not turn a single round into a complete personality, or present a current observation as an established long-term portrait.

## 6. The smallest unit of understanding

Ather treats observation, evidence, boundary, and feedback as its smallest unit of understanding.

- Observation: what the system notices in the current round.
- Evidence: which original expressions or choices support that observation.
- Boundary: where the observation applies and what is still unknown.
- Feedback: whether the person confirms, partly confirms, challenges, or adds context.

These parts belong together. An observation without evidence can become a black-box judgment. Evidence without a boundary can lead to overreach. A conclusion without feedback loses its most important source of calibration.

For Ather, the basic object is therefore not a mysterious score. It is an understanding record that can be examined, discussed, and updated.

## 7. Evidence, feedback, and correction

Ather is not trying to prove that a system is always right. It is trying to build a way to find mistakes, accept them, and preserve the path of correction.

For example, someone might say: “It is not that I dislike socializing; I dislike unplanned gatherings.” This is not a minor edit. It may change the interpretation from low social interest to a need for predictability, energy management, or sensitivity to losing control. A good system should not cling to the earlier label. It should record the new evidence and revisit the interpretation when relevant information appears later.

**Under validation**

The current product can save feedback. Which feedback should influence later understanding, how far that influence should extend, when an older observation has become outdated, and how change should be shown clearly still require product experiments and real evidence.

## 8. Why time is necessary

Without time, a system sees fragments. With time, it may begin to distinguish relatively stable tendencies, short-term states, exceptional events, and genuine change.

An expression may be shaped by fatigue, conflict, or surroundings. The same theme, revisited in another period, may mean something entirely different. Ather’s long-term value cannot come from storing more words; it must come from understanding relationships over time: what persists, what occurs once, what is strengthening, and what new evidence has overturned.

Time also brings greater responsibility. Historical information is not automatically valid forever. An old conclusion does not gain authority merely because it was saved. Any long-term understanding must be allowed to expire, conflict, weaken, and be confirmed again.

## 9. Ather’s Conceptual Architecture

Ather’s public conceptual architecture has five mutually constraining layers.

- Structured exploration: questions within a limited theme that elicit contextual expression.
- Evidence: original grounds for an observation, kept distinct from the system’s interpretation.
- Understanding: limited observations with their scope and uncertainty.
- Calibration: confirmation, challenge, and added context that allow the person to participate in correction.
- Time: comparison across rounds, when conditions are mature enough to examine stability, conflict, and change.

This is not a one-way pipeline. It is a loop. New feedback may require old observations to be revisited; a new situation may alter what earlier evidence means; a later round may show that an earlier interpretation belonged only to a particular period.

Ather does not publish prompts, full question banks, parameters, weights, thresholds, model routing, or internal interfaces. These implementation details change and are not the source of trust. What must be tested is whether the system shows its basis, respects feedback, states boundaries properly, and improves later understanding as a result.

## 10. Structured exploration, not endless chat

Free conversation can produce rich expression, but richness is not the same as understanding or verification. A system that only keeps chatting and producing sympathetic-sounding replies can become companionship without a coherent record of understanding.

Ather uses structured exploration so each round has a clear theme, a limited aim, and a result that can be revisited. Questions should not grow without limit, and follow-ups should not exist merely to extend an interaction. Each one should clarify context, add evidence, surface contradiction, or identify what remains unknown.

More natural forms of interaction may exist in the future, but form must serve the understanding loop. Whether the entry point is a question, a record, or a conversation, it must return to the same discipline: how expression becomes evidence, how evidence supports observation, and how observation accepts correction.

## 11. Dynamic self-models and recognising change

**Long-term direction**

Ather aims, step by step, to form a dynamic self-model. It is not a static profile of personality traits. It is an organized representation of current evidence, past feedback, contextual differences, and uncertainty.

Dynamic means that a model can update and can withdraw an earlier view. A tendency may be stable over time, or may appear only in particular relationships or under pressure. Two conflicting pieces of evidence should not be forced into an average; the conflict should remain visible while more information is gathered.

Recognising change is one of the most valuable and most demanding parts of this direction. If Ather ever says that someone is changing, it must show what was compared, what evidence supports the comparison, whether the difference exceeds ordinary variation, and whether the person recognizes it. Without those conditions, “you have changed” is only an evocative sentence, not a verifiable observation.

Formal long-term portraits and change conclusions must remain unknown until scientific rules, product mechanisms, and validation conditions are in place. Ather should prefer not answering to filling an evidence gap with fluent language.

## 12. Scientific position

Ather does not claim to invent a new psychological theory, and it does not present an engineering system as a clinical breakthrough.

The project may draw conceptual anchors from personality psychology, psychometrics, cognitive psychology, emotion research, attachment research, social psychology, human-computer interaction, and adaptive systems. But three levels must remain distinct: established research can inform concepts, product mechanisms need independent validation, and a specific output is still only a limited observation based on present evidence.

Theoretical relevance is not measurement validity. Measurement relevance is not diagnosis. A model’s ability to produce an explanation is not proof that the explanation is scientifically established.

What Ather needs is not dense terminology but a repeatable validation process: whether similar evidence receives reasonably consistent treatment, whether corrections are recorded correctly, whether later results reflect them, and whether the system can stop inferring when information is insufficient.

## 13. How credibility is built

Ather’s credibility cannot rest only on brand claims, model capability, or external endorsement. It must emerge from product behaviour.

Important observations should be accompanied, where possible, by revisitable evidence. Their scope should be stated instead of expanding local information into a whole person. The system must permit challenge, and challenge cannot be a button with no consequence. Any claim that Ather understands someone better over time must be shown in later behaviour.

Validation follows an order: first, whether one round is useful; then, whether feedback improves the next experience; then, whether repeated rounds form a more stable and less contradictory understanding; only after that, whether longer-term change can be recognized.

Completion, evidence viewing, confirmation and challenge, the quality of added context, later correction, return, and sustained use can all contribute product evidence. No single metric equals success. Stronger conclusions require these signals together to show that the quality of understanding is improving.

## 14. Human judgment and system responsibility

Ather can offer observations, questions, and possible explanations, but final judgment remains with the person. The system should not use an authoritative tone to force acceptance, or treat challenge as a sign that someone does not know themselves well enough.

Personal feedback is not automatically a final truth either. Self-understanding can be conflicting, changing, or shaped by a present emotional state. Ather’s responsibility is not to choose simplistically between “the system is right” and “the person is right,” but to preserve distinct evidence, state conflict clearly, and continue examining it in new contexts.

The richer the information about a person becomes, the more the system must follow purpose limitation, data minimization, and traceability. As product controls mature, it should remain clear which information informed an interpretation, what explanation the system added, and what corrections were made. Unbuilt controls must not be presented as promises already kept.

## 15. Medical, psychological, and safety boundaries

Ather is not a medical, psychiatric, psychological diagnostic, or therapeutic service. It does not replace doctors, therapists, or other qualified professionals.

The project does not diagnose illness, infer mental-health status from limited expression, claim to identify specific neural mechanisms, or turn research concepts directly into clinical conclusions. Situations involving crisis, harm, or urgent risk require local emergency services or qualified professional support.

This boundary does not reduce Ather’s purpose. Self-exploration, recording evidence, finding contradiction, expressing change, and revising understanding are valuable areas in their own right. Ather aims to serve them well, not to make stronger claims by crossing a line.

## 16. Project path

**Now**

Make themed rounds, observations, evidence, boundaries, feedback, and round history into one complete and credible minimum loop. The priority is not adding more features, but ensuring that each interpretation can be seen, answered, and saved.

**Next**

Test whether feedback genuinely improves the next experience: whether the system remembers the right context, avoids repeating an interpretation that was challenged, uses new context in similar themes, and makes that change perceptible.

**Later**

Only after evidence, calibration, and scientific rules mature should Ather build cross-round dynamic self-models and change recognition. Long-term capability must grow out of smaller capabilities that have been verified, not out of a grand name announced in advance.

The order matters: first make one interpretation credible, then make repeated interpretations continuous, then let time produce insight.

## 17. Difference, risk, and restraint

Ather’s difference is not a question bank, a visual style, or a particular model. Questions can be copied, interfaces can be reproduced, and models change quickly. The hard part is making evidence, explanation, feedback, correction, and time into a loop that stays useful.

The direction also carries clear risks: the system may over-infer; scientific language may be amplified by marketing; historical information may become wrongly fixed; different components may contradict one another; fluent language may conceal insufficient evidence.

For that reason, Ather should not currently prioritize endlessly expanding questions, mysterious scores, decorative interaction, a false appearance of clinical authority, or grand language that conceals unfinished validation. The project does not need to appear all-powerful. It needs to remain real, transparent, and correctable within a limited scope.

Restraint is not conservatism. It protects the basis for longer-term capability.

## 18. Ultimate Goal: From Self-Exploration to Intelligence Amplification

Ather’s ultimate goal is not to generate a report about a person. It is to help people build a more continuous and clearer capacity to understand themselves.

When a system can preserve evidence without freezing history into labels, offer observations without taking away human judgment, accept correction, and re-examine itself over time, it becomes more than an assessment tool. It begins to act as a mind mirror: helping people see how they think, choose, and change in relationships and environments.

The further aim is Intelligence Amplification—not artificial intelligence replacing human judgment, but technology strengthening a person’s ability to understand themselves, notice blind spots, recognize change, and make choices.

This goal will not be achieved by a slogan. It can only be built through every observation grounded in evidence, every challenge treated seriously, and every honest statement of uncertainty.

Ather is not trying to answer “who are you?” on someone’s behalf.

It is trying to become a mirror that updates with evidence, accepts correction, and helps a person see change.`,
  es: `# Whitepaper de Ather

> Ather es un sistema de autoexploración que evoluciona. Conecta la expresión de una persona, las observaciones del sistema, la evidencia que se puede revisar y las correcciones de la propia persona, para que el autoconocimiento no termine en un test puntual ni en una etiqueta fija.

## 1. El punto de partida: nadie permanece en una sola versión de sí mismo

Las personas cambian con las experiencias, las relaciones, la presión, las decisiones y el tiempo. Una respuesta puede ser verdadera hoy sin representar a alguien dentro de seis meses. Una reacción intensa en un contexto no tiene por qué ser un rasgo estable. Los tests de una sola vez suelen comprimir esta complejidad en una puntuación, un tipo o una conclusión y se detienen justo donde convendría seguir preguntando.

Ather parte de otra pregunta: ¿qué ocurriría si comprender a una persona no fuera un juicio único, sino un proceso que acumula evidencia, acepta correcciones y vuelve a examinar lo que creía saber?

El proyecto no busca fabricar una etiqueta más atractiva. Busca ayudarte a ver cómo eliges, cómo respondes a las situaciones, qué permanece relativamente estable y qué está cambiando.

## 2. Qué es Ather

Ather es un sistema computacional basado en autoexploración estructurada, evidencia visible, comentarios personales y tiempo.

No intenta resumirte en una frase. Separa cada acto de comprensión en partes que puedes examinar: qué se observó, qué lo respalda, qué sigue siendo desconocido, si estás de acuerdo y si la interpretación debe revisarse más adelante.

En su etapa actual, Ather se concentra en que una ronda de exploración sea clara. Su dirección a largo plazo es organizar interacciones repetidas en un modelo de sí mismo actualizable y rastreable, solo cuando haya evidencia y validación suficientes para hacerlo con honestidad.

## 3. La idea central: comprender no es definir

Ather trata cada resultado como una observación o una hipótesis, no como un juicio final sobre tu identidad.

Las mismas palabras pueden significar cosas distintas en vidas distintas. Conductas parecidas pueden nacer de motivaciones completamente diferentes. Evitar una reunión puede reflejar necesidad de soledad, falta de preparación, una relación insegura o simple agotamiento. Una etiqueta parece breve, pero puede borrar el contexto importante.

Por eso Ather sostiene tres principios: las conclusiones deben ser limitadas, su base debe ser visible y las interpretaciones deben poder cuestionarse. Cuanto más se acerca un sistema a la vida interior de alguien, más cuidado debe tener al decir qué sabe, qué no sabe y por qué ve las cosas de esa manera por ahora.

## 4. Sin etiquetas ni ilusión de que el sistema te conoce por completo

Ather no toma las categorías fijas de personalidad como meta ni se apoya en frases vagas para generar una sensación de precisión.

«A veces disfrutas la soledad, pero también quieres que te comprendan» podría aplicarse a muchas personas y no explicar a ninguna. Ather se interesa por evidencia concreta: qué expresión apoya una observación, en qué contexto aplica, qué la contradice y cómo la explica la propia persona.

Un sistema honesto puede decir que falta información, que una observación solo corresponde al tema de esta ronda o que un nuevo contexto cambió una interpretación anterior. La incertidumbre no es una debilidad que se deba ocultar: es una protección básica contra la exageración.

## 5. La experiencia formal actual

**Disponible ahora**

La experiencia formal actual de Ather comienza con una ronda temática de 6 a 8 preguntas. No busca recoger la mayor cantidad posible de datos, sino explorar un tema definido mediante decisiones, sentimientos, razones y situaciones reales.

Al terminar, Ather presenta las observaciones de esa ronda, la evidencia que las respalda y lo que esas observaciones no permiten afirmar. Puedes confirmar, estar parcialmente de acuerdo, discrepar o añadir tu propia explicación. Los comentarios se guardan con la ronda correspondiente y aparecen en su historial.

El objetivo inmediato es concreto: comprobar si una interpretación limitada puede ser clara, fundamentada y respondible. Ather no convierte una sola ronda en una personalidad completa ni presenta una observación actual como un retrato establecido a largo plazo.

## 6. La unidad mínima de comprensión

Ather considera observación, evidencia, límite y comentario como su unidad mínima de comprensión.

- Observación: qué detecta el sistema en la ronda actual.
- Evidencia: qué expresiones o decisiones originales respaldan esa observación.
- Límite: a qué alcance aplica la observación y qué sigue siendo desconocido.
- Comentario: si la persona confirma, confirma en parte, cuestiona o añade contexto.

Estas partes deben ir juntas. Una observación sin evidencia puede convertirse en un juicio de caja negra. Evidencia sin límite puede llevar a una inferencia excesiva. Una conclusión sin comentarios pierde su fuente más importante de calibración.

Para Ather, lo básico no es una puntuación misteriosa, sino un registro de comprensión que puede revisarse, conversarse y actualizarse.

## 7. Evidencia, comentarios y corrección

Ather no intenta demostrar que un sistema siempre tiene razón. Intenta construir una manera de detectar errores, aceptarlos y conservar el recorrido de la corrección.

Por ejemplo, alguien puede decir: «No es que no me guste socializar; no me gustan las reuniones sin preparación». No es una modificación menor. Puede cambiar la interpretación de poco interés social a una necesidad de previsibilidad, gestión de energía o sensibilidad a perder el control. Un buen sistema no debería aferrarse a la etiqueta anterior. Debería registrar la nueva evidencia y volver a examinar la interpretación cuando aparezca información relevante.

**En validación**

El producto actual puede guardar comentarios. Qué comentarios deberían influir en la comprensión posterior, hasta dónde debería llegar esa influencia, cuándo una observación anterior ha quedado desactualizada y cómo mostrar el cambio con claridad son cuestiones que aún requieren experimentos de producto y evidencia real.

## 8. Por qué el tiempo es necesario

Sin tiempo, un sistema solo ve fragmentos. Con tiempo puede empezar a distinguir tendencias relativamente estables, estados de corto plazo, acontecimientos excepcionales y cambios reales.

Una expresión puede estar influida por el cansancio, un conflicto o el entorno. El mismo tema, revisado en otra etapa, puede significar algo completamente diferente. El valor a largo plazo de Ather no puede venir de guardar más palabras; debe venir de comprender relaciones a lo largo del tiempo: qué persiste, qué ocurrió una vez, qué se intensifica y qué ha sido refutado por nueva evidencia.

El tiempo también implica más responsabilidad. La información histórica no es válida para siempre por defecto. Una conclusión antigua no gana autoridad solo por estar guardada. Toda comprensión a largo plazo debe poder caducar, entrar en conflicto, perder fuerza y confirmarse de nuevo.

## 9. La arquitectura conceptual de Ather

La arquitectura conceptual pública de Ather tiene cinco capas que se limitan entre sí.

- Exploración estructurada: preguntas dentro de un tema limitado para obtener expresión con contexto.
- Evidencia: bases originales de una observación, separadas de la interpretación del sistema.
- Comprensión: observaciones limitadas con su alcance y su incertidumbre.
- Calibración: confirmación, cuestionamiento y contexto añadido para que la persona participe en la corrección.
- Tiempo: comparación entre rondas cuando las condiciones permiten examinar estabilidad, conflicto y cambio.

No es una cadena de una sola dirección, sino un ciclo. Un comentario nuevo puede exigir revisar una observación anterior; una situación nueva puede cambiar el sentido de una evidencia; una ronda posterior puede mostrar que una interpretación pertenecía solo a un periodo concreto.

Ather no publica prompts, bancos completos de preguntas, parámetros, pesos, umbrales, rutas de modelos ni interfaces internas. Estos detalles cambian y no son la fuente de confianza. Lo que debe comprobarse es si el sistema muestra su base, respeta los comentarios, expresa bien sus límites y mejora la comprensión posterior.

## 10. Exploración estructurada, no conversación infinita

La conversación libre puede producir expresión rica, pero riqueza no equivale a comprensión ni a validación. Un sistema que solo continúa conversando y genera respuestas que suenan empáticas puede convertirse en compañía sin un registro coherente de comprensión.

Ather usa exploración estructurada para que cada ronda tenga un tema claro, un objetivo limitado y un resultado que pueda revisarse. Las preguntas no deberían crecer sin límite y los seguimientos no deberían existir solo para prolongar la interacción. Cada uno debe aclarar contexto, añadir evidencia, revelar contradicción o identificar lo desconocido.

En el futuro pueden existir formas más naturales de interacción, pero la forma debe servir al ciclo de comprensión. Ya sea una pregunta, un registro o una conversación, todo debe volver a la misma disciplina: cómo la expresión se convierte en evidencia, cómo la evidencia respalda una observación y cómo la observación acepta corrección.

## 11. Modelo dinámico de sí mismo y reconocimiento del cambio

**Dirección a largo plazo**

Ather aspira a formar paso a paso un modelo dinámico de sí mismo. No es un perfil estático de rasgos; es una representación organizada de evidencia actual, comentarios anteriores, diferencias de contexto e incertidumbre.

Dinámico significa que el modelo puede actualizarse y también retirar una visión anterior. Una tendencia puede ser estable o aparecer solo en determinadas relaciones o bajo presión. Dos evidencias que entran en conflicto no deberían forzarse a un promedio: el conflicto debe seguir visible mientras se reúne más información.

Reconocer cambios es una de las partes más valiosas y exigentes de esta dirección. Si Ather llega a decir que alguien está cambiando, debe mostrar qué comparó, qué evidencia respalda la comparación, si la diferencia supera la variación ordinaria y si la propia persona la reconoce. Sin estas condiciones, «has cambiado» es una frase sugerente, no una observación verificable.

Los retratos formales a largo plazo y las conclusiones sobre cambios deben permanecer desconocidos hasta que existan reglas científicas, mecanismos de producto y condiciones de validación. Ather debe preferir no responder antes que rellenar una falta de evidencia con lenguaje fluido.

## 12. Posición científica

Ather no afirma inventar una teoría psicológica nueva ni presenta un sistema de ingeniería como un avance clínico.

El proyecto puede tomar referencias conceptuales de la psicología de la personalidad, la psicometría, la psicología cognitiva, la investigación sobre emoción y apego, la psicología social, la interacción persona-ordenador y los sistemas adaptativos. Pero hay que distinguir tres niveles: la investigación consolidada puede orientar conceptos, los mecanismos de producto necesitan validación independiente y un resultado concreto sigue siendo una observación limitada basada en evidencia actual.

La relevancia teórica no equivale a validez de medida. La relevancia de medida no equivale a diagnóstico. Que un modelo pueda generar una explicación no prueba que esa explicación esté establecida científicamente.

Ather no necesita acumular jerga, sino un proceso repetible de validación: comprobar si evidencia similar recibe un tratamiento razonablemente consistente, si las correcciones se registran bien, si los resultados posteriores las reflejan y si el sistema puede dejar de inferir cuando falta información.

## 13. Cómo se construye la credibilidad

La credibilidad de Ather no puede depender solo de una marca, de la capacidad de un modelo o de respaldo externo. Debe surgir del comportamiento del producto.

Las observaciones importantes deberían ir acompañadas, cuando sea posible, de evidencia revisable. Deben declarar su alcance en vez de convertir información local en una persona completa. El sistema tiene que permitir cuestionamientos, y cuestionar no puede ser un botón sin consecuencias. Cualquier afirmación de que Ather comprende mejor con el tiempo debe reflejarse en el comportamiento posterior.

La validación sigue un orden: primero, si una ronda es útil; después, si los comentarios mejoran la siguiente experiencia; luego, si rondas repetidas forman una comprensión más estable y menos contradictoria; solo entonces, si se puede reconocer el cambio a largo plazo.

Finalizar rondas, revisar evidencia, confirmar y cuestionar, la calidad del contexto añadido, correcciones posteriores, volver y continuar usando el producto pueden aportar evidencia. Ninguna métrica por sí sola equivale al éxito. Las conclusiones más fuertes necesitan que estas señales muestren juntas una mejora de la calidad de comprensión.

## 14. Juicio humano y responsabilidad del sistema

Ather puede ofrecer observaciones, preguntas y explicaciones posibles, pero el juicio final sigue siendo de la persona. El sistema no debe usar un tono de autoridad para forzar aceptación ni tratar el cuestionamiento como señal de que alguien no se conoce suficientemente.

Los comentarios personales tampoco son automáticamente una verdad definitiva. El autoconocimiento puede ser contradictorio, cambiar o estar influido por un estado emocional presente. La responsabilidad de Ather no es elegir de forma simple entre «el sistema tiene razón» y «la persona tiene razón», sino conservar evidencias distintas, expresar el conflicto con claridad y seguir examinándolo en nuevos contextos.

Cuanto más rica sea la información sobre una persona, más debe respetar el sistema la limitación de finalidad, la minimización de datos y la trazabilidad. A medida que maduren los controles, debe quedar claro qué información fundamentó una interpretación, qué explicación añadió el sistema y qué correcciones se hicieron. Los controles que aún no existen no deben presentarse como promesas cumplidas.

## 15. Límites médicos, psicológicos y de seguridad

Ather no es un servicio médico, psiquiátrico, de diagnóstico psicológico ni terapéutico. No sustituye a médicos, terapeutas u otros profesionales cualificados.

El proyecto no diagnostica enfermedades, no infiere estado de salud mental a partir de expresión limitada, no afirma identificar mecanismos neuronales concretos y no convierte conceptos de investigación directamente en conclusiones clínicas. Las situaciones de crisis, daño o riesgo urgente requieren servicios de emergencia locales o apoyo profesional cualificado.

Este límite no reduce el propósito de Ather. La autoexploración, registrar evidencia, encontrar contradicciones, expresar cambios y revisar la comprensión son ámbitos valiosos por sí mismos. Ather busca servirlos bien, no hacer afirmaciones más fuertes cruzando una línea.

## 16. Camino del proyecto

**Ahora**

Convertir rondas temáticas, observaciones, evidencia, límites, comentarios e historial en un ciclo mínimo completo y creíble. La prioridad no es añadir más funciones, sino asegurar que cada interpretación pueda verse, responderse y guardarse.

**Después**

Comprobar si los comentarios mejoran de verdad la siguiente experiencia: si el sistema recuerda el contexto correcto, evita repetir una interpretación cuestionada, usa el nuevo contexto en temas similares y hace perceptible ese cambio.

**Más adelante**

Solo cuando la evidencia, la calibración y las reglas científicas maduren debe Ather construir modelos dinámicos entre rondas y reconocimiento de cambios. La capacidad a largo plazo debe crecer de capacidades pequeñas ya verificadas, no de un nombre grandioso anunciado por adelantado.

El orden importa: primero lograr que una interpretación sea creíble, después que interpretaciones repetidas tengan continuidad y finalmente que el tiempo produzca una percepción nueva.

## 17. Diferencia, riesgo y contención

La diferencia de Ather no es un banco de preguntas, un estilo visual ni un modelo concreto. Las preguntas se pueden copiar, las interfaces se pueden reproducir y los modelos cambian rápido. Lo difícil es convertir evidencia, explicación, comentarios, corrección y tiempo en un ciclo que siga siendo útil.

Esta dirección también tiene riesgos claros: el sistema puede inferir de más; el lenguaje científico puede amplificarse en marketing; la información histórica puede quedar fijada de forma errónea; distintos componentes pueden contradecirse; el lenguaje fluido puede ocultar falta de evidencia.

Por eso Ather no debe priorizar ahora una expansión ilimitada de preguntas, puntuaciones misteriosas, interacción decorativa, una falsa apariencia de autoridad clínica ni un lenguaje grandioso que oculte validación incompleta. El proyecto no necesita parecer todopoderoso. Necesita ser real, transparente y corregible dentro de un alcance limitado.

La contención no es conservadurismo. Protege la base de una capacidad más duradera.

## 18. Objetivo final: de la autoexploración a la ampliación de la inteligencia

El objetivo final de Ather no es generar un informe sobre una persona. Es ayudar a construir una capacidad más continua y clara para comprenderse.

Cuando un sistema puede conservar evidencia sin congelar la historia en etiquetas, ofrecer observaciones sin quitar el juicio humano, aceptar correcciones y volver a examinarse a lo largo del tiempo, deja de ser solo una herramienta de evaluación. Empieza a actuar como un espejo mental: ayuda a ver cómo pensamos, elegimos y cambiamos en relaciones y entornos.

La aspiración posterior es la ampliación de la inteligencia: no que la inteligencia artificial sustituya el juicio humano, sino que la tecnología fortalezca la capacidad de comprenderse, detectar puntos ciegos, reconocer cambios y tomar decisiones.

Este objetivo no se logrará con un eslogan. Solo puede construirse con cada observación basada en evidencia, cada cuestionamiento tratado con seriedad y cada expresión honesta de incertidumbre.

Ather no intenta responder «quién eres» en nombre de otra persona.

Intenta ser un espejo que se actualiza con evidencia, acepta corrección y ayuda a ver el cambio.`,
  ja: `# Ather ホワイトペーパー

> Ather は、変化し続ける自己探索のためのシステムです。人の表現、システムによる観察、見返せる根拠、そして本人による修正を結びつけることで、自己理解を一度きりのテストや固定的なラベルで終わらせません。

## 1. 出発点：人は一つの状態にとどまらない

人は経験、関係、負荷、選択、時間のなかで変わります。今日の答えが本当であっても、半年後のその人を表すとは限りません。ある場面での強い反応も、安定した傾向とは限りません。一回限りのテストは、この複雑さを点数、タイプ、結論に圧縮し、さらに問い直すべきところで止まってしまいがちです。

Ather は別の問いから始まります。人を理解することが一度の判定ではなく、根拠を積み上げ、本人の修正を受け入れ、過去の理解を見直せる過程だったらどうなるか。

プロジェクトの目的は、より魅力的なラベルをつくることではありません。人がどのように選び、状況にどう応じ、何が比較的安定し、何が変わりつつあるかを見つめられるようにすることです。

## 2. Ather とは何か

Ather は、構造化された自己探索、見える根拠、本人からのフィードバック、時間という要素を中核に置く計算システムです。

誰かを一文で要約しようとはしません。一つひとつの理解を、確認できる要素に分けます。何を観察したのか、何がそれを支えるのか、何がまだ不明なのか、本人はどう受け止めるのか、そして後で解釈を修正すべきかです。

現在の段階では、一回の探索を明確にすることに集中します。長期的には、十分な根拠と検証が得られた場合に限り、繰り返されるやり取りを更新可能で追跡可能な自己モデルとして整理することを目指します。

## 3. 中心となる考え：理解は定義ではない

Ather は、どの出力も最終的な人格判断ではなく、観察または仮説として扱います。

同じ言葉でも、異なる人生や状況では意味が変わります。似た行動の背後にも、まったく異なる動機があります。集まりを避けることは、一人の時間が必要なこと、準備不足、不安な関係、あるいは単なる疲労を示すかもしれません。ラベルは短く見えても、大切な文脈を消してしまうことがあります。

そのため Ather は三つの原則を持ちます。結論は限定的であること、根拠は見えること、解釈は異議を受け入れることです。人の内面に近づくほど、システムは何を知っているか、何を知らないか、なぜ今そう理解しているかを慎重に示さなければなりません。

## 4. ラベルを貼らず、「完全に見抜かれた」という錯覚もつくらない

Ather は、固定的な性格分類を到達点にせず、曖昧な表現で正確さの印象をつくることにも頼りません。

「一人の時間を好む一方で、理解されたいとも思う」という説明は多くの人に当てはまるかもしれませんが、誰かを本当に説明するものではありません。Ather が重視するのは具体的な根拠です。どの表現が観察を支えるのか、どの文脈に限って当てはまるのか、何が反証になるのか、本人はどう説明するのかを見ます。

誠実なシステムは、「情報が不足している」「この観察は今回のテーマに限られる」「新しい文脈によって以前の解釈が変わった」と言えます。不確かさは隠すべき弱さではなく、行き過ぎた推論を防ぐための基本的な保護です。

## 5. 現在の正式な体験

**現在利用できること**

Ather の現在の正式な体験は、テーマに沿った 6〜8 問の質問から始まります。できるだけ多くの情報を集めるためではなく、選択、感情、理由、現実の場面を通じて、限定されたテーマを探索するためです。

終了後、Ather はその回の観察、それを支える根拠、そしてその観察から言えないことを示します。本人は、合っている、一部は合っている、合っていないを示したり、自分の説明を補足したりできます。フィードバックは対応する回とともに保存され、履歴に残ります。

直近の目標は明確です。限定された解釈が、分かりやすく、根拠があり、応答可能であるかを確かめることです。Ather は一回の結果を完全な人格に変えたり、現在の観察を確立済みの長期ポートレートとして扱ったりしません。

## 6. 理解の最小単位

Ather は、観察、根拠、境界、フィードバックを理解の最小単位と考えます。

- 観察：今回の回でシステムが見いだしたこと。
- 根拠：その観察を支える、元の表現や選択。
- 境界：観察がどこまで当てはまり、何がまだ不明か。
- フィードバック：本人が確認するか、一部を認めるか、異議を唱えるか、文脈を補うか。

これらは一緒に存在する必要があります。根拠のない観察はブラックボックスの判断になり得ます。境界のない根拠は過度な推論につながります。フィードバックのない結論は、最も重要な較正の源を失います。

Ather にとって基本となるのは、謎めいた点数ではありません。確認し、話し合い、更新できる理解の記録です。

## 7. 根拠、フィードバック、修正

Ather の目的は、システムが常に正しいことを証明することではありません。誤りを見つけ、受け入れ、修正の経路を残す方法をつくることです。

たとえば、ある人が「人付き合いが嫌いなのではなく、準備のない集まりが苦手です」と言ったとします。これは小さな修正ではありません。社会性が低いという解釈から、予測可能性への必要、エネルギー配分、あるいは制御を失うことへの敏感さという理解に変わるかもしれません。良いシステムは以前のラベルに固執せず、新しい根拠を記録し、関連する情報が後に現れたときに解釈を見直すべきです。

**検証中のこと**

現在の製品はフィードバックを保存できます。どのフィードバックが後の理解に影響すべきか、その影響範囲をどこまでにするか、以前の観察がいつ古くなったとみなすか、変化をどう明確に示すかは、引き続き製品実験と実際の根拠による検証が必要です。

## 8. なぜ時間が必要なのか

時間がなければ、システムに見えるのは断片だけです。時間があれば、比較的安定した傾向、短期的な状態、例外的な出来事、実際の変化を区別し始めることができます。

一つの表現は、疲労、衝突、環境によって形づくられることがあります。同じテーマでも別の時期に見直せば、まったく異なる意味を持つかもしれません。Ather の長期的な価値は、より多くの言葉を保存することではなく、時間の関係を理解することから生まれるべきです。何が続くのか、何が一度だけ起きたのか、何が強まっているのか、何が新しい根拠によって覆されたのかを見ます。

時間はより大きな責任も伴います。過去の情報が、保存されたというだけで永遠に有効になるわけではありません。古い結論は、保存されているだけで権威を得るべきではありません。長期的な理解には、期限切れ、矛盾、弱まり、再確認が許されなければなりません。

## 9. Ather の概念アーキテクチャ

Ather の公開された概念アーキテクチャは、互いに制約し合う五つの層で成り立ちます。

- 構造化された探索：限定されたテーマの問いによって、文脈を含む表現を得る層。
- 根拠：観察を支える元の根拠を、システムの解釈と分けて保持する層。
- 理解：範囲と不確かさを伴う、限定的な観察をつくる層。
- 較正：確認、異議、補足を受け取り、本人が修正に参加できるようにする層。
- 時間：条件が整ったとき、複数回を比較して安定、矛盾、変化を検討する層。

これは一方向の流れではなく、循環です。新しいフィードバックは過去の観察を見直す理由になり、新しい状況は以前の根拠の意味を変えることがあり、後の回は以前の解釈が特定の時期にしか当てはまらなかったことを示すかもしれません。

Ather は、具体的なプロンプト、完全な設問バンク、パラメータ、重み、しきい値、モデルのルーティング、内部インターフェースを公開しません。こうした実装の詳細は変化し、信頼の源でもありません。検証すべきなのは、システムが根拠を示すか、フィードバックを尊重するか、境界を正しく表現するか、それによって後の理解が改善するかです。

## 10. 無限の会話ではなく、構造化された探索

自由な会話は豊かな表現を生むことがあります。しかし、豊かさは理解や検証と同じではありません。会話を続け、共感的に聞こえる返答を生成するだけのシステムは、連続した理解の記録を持たない陪伴に変わり得ます。

Ather が構造化された探索を使うのは、各回に明確なテーマ、限定された目的、見返せる結果を持たせるためです。質問が際限なく増えるべきではなく、追加の問いも単に会話を延ばすために存在すべきではありません。文脈を明らかにし、根拠を補い、矛盾を表面化させ、未知を特定することに役立つ必要があります。

将来、より自然な交流の形があり得ます。しかし形は理解の循環に仕える必要があります。入口が質問、記録、会話のどれであっても、表現がどう根拠になり、根拠がどう観察を支え、観察がどう修正を受け入れるかという同じ規律に戻らなければなりません。

## 11. 動的な自己モデルと変化の認識

**長期的な方向性**

Ather は段階的に、動的な自己モデルを形成することを目指します。それは性格特性の静的なプロフィールではありません。現在の根拠、過去のフィードバック、文脈の違い、不確かさを組織化した表現です。

動的であるとは、モデルが更新でき、以前の理解を撤回することもできるという意味です。ある傾向は長く安定しているかもしれず、特定の関係や負荷の下でのみ現れるかもしれません。相反する二つの根拠を無理に平均化するのではなく、より多くの情報が集まるまで矛盾を見えるままにします。

変化を認識することは、この方向性の中で最も価値があり、最も要求の高い部分の一つです。Ather がいつか「あなたは変わっている」と述べるなら、何を比較したのか、どの根拠が比較を支えるのか、差が通常の揺れを超えるのか、本人がそれを認めるのかを示さなければなりません。これらがなければ、「変わった」という言葉は印象的でも検証可能な観察ではありません。

科学的なルール、製品の仕組み、検証条件が整うまでは、正式な長期ポートレートと変化に関する結論は不明のままにすべきです。Ather は、流暢な言葉で根拠の空白を埋めるより、答えないことを選ぶべきです。

## 12. 科学に対する姿勢

Ather は新しい心理学理論を発明したとは主張せず、工学システムを臨床的な突破として見せることもしません。

プロジェクトは、人格心理学、心理測定、認知心理学、感情や愛着の研究、社会心理学、ヒューマン・コンピュータ・インタラクション、適応システムから概念的な手がかりを得ることがあります。しかし三つの層を分けなければなりません。確立した研究は概念の参考になり得ること、製品の仕組みには独立した検証が必要なこと、そして個別の出力は現在の根拠に基づく限定的な観察にすぎないことです。

理論との関連は測定の妥当性ではありません。測定との関連は診断ではありません。モデルが説明を生成できることは、その説明が科学的に確立している証明ではありません。

Ather に必要なのは用語の多さではなく、繰り返し可能な検証の過程です。似た根拠が十分に一貫して扱われるか、修正が正しく記録されるか、後の結果がそれを反映するか、情報が足りないときに推論を止められるかを確かめます。

## 13. 信頼はどのようにつくられるか

Ather の信頼性は、ブランドの主張、モデルの能力、外部からの裏づけだけに置くことはできません。製品のふるまいの中から生まれる必要があります。

重要な観察には、可能な限り見返せる根拠を添えます。局所的な情報を人全体に広げるのではなく、適用範囲を示します。システムは異議を受け入れる必要があり、異議は結果を持たないボタンであってはなりません。Ather が時間とともにより理解するという主張は、後のふるまいで示されなければなりません。

検証には順序があります。まず一回の体験が役立つか、次にフィードバックが次の体験を改善するか、さらに繰り返しの回がより安定し矛盾の少ない理解をつくるか、そして最後に長期的な変化を認識できるかを見ます。

完了、根拠の確認、確認と異議、補足の質、後の修正、再訪、継続利用はすべて製品上の根拠になり得ます。一つの指標だけが成功を意味するわけではありません。より強い結論には、これらの信号がともに理解の質の向上を示す必要があります。

## 14. 人の判断とシステムの責任

Ather は観察、問い、可能な説明を示せますが、最終的な判断は本人にあります。システムは権威的な口調で受け入れを強いたり、異議を「自分を十分に分かっていない」ことの表れとして扱ったりすべきではありません。

本人のフィードバックも、自動的に最終的な真実になるわけではありません。自己理解は矛盾し、変化し、その時の感情に影響されることがあります。Ather の責任は、「システムが正しい」か「本人が正しい」かを単純に選ぶことではなく、異なる根拠を残し、矛盾を明確に示し、新しい文脈で検討を続けることです。

個人についての情報が豊かになるほど、システムは目的の限定、最小限の利用、追跡可能性を守る必要があります。製品上の制御が成熟するにつれ、どの情報がどの解釈に使われたか、システムが何を加えたか、どの修正がなされたかを明確に保つべきです。まだ実装されていない制御を、すでに果たした約束として書くべきではありません。

## 15. 医療、心理、安全に関する境界

Ather は医療、精神医療、心理診断、治療のサービスではありません。医師、心理職、その他の有資格専門家に代わるものではありません。

プロジェクトは病気を診断せず、限られた表現から心の健康状態を推定せず、特定の神経機構を識別できるとは主張せず、研究上の概念を直接臨床的な結論に変換しません。危機、危害、緊急のリスクが関わる状況では、地域の緊急サービスまたは有資格の専門的支援が必要です。

この境界は Ather の目的を弱めるものではありません。自己探索、根拠の記録、矛盾の発見、変化の表現、理解の修正には、それ自体に価値があります。Ather は境界を越えて強い主張をするのではなく、この領域を丁寧に扱うことを目指します。

## 16. プロジェクトの進む道

**今**

テーマごとの回、観察、根拠、境界、フィードバック、履歴を、完全で信頼できる最小の循環にします。優先すべきなのは機能を増やすことではなく、一つひとつの解釈が見え、応答でき、保存されることです。

**次に**

フィードバックが本当に次の体験を改善するかを確かめます。システムが正しい文脈を覚えるか、異議を受けた解釈を繰り返さないか、似たテーマで新しい文脈を使うか、その変化が本人に分かるかを検証します。

**その先に**

根拠、較正、科学的なルールが成熟してから、複数回にまたがる動的な自己モデルと変化の認識をつくります。長期的な能力は、すでに検証された小さな能力から育つべきであり、先に大きな名前を掲げることから生まれるものではありません。

順序が重要です。まず一回の解釈を信頼できるものにし、次に繰り返される解釈に連続性を持たせ、最後に時間から洞察を生み出します。

## 17. 違い、リスク、節度

Ather の違いは、設問バンク、見た目、特定のモデルにはありません。問いは模倣でき、インターフェースは再現でき、モデルは速く変わります。難しいのは、根拠、説明、フィードバック、修正、時間を、使い続けられる循環にすることです。

この方向には明確なリスクもあります。システムが過度に推論すること、科学的な言葉がマーケティングで増幅されること、過去の情報が誤って固定されること、異なる構成要素が同じ人について矛盾すること、流暢な言葉が根拠不足を隠すことです。

そのため Ather は現段階で、設問の無限な拡張、謎めいた点数、装飾的な交流、臨床的な権威を装うこと、未完の検証を隠す大きな言葉を優先すべきではありません。プロジェクトに必要なのは万能に見えることではなく、限られた範囲で現実的で、透明で、修正可能であり続けることです。

節度は保守性ではありません。より長期的な能力の土台を守ることです。

## 18. 最終目標：自己探索から知性の拡張へ

Ather の最終目標は、人についてのレポートを生成することではありません。人が自分をより継続的に、より明確に理解する力を育てることです。

根拠を残しながら歴史をラベルに固定せず、観察を示しながら人の判断を奪わず、修正を受け入れ、時間のなかで自らを見直せるシステムは、単なる測定ツールを超えます。それは心の鏡として、人がどう考え、選び、関係や環境のなかでどう変わるかを見る助けになります。

さらに目指すのは知性の拡張です。人工知能が人の判断を置き換えるのではなく、自分を理解し、盲点に気づき、変化を認識し、選択する力を技術によって強めることです。

この目標はスローガンでは達成できません。根拠に基づく一つひとつの観察、真剣に扱われる一つひとつの異議、不確かさについての一つひとつの正直な表現を通じてしか築けません。

Ather は、誰かの代わりに「あなたは誰か」と答えようとしているのではありません。

根拠とともに更新され、修正を受け入れ、変化を見る助けになる鏡になろうとしています。`,
};

// ── Parse sections from Markdown ─────────────────────────────────────────────
interface Section {
  id: string;
  title: string;
  level: number;
  content: string;
}

function parseSections(md: string): Section[] {
  const lines = md.split('\n');
  const sections: Section[] = [];
  let current: Section | null = null;
  let buf: string[] = [];

  for (const line of lines) {
    const match = line.match(/^(#{1,3})\s+(.+)/);
    if (match) {
      if (current) {
        current.content = buf.join('\n').trim();
        sections.push(current);
      }
      const level = match[1].length;
      const title = match[2];
      const id = title.replace(/[^a-zA-Z0-9\u4e00-\u9fff]+/g, '-').toLowerCase();
      current = { id, title, level, content: '' };
      buf = [];
    } else {
      buf.push(line);
    }
  }
  if (current) {
    current.content = buf.join('\n').trim();
    sections.push(current);
  }
  return sections;
}

// ── Highlight search matches ─────────────────────────────────────────────────
function highlightText(text: string, query: string): React.ReactNode {
  if (!query) return text;
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(`(${escaped})`, 'gi');
  const parts = text.split(regex);
  return parts.map((part, i) =>
    regex.test(part) ? (
      <mark key={i} className="wp-highlight">{part}</mark>
    ) : (
      part
    )
  );
}

// ── Render markdown line (minimal) ──────────────────────────────────────────
function renderLine(line: string, query: string, idx: number): React.ReactNode {
  if (line.startsWith('> ')) {
    return <blockquote key={idx} className="wp-blockquote">{highlightText(line.slice(2), query)}</blockquote>;
  }
  if (line.startsWith('- ')) {
    return <li key={idx}>{highlightText(line.slice(2), query)}</li>;
  }
  if (line.startsWith('**') && line.endsWith('**')) {
    return <p key={idx} className="wp-bold">{highlightText(line.slice(2, -2), query)}</p>;
  }
  if (line.startsWith('---')) {
    return <hr key={idx} className="wp-hr" />;
  }
  if (line === '') return null;
  return <p key={idx}>{highlightText(line, query)}</p>;
}

// ── Main Component ───────────────────────────────────────────────────────────
export default function WhitepaperPage() {
  const { locale, t } = useLocale();
  const sections = useMemo(() => parseSections(PUBLIC_WHITEPAPERS[locale]), [locale]);
  const [query, setQuery] = useState('');
  const [currentMatch, setCurrentMatch] = useState(0);
  const contentRef = useRef<HTMLDivElement>(null);

  // Find matching sections
  const matchingSections = useMemo(() => {
    if (!query.trim()) return sections;
    const q = query.toLowerCase();
    return sections.filter(
      (s) => s.title.toLowerCase().includes(q) || s.content.toLowerCase().includes(q)
    );
  }, [sections, query]);

  // Total matches count
  const matchCount = useMemo(() => {
    if (!query.trim()) return 0;
    const q = query.toLowerCase();
    let count = 0;
    for (const s of sections) {
      const text = (s.title + ' ' + s.content).toLowerCase();
      let idx = 0;
      while ((idx = text.indexOf(q, idx)) !== -1) { count++; idx += q.length; }
    }
    return count;
  }, [sections, query]);

  // Scroll to next/prev match
  const scrollToMatch = useCallback((direction: 'next' | 'prev') => {
    if (!contentRef.current) return;
    const marks = contentRef.current.querySelectorAll('mark.wp-highlight');
    if (!marks.length) return;
    let next = direction === 'next' ? currentMatch + 1 : currentMatch - 1;
    if (next >= marks.length) next = 0;
    if (next < 0) next = marks.length - 1;
    setCurrentMatch(next);
    marks[next]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [currentMatch]);

  // Scroll to section
  const scrollToSection = (id: string) => {
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <div className="wp-page">
      {/* Sidebar / TOC */}
      <aside className="wp-sidebar">
        <div className="wp-sidebar__head">
          <h2 className="wp-sidebar__title">{t('whitepaper.title')}</h2>
        </div>
        <nav className="wp-toc" aria-label="Table of contents">
          {sections.map((s) => (
            <button
              key={s.id}
              className={`wp-toc__item wp-toc__item--${s.level}`}
              onClick={() => scrollToSection(s.id)}
            >
              {s.title}
            </button>
          ))}
        </nav>
      </aside>

      {/* Main content */}
      <main className="wp-main" ref={contentRef}>
        {/* Search bar */}
        <div className="wp-search">
          <Search size={16} className="wp-search__icon" />
          <input
            type="text"
            className="wp-search__input"
            placeholder={t('whitepaper.search_placeholder')}
            value={query}
            onChange={(e) => { setQuery(e.target.value); setCurrentMatch(0); }}
          />
          {query && (
            <>
              <span className="wp-search__count">
                {matchCount} {t('whitepaper.matches')}
              </span>
              <button className="wp-search__nav" onClick={() => scrollToMatch('prev')} aria-label="Previous match"><ArrowUp size={14} /></button>
              <button className="wp-search__nav" onClick={() => scrollToMatch('next')} aria-label="Next match"><ArrowDown size={14} /></button>
              <button className="wp-search__clear" onClick={() => { setQuery(''); setCurrentMatch(0); }} aria-label="Clear search"><X size={14} /></button>
            </>
          )}
        </div>

        {/* Rendered content */}
        {query && matchingSections.length === 0 ? (
          <p className="wp-empty">{t('whitepaper.no_results')}</p>
        ) : (
          matchingSections.map((section) => (
            <section key={section.id} id={section.id} className="wp-section">
              {section.level === 1 && <h1>{highlightText(section.title, query)}</h1>}
              {section.level === 2 && <h2>{highlightText(section.title, query)}</h2>}
              {section.level === 3 && <h3>{highlightText(section.title, query)}</h3>}
              <div className="wp-body">
                {section.content.split('\n').map((line, i) => renderLine(line, query, i))}
              </div>
            </section>
          ))
        )}
      </main>
    </div>
  );
}
