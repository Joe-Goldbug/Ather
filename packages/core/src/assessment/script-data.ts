// ================================================================
// EVA Engine - Complete Script Data
// All 4 scenarios, options, feedback texts, vector mappings,
// archetype definitions, result narratives, and opening messages.
// ================================================================

import type {
  ScenarioId, ChoiceOption, PersonalityVector,
  ConflictStyle, AttachmentPattern, EmotionalRegulation,
  StressResponse, AchievementDrive, SelfViewPattern, SocialEnergyStyle,
} from '../shared/types.js';

// ---------------------------------------------------------------
// Scenario Option Data
// ---------------------------------------------------------------

export interface ScenarioOptionDef {
  text: string;
  label: string;       // Short label shown after selection
  feedback: string;    // EVA's instant feedback after this choice
}

export interface ChoiceVectorPatch {
  trust_threshold?: number;
  boundary_strength?: number;
  conflict_style?: ConflictStyle;
  conflict_score?: number;
  attachment_pattern?: AttachmentPattern;
  attachment_score?: number;
  emotional_regulation?: EmotionalRegulation;
  stress_response?: StressResponse;
  stress_score?: number;
  achievement_drive?: AchievementDrive;
  perfectionism_score?: number;
  selfview_pattern?: SelfViewPattern;
  growth_mindset_score?: number;
  social_energy_style?: SocialEnergyStyle;
  social_energy_score?: number;
}

export interface ScenarioDef {
  id: ScenarioId;
  title: string;
  setup: string;       // Background narrative shown before question
  prompt: string;      // EVA's question text
  options: Record<ChoiceOption, ScenarioOptionDef>;
  vector_patch: Record<ChoiceOption, ChoiceVectorPatch>;
}

export const SCENARIOS: ScenarioDef[] = [
  // ── Scenario 1: Trust Boundary ──────────────────────────────
  {
    id: 'trust',
    title: '信任边界',
    setup:
      '凌晨 1:23，地铁上只剩你一人。手机突然震了——一个认识不到两周的人发来长语音。\n\nta 说了一件从没对别人说过的后悔事，声音有点抖。最后："我也不知道为什么跟你说这些。"\n\n屏幕暗下去之前，你脑子里闪过的第一个念头是——',
    prompt: '此刻你最真实的内心反应是什么？',
    options: {
      A: {
        text: '有点不知所措——我们好像还没到这个程度',
        label: '设防',
        feedback: '你的心理空间有门禁，不会随便给人刷卡。',
      },
      B: {
        text: '心里被触动了，也想分享一件自己的事回应',
        label: '互惠',
        feedback: '你用自我暴露换取连接——一种勇敢的信任投资。',
      },
      C: {
        text: '认真听完但不主动说自己，先观察这人值不值得',
        label: '观察',
        feedback: '心理雷达在工作——收集数据，不急着给出自己。',
      },
      D: {
        text: '立刻来了兴趣，追问更多——ta 到底经历了什么',
        label: '探索',
        feedback: '别人的脆弱对你不是负担，是入口。',
      },
    },
    vector_patch: {
      A: { trust_threshold: 0.9, boundary_strength: 0.9 },
      B: { trust_threshold: 0.45, boundary_strength: 0.45 },
      C: { trust_threshold: 0.65, boundary_strength: 0.72 },
      D: { trust_threshold: 0.18, boundary_strength: 0.22 },
    },
  },

  // ── Scenario 2: Conflict Style ───────────────────────────────
  {
    id: 'conflict',
    title: '冲突应对',
    setup:
      '部门会议上，你花一个月做的方案被同事当众质疑。\n\nta 语气不算友好，几个人低头看手机但都在听。空气安静了两秒，所有人目光转向你。',
    prompt: '那两秒里，你的身体和大脑在做什么？',
    options: {
      A: {
        text: '心里警铃大作但表面不动声色，先忍下来私下再说',
        label: '回避',
        feedback: '延迟处理型——在等一个更有利的时机。',
      },
      B: {
        text: '血冲上来当场回应，立场必须表明',
        label: '对抗',
        feedback: '当众被冒犯当众回应，这是你的基本规则。',
      },
      C: {
        text: '在想 ta 为什么这样——冲着我来的，还是 ta 自己有问题',
        label: '分析',
        feedback: '自动切到"理解模式"——是优势，但可能错过保护自己的窗口。',
      },
      D: {
        text: '尴尬得想逃，赶紧说两句岔开话题',
        label: '逃避',
        feedback: '冲突让你过载——表面平静了，内心的风暴没消失。',
      },
    },
    vector_patch: {
      A: { conflict_style: 'avoidant', conflict_score: 0.2 },
      B: { conflict_style: 'confrontational', conflict_score: 0.9 },
      C: { conflict_style: 'analytical', conflict_score: 0.6 },
      D: { conflict_style: 'escapist', conflict_score: 0.08 },
    },
  },

  // ── Scenario 3: Attachment Pattern ──────────────────────────
  {
    id: 'attachment',
    title: '依恋倾向',
    setup:
      '你跟一个很好的朋友约好周末见面，已经期待了好几天。\n\n结果 ta 发来消息："抱歉，今天突然有事，下次吧。"\n\n没有解释，没说什么时候下次。就这一句。',
    prompt: '看完这条消息，内心最真实的第一层感受是什么？',
    options: {
      A: {
        text: '没关系，人都有突然有事的时候',
        label: '安全',
        feedback: '你对关系有基本信任——这是种稀缺的能力。',
      },
      B: {
        text: '心里咯噔一下——是不是不想见我？我做错了什么',
        label: '焦虑',
        feedback: '你把不确定自动翻译成最坏版本——是天赋，也是负担。',
      },
      C: {
        text: '哦知道了。说实话好像也没那么期待',
        label: '回避',
        feedback: '第一道防线叫"降低期待"——但也会错过心动瞬间。',
      },
      D: {
        text: '追问一句："什么事呀？你还好吗？"——需要更多信息才能安心',
        label: '验证',
        feedback: '你不接受模糊——要的是信息，更是确认自己仍被重视。',
      },
    },
    vector_patch: {
      A: { attachment_pattern: 'secure', attachment_score: 0.85 },
      B: { attachment_pattern: 'anxious', attachment_score: 0.22 },
      C: { attachment_pattern: 'avoidant', attachment_score: 0.55 },
      D: { attachment_pattern: 'validating', attachment_score: 0.6 },
    },
  },

  // ── Scenario 4: Emotional Regulation ────────────────────────
  {
    id: 'emotion',
    title: '情绪调节',
    setup:
      '你投入很多的一件事，搞砸了。\n\n不是小失误——是后果挺严重、而且因为自己判断出了问题的事。\n\n当晚躺在床上，脑子里像放电影一样反复回放。',
    prompt: '那个晚上，你最终是怎么度过的？',
    options: {
      A: {
        text: '自己闷着消化，不想让任何人看到，说了也没用',
        label: '内化',
        feedback: '情绪系统内向封闭——习惯一个人扛。',
      },
      B: {
        text: '憋不住，找了信任的人打电话或发了一堆消息',
        label: '外化',
        feedback: '你需要把情绪说出去才能处理——关系型调节方式。',
      },
      C: {
        text: '打开备忘录列：哪里错了、为什么、下次怎么改',
        label: '理性',
        feedback: '把情绪变分析题——是效率，也是"不允许自己难过"。',
      },
      D: {
        text: '打开游戏/刷剧/跑步，先把注意力转移掉',
        label: '转移',
        feedback: '能切断反刍恢复快，但问题没解决还会回来。',
      },
    },
    vector_patch: {
      A: { emotional_regulation: 'internalizing' },
      B: { emotional_regulation: 'externalizing' },
      C: { emotional_regulation: 'rational' },
      D: { emotional_regulation: 'deflecting' },
    },
  },

  // ── Scenario 5: Stress Response ──────────────────────────────
  {
    id: 'stress',
    title: '压力应对',
    setup:
      '连续三周高压状态，睡眠很差，大脑像关不掉的机器。\n\n明天还有重要事情要处理。晚上 11 点，你盯着天花板。',
    prompt: '你会怎么做？',
    options: {
      A: {
        text: '越想睡越睡不着，索性起来继续干活',
        label: '反刍',
        feedback: '大脑进入循环模式——高效处理焦虑但无法真正关机。',
      },
      B: {
        text: '硬熬着，闭着眼全身紧绷，像一根拉满的弓',
        label: '激活',
        feedback: '警戒阈值一直高位，身体在替精神状态买单。',
      },
      C: {
        text: '吃褪黑素或喝酒，强制自己停下来',
        label: '压制',
        feedback: '用外部手段切断压力——策略还是逃避，看频率。',
      },
      D: {
        text: '起来散步或冥想，把注意力放回身体，让节奏慢下来',
        label: '觉察',
        feedback: '主动给神经系统按暂停——对自身身心有觉知。',
      },
    },
    vector_patch: {
      A: { stress_response: 'rumination', stress_score: 0.85 },
      B: { stress_response: 'activation', stress_score: 0.92 },
      C: { stress_response: 'suppression', stress_score: 0.45 },
      D: { stress_response: 'mindfulness', stress_score: 0.18 },
    },
  },

  // ── Scenario 6: Achievement Drive / Perfectionism ─────────────
  {
    id: 'achievement',
    title: '成就动机',
    setup:
      '你花了一周准备的重要方案，提交前发现了一个明显的小错误。\n\n不算致命但仔细看能看到。距截止还有 2 小时——改要熬到凌晨，不改大概率没人发现。',
    prompt: '此刻你手上的鼠标会做什么？',
    options: {
      A: {
        text: '重做，熬到凌晨也必须改到完美才交',
        label: '高标准',
        feedback: '内在评分极严格——工作出色但也活得累。',
      },
      B: {
        text: '先交，私下联系对方说有问题。表面不翻车但心里不安',
        label: '表现',
        feedback: '需要被看到能力——但不安感会跟很久。',
      },
      C: {
        text: '算了，反正没人发现。不要逼太紧',
        label: '回避',
        feedback: '用"差不多"保护自己不被评价——但放弃了掌控感。',
      },
      D: {
        text: '交出去，承认不完美但相信整体质量够好',
        label: '心流',
        feedback: '能区分"足够好"和"完美"——很多人没学会的能力。',
      },
    },
    vector_patch: {
      A: { achievement_drive: 'high_standards', perfectionism_score: 0.92 },
      B: { achievement_drive: 'recognition_seeking', perfectionism_score: 0.65 },
      C: { achievement_drive: 'avoidance', perfectionism_score: 0.25 },
      D: { achievement_drive: 'flow_state', perfectionism_score: 0.5 },
    },
  },

  // ── Scenario 7: Self-View Pattern ──────────────────────────────
  {
    id: 'selfview',
    title: '自我认知',
    setup:
      '一个你在意 ta 看法的人，当着别人的面说：\n\n"其实你真的没有你自己以为的那么好。"\n\n旁边的人笑了，但你知道 ta 是认真的。',
    prompt: '那句话钻进耳朵的瞬间，你的内心世界发生了什么？',
    options: {
      A: {
        text: '心里一紧——有没有可能 ta 说得对？我是不是高估自己了',
        label: '成长',
        feedback: '把反馈当镜子——自我迭代的基础。',
      },
      B: {
        text: '冷笑一下。ta 又不了解我，不需要向任何人证明',
        label: '固化',
        feedback: '自我认知来自内部——但如果墙太高会错过成长。',
      },
      C: {
        text: '燃起一股"我要证明给你看"的狠劲',
        label: '表演',
        feedback: '自我价值绑定外部认可——驱动你但让你对批评脆弱。',
      },
      D: {
        text: '有点受伤，但转念一想好像确实有点道理',
        label: '矛盾',
        feedback: '内评系统+外馈敏感并存——最复杂也最真实。',
      },
    },
    vector_patch: {
      A: { selfview_pattern: 'growth_minded', growth_mindset_score: 0.88 },
      B: { selfview_pattern: 'fixed_identity', growth_mindset_score: 0.2 },
      C: { selfview_pattern: 'performative', growth_mindset_score: 0.45 },
      D: { selfview_pattern: 'ambivalent', growth_mindset_score: 0.55 },
    },
  },

  // ── Scenario 8: Social Energy Style ──────────────────────────
  {
    id: 'socialenergy',
    title: '社交能量',
    setup:
      '你一个人待了一周——工作、吃饭、追剧，连说话的都只有外卖小哥。\n\n周五晚，好友发消息："今晚有人组局，来吗？临时起意，人不少。"\n\n你看了看乱糟糟的房间和镜子里的自己。',
    prompt: '那一瞬间，你的身心在往哪个方向倾斜？',
    options: {
      A: {
        text: '立刻来了精神！出去跟人待着才能活过来',
        label: '充电',
        feedback: '人际互动是你的充电器——独处已到红色预警。',
      },
      B: {
        text: '心里想去但怕融不进去，纠结半天回了"下次吧"',
        label: '消耗',
        feedback: '对人际有渴望也有恐惧——想要又怕受伤。',
      },
      C: {
        text: '礼貌拒绝。不想把时间交给无效社交',
        label: '选择',
        feedback: '清晰享受独处——但边界太清可能也在回避不确定。',
      },
      D: {
        text: '去，但设定好预期：露个脸，不勉强当社交达人',
        label: '适应',
        feedback: '能在不同模式间切换——既不孤立也不过度消耗。',
      },
    },
    vector_patch: {
      A: { social_energy_style: 'energy_giving', social_energy_score: 0.88 },
      B: { social_energy_style: 'energy_draining', social_energy_score: 0.35 },
      C: { social_energy_style: 'selective', social_energy_score: 0.22 },
      D: { social_energy_style: 'adaptive', social_energy_score: 0.6 },
    },
  },
];

// ---------------------------------------------------------------
// Archetypes (Share Card)
// 8 archetypes scored from the vector — highest score wins
// ---------------------------------------------------------------

export interface ArchetypeDef {
  id: string;
  label: string;          // Chinese name shown on share card
  headline: string;       // Punchy tagline for share card
  description: string;    // 1-sentence for sharing
  cta: string;
  // Scoring rules: each rule adds to archetype score
  score_rules: Array<(v: PersonalityVector) => number>;
}

export const ARCHETYPES: ArchetypeDef[] = [
  {
    id: 'boundary_guard',
    label: '边界守卫者',
    headline: '你守护的，比你说出来的多得多',
    description: '高度自我保护，清晰边界，冲突时选择退步——不是软弱，是策略。',
    cta: '测测你是哪种性格决策者？',
    score_rules: [
      (v) => (v.trust_threshold > 0.7 ? 3 : 0),
      (v) => (v.boundary_strength > 0.7 ? 2 : 0),
      (v) => (v.conflict_style === 'avoidant' || v.conflict_style === 'escapist' ? 2 : 0),
      (v) => (v.emotional_regulation === 'internalizing' ? 1 : 0),
    ],
  },
  {
    id: 'rational_explorer',
    label: '理性探客',
    headline: '你用脑子感受世界',
    description: '低设防、高分析，面对混乱时你的第一反应是理解而不是逃跑。',
    cta: '测测你是哪种性格决策者？',
    score_rules: [
      (v) => (v.trust_threshold < 0.4 ? 2 : 0),
      (v) => (v.conflict_style === 'analytical' ? 3 : 0),
      (v) => (v.emotional_regulation === 'rational' ? 2 : 0),
      (v) => (v.attachment_pattern === 'secure' || v.attachment_pattern === 'validating' ? 1 : 0),
    ],
  },
  {
    id: 'secure_connector',
    label: '安全连结者',
    headline: '你是少数真正能让别人放松的人',
    description: '互惠型信任＋安全依恋，你让关系自然流动，不用代价换连接。',
    cta: '测测你是哪种性格决策者？',
    score_rules: [
      (v) => (v.trust_threshold > 0.3 && v.trust_threshold < 0.65 ? 2 : 0),
      (v) => (v.attachment_pattern === 'secure' ? 3 : 0),
      (v) => (v.emotional_regulation === 'externalizing' ? 2 : 0),
      (v) => (v.conflict_style === 'analytical' ? 1 : 0),
    ],
  },
  {
    id: 'silent_observer',
    label: '独立观察者',
    headline: '你看得比大多数人深，但说得比大多数人少',
    description: '高边界、内化处理，你的距离感不是冷漠，是一种保护机制。',
    cta: '测测你是哪种性格决策者？',
    score_rules: [
      (v) => (v.boundary_strength > 0.6 && v.trust_threshold > 0.5 && v.trust_threshold < 0.85 ? 2 : 0),
      (v) => (v.conflict_style === 'avoidant' ? 2 : 0),
      (v) => (v.emotional_regulation === 'internalizing' ? 2 : 0),
      (v) => (v.attachment_pattern === 'avoidant' ? 2 : 0),
    ],
  },
  {
    id: 'sensitive_resonator',
    label: '敏感共鸣者',
    headline: '你感受到的，比别人想象的要多',
    description: '高情感敏感度＋焦虑依恋，你对关系的每一次波动都格外有感觉。',
    cta: '测测你是哪种性格决策者？',
    score_rules: [
      (v) => (v.attachment_pattern === 'anxious' ? 4 : 0),
      (v) => (v.emotional_regulation === 'externalizing' ? 2 : 0),
      (v) => (v.conflict_style === 'avoidant' || v.conflict_style === 'escapist' ? 1 : 0),
      (v) => (v.trust_threshold < 0.6 ? 1 : 0),
    ],
  },
  {
    id: 'direct_actor',
    label: '直觉行动者',
    headline: '你的本能反应，往往比你的理性判断更快更准',
    description: '低设防＋对抗型冲突风格，你相信直接比迂回更有效率。',
    cta: '测测你是哪种性格决策者？',
    score_rules: [
      (v) => (v.trust_threshold < 0.4 ? 2 : 0),
      (v) => (v.conflict_style === 'confrontational' ? 4 : 0),
      (v) => (v.emotional_regulation === 'rational' || v.emotional_regulation === 'externalizing' ? 1 : 0),
    ],
  },
  {
    id: 'balanced_mediator',
    label: '平衡协调者',
    headline: '你是那个让局面不至于崩掉的人',
    description: '分析型冲突应对＋稳定依恋，你本能地寻找平衡而不是极端。',
    cta: '测测你是哪种性格决策者？',
    score_rules: [
      (v) => (v.conflict_style === 'analytical' ? 3 : 0),
      (v) => (v.attachment_pattern === 'secure' || v.attachment_pattern === 'validating' ? 2 : 0),
      (v) => (v.emotional_regulation === 'rational' || v.emotional_regulation === 'deflecting' ? 1 : 0),
      (v) => (v.trust_threshold > 0.3 && v.trust_threshold < 0.7 ? 1 : 0),
    ],
  },
  {
    id: 'contradictory_explorer',
    label: '矛盾共存者',
    headline: '你比你自己认为的要复杂得多',
    description: '你的选择之间存在张力——这不是问题，这就是你最有趣的地方。',
    cta: '测测你是哪种性格决策者？',
    score_rules: [
      // Triggered when other archetypes all score low (handled in engine)
      (v) =>
        v.attachment_pattern === 'anxious' && v.conflict_style === 'confrontational' ? 2 : 0,
      (v) =>
        v.trust_threshold > 0.7 && v.emotional_regulation === 'externalizing' ? 2 : 0,
      (v) =>
        v.attachment_score < 0.4 && v.emotional_regulation === 'externalizing' ? 2 : 0,
    ],
  },
];

// ---------------------------------------------------------------
// Narrative Templates
// Constructed from vector — evidence-based, no labels
// ---------------------------------------------------------------

// Trust dimension description (scenario 1)
export const TRUST_NARRATIVES: Record<ChoiceOption, string> = {
  A: '凌晨那条让你拉起警戒线——不是冷漠，心理空间有严格门禁',
  B: '你用自我暴露回应信任——把心里一小块地让给了对方',
  C: '听完但没给出自己——在收集数据，观察是超能力',
  D: '别人的脆弱对你不是负担是入口——好奇心是进入关系的方式',
};

// Conflict dimension description (scenario 2)
export const CONFLICT_NARRATIVES: Record<ChoiceOption, string> = {
  A: '当众被质疑按下了暂停键——不是不回应，在等更有利的时机',
  B: '血冲上来但站住了——当众被冒犯，当众回应',
  C: '大脑自动切到"侦探模式"——是优势，但可能错过保护窗口',
  D: '尴尬感让你想逃——表面恢复平静，心里风暴没消失',
};

// Attachment dimension description (scenario 3)
export const ATTACHMENT_NARRATIVES: Record<ChoiceOption, string> = {
  A: '你给了对方解释的空间——关系对你有足够稳定感',
  B: '内心把"没有解释"翻译成最坏版本——敏感度是天赋也是负担',
  C: '用"无所谓"穿防弹衣——真无所谓的人不会来做这个测试',
  D: '不接受模糊——要的不只是信息，更是确认仍被重视',
};

// Regulation dimension description (scenario 4)
export const REGULATION_NARRATIVES: Record<ChoiceOption, string> = {
  A: '搞砸后一个人扛——情绪处理系统内向封闭，不依赖外部',
  B: '需要说出来才能处理——不是脆弱，关系型调节方式',
  C: '把失败变分析题——是效率，也是"不允许自己难过"的防御',
  D: '能切断反刍恢复快——但问题没解决还会回来',
};

export const STRESS_NARRATIVES: Record<ChoiceOption, string> = {
  A: '压力下大脑进入循环——反刍处理焦虑但无法真正休息',
  B: '神经系统难关闭——警戒高位，身体替精神状态买单',
  C: '外部手段切断压力——策略还是逃避取决于频率',
  D: '主动给身体按暂停——对身心连接有觉知',
};

export const ACHIEVEMENT_NARRATIVES: Record<ChoiceOption, string> = {
  A: '对完美的执念是代价——工作出色也活得累',
  B: '需要被看见——永远只发"准备好"的版本会越来越累',
  C: '用"差不多"保护自己——同时限制了可能性',
  D: '能接受不完美但有价值——一种成熟的分辨力',
};

export const SELFVIEW_NARRATIVES: Record<ChoiceOption, string> = {
  A: '用外部反馈修正认知——成长型思维的核心',
  B: '自我不轻易被动摇——稳定是优势，但变成墙会错过成长',
  C: '自我价值绑定外部认可——给你驱动力也让你脆弱',
  D: '自我认知是复杂的——矛盾是还没完成自我整合',
};

export const SOCIALENERGY_NARRATIVES: Record<ChoiceOption, string> = {
  A: '社交是充电器——但也需要他人确认自己状态',
  B: '对人际既渴望又恐惧——矛盾本身就值得探索',
  C: '清晰享受独处——但边界太清可能是害怕不确定',
  D: '能按场景调整模式——灵活是情商，也可能偶尔失去真实自己',
};

// ---------------------------------------------------------------
// EVA Opening Messages
// Bridges script → chat. Based on attachment pattern (primary signal)
// Slightly curious, not revealing too much, ends with a hook
// ---------------------------------------------------------------

export const OPENING_MESSAGES: Record<string, string[]> = {
  secure: [
    '你的选择很稳——一致，清晰，不慌乱。你是天生这样，还是练出来的？',
    '你给我的印象是对自己有感觉。最近有没有什么时刻，觉得自己不像你认识的那个自己？',
  ],
  anxious: [
    '有意思。你在第三个场景的反应说明了一些事——不急着告诉你。最近有没有类似经历？',
    '你的某些选择告诉我，你对"被忽视"非常敏感。这是你自己知道的，还是我第一个说出来的？',
  ],
  avoidant: [
    '你的选择在保持距离。我想知道：你是不在乎，还是在乎但学会了假装不在乎？',
    '你说"无所谓"——但真无所谓的人不会来做这个测试。你觉得呢？',
  ],
  validating: [
    '你选择了主动问清楚——要的是信息，还是被重视的感觉？这两个不一样。',
    '你不喜欢模糊地带。在关系里，什么时候"不确定"让你最不舒服？',
  ],
  mixed: [
    '你的选择之间有矛盾——不是问题，这是最有意思的地方。你自己注意到了吗？',
    '我看到的那个你，和你认为的那个你，可能不一样。想聊聊哪里不一样吗？',
  ],
};

// ---------------------------------------------------------------
// Contradiction Detection Pairs
// Used by chat engine's probe mechanism
// ---------------------------------------------------------------

export interface ContradictionRule {
  label: string;
  description: string; // Internal description for prompt building
  probe: string;       // What EVA says when contradiction is detected
}

export const CONTRADICTION_RULES: Array<{
  condition: (v: PersonalityVector) => boolean;
  rule: ContradictionRule;
}> = [
  {
    condition: (v) =>
      v.trust_threshold > 0.7 && v.emotional_regulation === 'externalizing',
    rule: {
      label: '高设防+外化情绪',
      description: 'User sets high boundaries but expresses emotions to others',
      probe:
        '你说不太让别人进来——但一旦失败会找人倾诉。这两件事加在一起说明什么？',
    },
  },
  {
    condition: (v) =>
      v.attachment_pattern === 'anxious' && v.conflict_style === 'avoidant',
    rule: {
      label: '焦虑依恋+回避冲突',
      description: 'User is anxious about relationships but avoids conflict to keep them',
      probe:
        '你在乎关系所以退步——但退步不解决问题，只是再撑一段时间。你知道吗？',
    },
  },
  {
    condition: (v) =>
      v.attachment_pattern === 'avoidant' && v.emotional_regulation === 'externalizing',
    rule: {
      label: '回避依恋+外化情绪',
      description: 'User claims low investment in relationships but seeks social support',
      probe:
        '你说关系无所谓——但情绪来了第一个找别人说。这两件事有点说不通。',
    },
  },
  {
    condition: (v) =>
      v.conflict_style === 'confrontational' && v.attachment_pattern === 'anxious',
    rule: {
      label: '对抗冲突+焦虑依恋',
      description: 'User is direct in conflict but anxious about abandonment',
      probe:
        '你会当场回应——但对关系的不确定又很敏感。两个都真实，但会互相消耗你。',
    },
  },
  {
    condition: (v) =>
      v.perfectionism_score > 0.8 && v.emotional_regulation === 'deflecting',
    rule: {
      label: '高完美主义+转移型调节',
      description: 'User has very high standards but deflects rather than processes emotions',
      probe:
        '你对自己要求很高，但情绪来了选择跳过——完美主义和情绪回避可能有关联。注意到吗？',
    },
  },
  {
    condition: (v) =>
      v.stress_response === 'rumination' && v.attachment_pattern === 'anxious',
    rule: {
      label: '反刍压力+焦虑依恋',
      description: 'User ruminates under stress and has anxious attachment pattern',
      probe:
        '压力下你陷入反刍，对关系稳定感又不够——这两件事叠加会特别累。你需要的是停止循环。',
    },
  },
  {
    condition: (v) =>
      v.selfview_pattern === 'performative' && v.boundary_strength < 0.4,
    rule: {
      label: '表演型自我+低边界',
      description: 'User seeks external validation but with low boundaries',
      probe:
        '你需要被认可但边界很薄——这意味着你会为让别人觉得你不错而突破底线。意识到这点了吗？',
    },
  },
  {
    condition: (v) =>
      v.social_energy_style === 'energy_draining' && v.emotional_regulation === 'externalizing',
    rule: {
      label: '社交能量消耗+外化调节',
      description: 'Socializing drains user yet they seek external support for regulation',
      probe:
        '你觉得社交很消耗——但情绪来了又需要找人倾诉。你用来恢复的方式恰恰在消耗你。',
    },
  },
];
