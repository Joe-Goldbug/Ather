/**
 * Theme-round assessment is intentionally separate from the legacy UBV test.
 * It records a current, evidence-linked observation; it does not calculate a
 * formal personality score before the measurement approvals exist.
 */

export const THEME_LENSES = [
  'emotion',
  'relationship',
  'social',
  'workplace',
  'self_evaluation',
] as const;

export type ThemeLens = (typeof THEME_LENSES)[number];
export type RoundItemRole = 'core' | 'clarifier' | 'counterexample';
export type RoundStatus =
  | 'in_progress'
  | 'ready_to_complete'
  | 'completed'
  | 'withheld'
  | 'abandoned';
export type RoundContext = 'daily' | 'pressure' | 'power_difference' | 'counterexample';
export type RoundApproach = 'approach' | 'protect' | 'analyze' | 'withdraw';
export type ThemeOptionId = 'A' | 'B' | 'C' | 'D';

export interface ThemeOption {
  id: ThemeOptionId;
  text: string;
  approach: RoundApproach;
}

export interface ThemeQuestion {
  question_id: string;
  parent_question_id?: string;
  question_bank_version: string;
  copy_version: string;
  theme_lens: ThemeLens;
  focus_key: string;
  focus_label: string;
  context: RoundContext;
  context_label: string;
  role: RoundItemRole;
  source: 'static' | 'dynamic';
  science_status: 'research_only' | 'approval_required' | 'approved';
  confounders: string[];
  prompt: string;
  options: ThemeOption[];
}

export interface ThemeRoundAnswer {
  question_id: string;
  choice_id: ThemeOptionId;
  free_text?: string;
  answered_at?: number;
}

export interface ThemeRoundEvidence {
  question_id: string;
  focus_label: string;
  context_label: string;
  choice_id: ThemeOptionId;
  choice_text: string;
  approach: RoundApproach;
}

export interface ThemeRoundObservation {
  focus: string;
  text: string;
  evidence_question_id: string;
}

export interface ThemeRoundResult {
  result_version: string;
  theme_lens: ThemeLens;
  theme_title: string;
  headline: string;
  summary: string;
  observations: ThemeRoundObservation[];
  strength: string;
  watchout: string;
  counterevidence: string;
  boundary: string;
  evidence: ThemeRoundEvidence[];
}

type FocusDefinition = {
  key: string;
  label: string;
  daily: string;
  pressure: string;
  power_difference: string;
  counterexample: string;
  confounders: string[];
};

type ThemeDefinition = {
  title: string;
  focus: FocusDefinition[];
  option_stems: Record<RoundApproach, string>;
  approach_summary: Record<RoundApproach, string>;
  strength: Record<RoundApproach, string>;
  watchout: Record<RoundApproach, string>;
};

const CONTEXTS: RoundContext[] = ['daily', 'pressure', 'power_difference', 'counterexample'];
const APPROACHES: RoundApproach[] = ['approach', 'protect', 'analyze', 'withdraw'];

const definitions: Record<ThemeLens, ThemeDefinition> = {
  emotion: {
    title: '情绪反应侧写',
    option_stems: {
      approach: '先把感受说出来，再决定下一步。',
      protect: '先把情绪压住，避免它影响别人或局面。',
      analyze: '先弄清发生了什么、我为什么会这样。',
      withdraw: '先离开或暂停，等自己能承受时再处理。',
    },
    approach_summary: {
      approach: '愿意让情绪被看见，再和它一起处理',
      protect: '先把情绪收住，优先维持局面的可控',
      analyze: '会先理解情绪的来处，再决定怎么回应',
      withdraw: '需要先拉开距离，给自己恢复空间',
    },
    strength: {
      approach: '你有把内在感受带进真实关系的能力，不必总靠别人猜。',
      protect: '你在情绪很满时仍会顾及后果，这让你不容易失控伤人。',
      analyze: '你会尝试把混乱感受拆开理解，通常能比冲动反应更晚一步。',
      withdraw: '你知道自己需要停下来，这是一种保护容量而不是失败。',
    },
    watchout: {
      approach: '当对方还没有准备好接住时，太快袒露可能让你觉得自己被忽略。',
      protect: '如果每次都先压住，别人会以为你没事，而你会独自消耗。',
      analyze: '理解很有帮助，但反复分析也可能把感受留在脑子里、迟迟没有出口。',
      withdraw: '暂停能恢复，但长期不回来处理会让关系和问题停在原地。',
    },
    focus: [
      {
        key: 'trigger',
        label: '情绪触发',
        daily: '一个小插曲让你突然很不舒服，但旁人觉得没什么。',
        pressure: '你连续疲惫几天后，又被一句无心的话刺到。',
        power_difference: '一个你在意的人当众轻描淡写地否定了你的感受。',
        counterexample: '这次同样的事发生，你却意外地没有被触发。',
        confounders: ['fatigue', 'recent_stress'],
      },
      {
        key: 'expression',
        label: '表达或压抑',
        daily: '朋友问你是不是不高兴，而你确实有点委屈。',
        pressure: '讨论正在继续，你的情绪已经快压不住。',
        power_difference: '面对更有话语权的人，你感到被误解。',
        counterexample: '你发现自己表达感受后，对方反而认真听了。',
        confounders: ['relationship_safety', 'power_difference'],
      },
      {
        key: 'regulation',
        label: '情绪调节',
        daily: '一个计划临时泡汤，你需要决定今晚怎么过。',
        pressure: '重要事情出了差错，时间又很紧。',
        power_difference: '别人的决定直接影响了你，却没有给你解释。',
        counterexample: '你以前会爆发的场面，这次你能稳住自己。',
        confounders: ['sleep', 'time_pressure'],
      },
      {
        key: 'recovery',
        label: '情绪恢复',
        daily: '一场不愉快结束后，你独自回到家。',
        pressure: '高压一天后，你还得面对明天的任务。',
        power_difference: '被上级批评后，你离开会议室。',
        counterexample: '你发现这次恢复得比以往快。',
        confounders: ['support_network', 'workload'],
      },
      {
        key: 'self_blame',
        label: '自责',
        daily: '关系里有点冷场，你开始回想自己哪里说错了。',
        pressure: '你犯了一个会被别人看见的小错误。',
        power_difference: '有人把问题归到你身上，但事实并不完全如此。',
        counterexample: '这次你能区分自己的责任和不属于你的部分。',
        confounders: ['self_esteem', 'role_expectations'],
      },
      {
        key: 'help_seeking',
        label: '求助',
        daily: '你状态很差，却不确定要不要找人说。',
        pressure: '你已经一个人扛了很久，事情仍然没有变轻。',
        power_difference: '你需要资源，但担心开口会显得不够强。',
        counterexample: '有人主动问你需要什么，你可以直接回答。',
        confounders: ['support_access', 'shame'],
      },
    ],
  },
  relationship: {
    title: '关系与情感侧写',
    option_stems: {
      approach: '主动靠近，把自己的需要说清楚。',
      protect: '先守住边界，不急着交出更多。',
      analyze: '先观察对方和关系的信号，再回应。',
      withdraw: '先后退一点，避免自己投入得太快。',
    },
    approach_summary: {
      approach: '倾向于通过靠近和表达来确认关系',
      protect: '倾向于先保护边界和节奏',
      analyze: '倾向于先读懂关系里的信号',
      withdraw: '倾向于在不确定时先撤回投入',
    },
    strength: {
      approach: '你愿意让关系有真实接触，而不是只等对方猜。',
      protect: '你会为自己留出空间，不轻易把安全感全交给关系。',
      analyze: '你对关系里的细节敏感，能较早察觉变化。',
      withdraw: '你能在不确定时先保护自己，避免被情绪完全带走。',
    },
    watchout: {
      approach: '如果靠近太快，回应稍慢就容易被你体验成落空。',
      protect: '边界很重要，但过早设防也可能让别人进不来。',
      analyze: '读信号有用，但过度解读会让关系变成持续的推理题。',
      withdraw: '先撤回能止损，但对方也可能只看到你的冷淡。',
    },
    focus: [
      {
        key: 'closeness',
        label: '靠近',
        daily: '一个你喜欢的人开始更频繁地联系你。',
        pressure: '对方在你最忙最乱的时候想靠近你。',
        power_difference: '对方掌握更多关系节奏，你担心自己显得太主动。',
        counterexample: '你原本想靠近，却发现自己这次想慢一点。',
        confounders: ['relationship_stage', 'recent_hurt'],
      },
      {
        key: 'trust',
        label: '信任',
        daily: '对方答应的事晚了一点完成，却没有提前说明。',
        pressure: '你必须决定要不要把一件重要的事交给对方。',
        power_difference: '对方的承诺会影响你的选择，但你无法控制结果。',
        counterexample: '对方犯过错后，这次用行动修复了。',
        confounders: ['history', 'stakes'],
      },
      {
        key: 'boundary',
        label: '边界',
        daily: '朋友临时希望你放下自己的安排帮忙。',
        pressure: '对方反复越过你已经说过的界限。',
        power_difference: '拒绝可能会让你失去一段重要关系或机会。',
        counterexample: '你拒绝后，对方尊重了你的决定。',
        confounders: ['power_difference', 'care_norms'],
      },
      {
        key: 'conflict',
        label: '冲突',
        daily: '你和重要的人对同一件事理解完全不同。',
        pressure: '争执正在升级，对方语气越来越重。',
        power_difference: '对方比你更有话语权，却误会了你的意思。',
        counterexample: '这次争执没有变成输赢，而是出现了理解。',
        confounders: ['conflict_history', 'public_setting'],
      },
      {
        key: 'repair',
        label: '修复',
        daily: '一场尴尬或伤人的对话结束了。',
        pressure: '关系已经冷了几天，双方都没有先开口。',
        power_difference: '你觉得自己受了伤，但又害怕修复会显得低头。',
        counterexample: '对方先道歉了，但你还没有完全放下。',
        confounders: ['accountability', 'attachment_history'],
      },
      {
        key: 'uncertainty',
        label: '不确定感',
        daily: '对方的回复比平时慢，你不知道原因。',
        pressure: '重要的人突然变得疏远，而你正需要支持。',
        power_difference: '你无法问清楚，只能等待对方决定关系走向。',
        counterexample: '后来发现对方的冷淡与自己无关。',
        confounders: ['communication_norms', 'recent_loss'],
      },
    ],
  },
  social: {
    title: '社交方式侧写',
    option_stems: {
      approach: '主动加入，先建立一点连接。',
      protect: '保持礼貌但保留自己的距离。',
      analyze: '先观察气氛和位置，再决定怎么参与。',
      withdraw: '尽量减少参与，把能量留给自己。',
    },
    approach_summary: {
      approach: '愿意主动打开社交连接',
      protect: '会在社交中保留自己的边界',
      analyze: '倾向于先观察再选择位置',
      withdraw: '会优先控制社交消耗和暴露',
    },
    strength: {
      approach: '你能主动让关系开始，不完全依赖别人递出邀请。',
      protect: '你知道社交不等于必须交出自己。',
      analyze: '你能读懂场域，再选择适合自己的参与方式。',
      withdraw: '你会管理有限的社交能量，而不是硬撑。',
    },
    watchout: {
      approach: '主动很多时，也要留意自己是不是在替所有人维持气氛。',
      protect: '保留能保护你，但别人可能难以知道如何接近你。',
      analyze: '观察久了可能错过真正适合你加入的时机。',
      withdraw: '减少消耗有必要，但长期撤离会让支持网络变窄。',
    },
    focus: [
      {
        key: 'initiation',
        label: '主动参与',
        daily: '一个新群体正在聊天，你认识其中一个人。',
        pressure: '活动快结束了，你仍然没有和谁真正说上话。',
        power_difference: '群里的人资历都比你高，你被邀请发言。',
        counterexample: '这次别人先来找你，而你要决定是否接住。',
        confounders: ['familiarity', 'language'],
      },
      {
        key: 'group_position',
        label: '群体位置',
        daily: '多人讨论时，话题转得很快。',
        pressure: '大家都在表达强烈观点，你的想法不同。',
        power_difference: '主导讨论的人没有给你太多空间。',
        counterexample: '你发现自己这次自然成了连接不同人的人。',
        confounders: ['group_size', 'status'],
      },
      {
        key: 'rejection',
        label: '拒绝',
        daily: '你发出的邀约被对方婉拒了。',
        pressure: '你期待很久的社交计划临时取消。',
        power_difference: '一个对你重要的人没有回应你的邀请。',
        counterexample: '对方拒绝了这次，但给出了明确的下次时间。',
        confounders: ['relationship_history', 'timing'],
      },
      {
        key: 'energy',
        label: '能量消耗',
        daily: '聚会还在继续，但你开始觉得累。',
        pressure: '连续几天都有社交安排，没有真正独处。',
        power_difference: '你必须在重要场合保持投入，即使已经疲惫。',
        counterexample: '这次社交结束后，你反而感到被充电。',
        confounders: ['health', 'introversion_extraversion'],
      },
      {
        key: 'self_disclosure',
        label: '自我暴露',
        daily: '聊天转向更私人的话题，别人开始分享自己。',
        pressure: '你很想被理解，但担心说多了会后悔。',
        power_difference: '提问的人可能影响你未来的机会。',
        counterexample: '你说出一点真实感受后，关系变得更轻松。',
        confounders: ['trust', 'privacy'],
      },
      {
        key: 'recovery',
        label: '退出恢复',
        daily: '你想提前离开一个还不错的聚会。',
        pressure: '你已经超出社交容量，却怕扫大家兴。',
        power_difference: '离开可能被理解成不合群。',
        counterexample: '你清楚表达要离开后，别人自然地接受了。',
        confounders: ['social_norms', 'transport'],
      },
    ],
  },
  workplace: {
    title: '职场应对侧写',
    option_stems: {
      approach: '直接进入协作，把需要和方案说清楚。',
      protect: '先守住职责和底线，避免被动承担。',
      analyze: '先弄清标准、信息和优先级。',
      withdraw: '先降低暴露，自己消化后再决定。',
    },
    approach_summary: {
      approach: '愿意通过协作推进事情',
      protect: '优先守住职责、资源和边界',
      analyze: '会先对齐标准和事实',
      withdraw: '会在压力下先降低外部暴露',
    },
    strength: {
      approach: '你能把分歧带回共同解决问题，而不只停在情绪对抗。',
      protect: '你对责任边界敏感，不容易无条件吞下不合理任务。',
      analyze: '你会先厘清标准，减少无效努力。',
      withdraw: '你会避免在准备不足时仓促表态，给自己留判断空间。',
    },
    watchout: {
      approach: '过度承担协作角色，容易让你默默补上所有人的缺口。',
      protect: '守边界时也要避免让合作方只感到你在防守。',
      analyze: '等信息完全齐全才行动，有时会错过需要先试一步的机会。',
      withdraw: '降低暴露能自保，但关键时刻不表达会让价值难以被看见。',
    },
    focus: [
      {
        key: 'feedback',
        label: '反馈',
        daily: '同事对你的方案提出具体修改意见。',
        pressure: '你花了很多时间的成果被要求重做。',
        power_difference: '上级只说“不够好”，却没有解释标准。',
        counterexample: '这次反馈虽然尖锐，但后来确实让成果更好。',
        confounders: ['role', 'feedback_quality'],
      },
      {
        key: 'disagreement',
        label: '分歧',
        daily: '会议中你不同意多数人的方案。',
        pressure: '项目快截止了，团队仍然没有共识。',
        power_difference: '提出不同意见的人是你的直属上级。',
        counterexample: '你表达异议后，团队愿意一起修改方向。',
        confounders: ['status', 'deadline'],
      },
      {
        key: 'deadline',
        label: '期限',
        daily: '任务不少，但截止时间还有一点余地。',
        pressure: '临时加急任务挤进已经满的计划。',
        power_difference: '对方要求你承诺一个你认为不现实的时间。',
        counterexample: '这次你提前说明风险，反而获得资源。',
        confounders: ['workload', 'control'],
      },
      {
        key: 'responsibility',
        label: '责任',
        daily: '一个问题出现了，责任边界还不清楚。',
        pressure: '事情出错后，大家都在等谁先承担。',
        power_difference: '比你级别高的人暗示你接下不属于你的部分。',
        counterexample: '你说明边界后，责任被重新公平分配。',
        confounders: ['team_culture', 'job_security'],
      },
      {
        key: 'collaboration',
        label: '协作',
        daily: '合作方交付不完整，影响了你的工作。',
        pressure: '双方都很忙，但必须在今天对齐。',
        power_difference: '资源掌握在别人手里，而你需要推进进度。',
        counterexample: '你先理解对方限制后，协作反而顺了。',
        confounders: ['dependency', 'communication'],
      },
      {
        key: 'recognition',
        label: '认可与失败',
        daily: '你的贡献没有被特别提到。',
        pressure: '重要成果被别人抢先呈现或忽略。',
        power_difference: '评价你的人并不了解你的实际投入。',
        counterexample: '这次你主动说明贡献，得到的是具体反馈而不是反感。',
        confounders: ['visibility', 'organization_norms'],
      },
    ],
  },
  self_evaluation: {
    title: '自我关系侧写',
    option_stems: {
      approach: '承认感受和需要，同时继续往前。',
      protect: '先保住自尊，不急着把自己交给评价。',
      analyze: '先分清事实、责任和可以改的部分。',
      withdraw: '先远离比较或评价，等自己稳定一点。',
    },
    approach_summary: {
      approach: '愿意带着不完美继续行动',
      protect: '会先保护自我价值不被一次评价吞没',
      analyze: '会先拆开事实和自我判断',
      withdraw: '会先撤离让自己过度消耗的评价场域',
    },
    strength: {
      approach: '你能在不确定中继续行动，不把完美当成开始条件。',
      protect: '你会保护自己的价值感，不轻易让外界定义全部的你。',
      analyze: '你会把“我不好”拆回可处理的事实，这很有力量。',
      withdraw: '你知道什么时候环境正在过度消耗自己。',
    },
    watchout: {
      approach: '一直往前也可能让你错过真正需要休息或重新评估的时刻。',
      protect: '保护价值感时，留意是否也挡住了有用的反馈。',
      analyze: '分析能帮助你，但过度复盘会变成另一种自我审判。',
      withdraw: '暂时远离有用，长期回避评价会让你失去校准机会。',
    },
    focus: [
      {
        key: 'standards',
        label: '自我要求',
        daily: '一件事已经做到合格，但还不够理想。',
        pressure: '时间不够，你必须在“更好”和“交付”之间选。',
        power_difference: '别人对你的标准很高，你也不想让人失望。',
        counterexample: '这次你决定做到足够好，而不是做到无可挑剔。',
        confounders: ['role_expectations', 'deadline'],
      },
      {
        key: 'error_attribution',
        label: '犯错归因',
        daily: '你犯了一个小错，别人也注意到了。',
        pressure: '错误发生在重要节点，后果可能被放大。',
        power_difference: '有人直接把失败归因于你。',
        counterexample: '后来证据显示，问题并不完全由你造成。',
        confounders: ['visibility', 'team_context'],
      },
      {
        key: 'comparison',
        label: '比较',
        daily: '你看到同龄人完成了你也想做的事。',
        pressure: '你正处在低谷，而别人看起来进展很快。',
        power_difference: '比较对象拥有你暂时没有的资源或机会。',
        counterexample: '比较之后，你反而更清楚自己真正想要什么。',
        confounders: ['social_media', 'opportunity'],
      },
      {
        key: 'praise',
        label: '接受赞美',
        daily: '有人真诚肯定了你的努力。',
        pressure: '你刚好觉得自己做得不够好，却被别人表扬。',
        power_difference: '重要的人公开认可了你。',
        counterexample: '你接受肯定后，没有觉得自己是在自满。',
        confounders: ['self_esteem', 'culture'],
      },
      {
        key: 'uncertainty',
        label: '不确定性',
        daily: '你做了选择，却不能立刻知道结果。',
        pressure: '一个重要决定没有标准答案。',
        power_difference: '结果取决于别人，而你只能等待。',
        counterexample: '不确定还在，但你这次没有被它完全拖住。',
        confounders: ['control', 'financial_pressure'],
      },
      {
        key: 'failure_recovery',
        label: '失败恢复',
        daily: '努力没有得到预期结果。',
        pressure: '失败发生在你很看重的事情上。',
        power_difference: '失败被公开看见，评价可能随之而来。',
        counterexample: '这次失败后，你重新开始得比过去快。',
        confounders: ['support', 'identity_investment'],
      },
    ],
  },
};

const optionSuffix: Record<RoundContext, Record<RoundApproach, string>> = {
  daily: {
    approach: '把话题带回眼前的人和事。',
    protect: '先确认这会不会越过自己的界限。',
    analyze: '先把情况和感受分开看。',
    withdraw: '先暂时不回应，给自己一点空间。',
  },
  pressure: {
    approach: '即使时间紧，也先说出最关键的需要。',
    protect: '不因为着急就答应不合适的事。',
    analyze: '先抓住最能改变局面的信息。',
    withdraw: '先停止加码，避免在高压下做决定。',
  },
  power_difference: {
    approach: '用清楚、可承担的方式表达自己。',
    protect: '先守住不愿交换的底线。',
    analyze: '先看清对方权力和现实限制。',
    withdraw: '先不在这个时点暴露更多。',
  },
  counterexample: {
    approach: '把这次不同当作新的可能性。',
    protect: '确认自己仍然有选择权。',
    analyze: '追问是什么条件让结果不同。',
    withdraw: '先不急着给自己下结论。',
  },
};

export const THEME_QUESTION_BANK_VERSION = 'theme-round-candidate-2026-07-30-v1';

export function getThemeTitle(lens: ThemeLens): string {
  return definitions[lens].title;
}

export function getThemeQuestionBank(lens?: ThemeLens): ThemeQuestion[] {
  const selected = lens ? [lens] : [...THEME_LENSES];
  return selected.flatMap((theme) => {
    const definition = definitions[theme];
    return definition.focus.flatMap((focus) =>
      CONTEXTS.map((context) => ({
        question_id: `${theme}.${focus.key}.${context}.v1`,
        question_bank_version: THEME_QUESTION_BANK_VERSION,
        copy_version: 'zh-CN-v1',
        theme_lens: theme,
        focus_key: focus.key,
        focus_label: focus.label,
        context,
        context_label:
          context === 'daily'
            ? '日常情境'
            : context === 'pressure'
              ? '压力情境'
              : context === 'power_difference'
                ? '权力差异情境'
                : '反例情境',
        role: 'core' as const,
        source: 'static' as const,
        science_status: 'approval_required' as const,
        confounders: focus.confounders,
        prompt: focus[context],
        options: APPROACHES.map((approach, index) => ({
          id: (['A', 'B', 'C', 'D'] as ThemeOptionId[])[index]!,
          approach,
          text: `${definition.option_stems[approach]} ${optionSuffix[context][approach]}`,
        })),
      }))
    );
  });
}

/** Selects one distinct situation for each of the six theme focuses. */
export function selectThemeRoundCore(lens: ThemeLens, roundOrdinal: number, disputedQuestionId?: string): ThemeQuestion[] {
  const questions = getThemeQuestionBank(lens);
  const core = definitions[lens].focus.map((focus, index) => {
    const variants = questions.filter((question) => question.focus_key === focus.key);
    return variants[(Math.max(0, roundOrdinal) + index) % variants.length]!;
  });
  const disputed = questions.find((question) => question.question_id === disputedQuestionId);
  if (!disputed) return core;
  const variants = questions.filter((question) => question.focus_key === disputed.focus_key);
  const oldIndex = variants.findIndex((question) => question.question_id === disputed.question_id);
  const alternate = variants[(oldIndex + 1) % variants.length]!;
  return [alternate, ...core.filter((question) => question.focus_key !== disputed.focus_key)];
}

export function validateThemeRoundAnswers(
  questions: ThemeQuestion[],
  answers: ThemeRoundAnswer[]
): string[] {
  const errors: string[] = [];
  const coreIds = new Set(
    questions.filter((question) => question.role === 'core').map((question) => question.question_id)
  );
  const answerIds = new Set(answers.map((answer) => answer.question_id));
  if (coreIds.size < 6) errors.push('round_requires_six_core_questions');
  for (const id of coreIds) if (!answerIds.has(id)) errors.push(`missing_core_answer:${id}`);
  if (answers.length > 8) errors.push('round_exceeds_eight_decision_points');
  for (const answer of answers) {
    const question = questions.find((item) => item.question_id === answer.question_id);
    if (!question) errors.push(`unknown_question:${answer.question_id}`);
    else if (!question.options.some((option) => option.id === answer.choice_id))
      errors.push(`invalid_choice:${answer.question_id}`);
  }
  return errors;
}

/**
 * Dynamic follow-up is a bounded clarification, never a replacement for the
 * six core decisions. It is only needed when the six answers show a material
 * split between connecting and self-protecting patterns, or complete retreat.
 */
export function decideThemeRoundFollowUp(
  questions: ThemeQuestion[],
  answers: ThemeRoundAnswer[]
): ThemeQuestion | null {
  const evidence = resolveEvidence(questions, answers);
  const adaptiveQuestions = questions.filter((question) => question.role !== 'core');
  if (adaptiveQuestions.length >= 2) return null;
  const coreQuestionIds = new Set(
    questions.filter((question) => question.role === 'core').map((question) => question.question_id)
  );
  const coreEvidence = evidence.filter((item) => coreQuestionIds.has(item.question_id));
  const approaches = new Set(coreEvidence.map((item) => item.approach));
  const lens = questions[0]?.theme_lens;
  if (!lens || coreEvidence.length < 6) return null;
  const latestAdaptive = adaptiveQuestions.at(-1);
  const latestAdaptiveAnswer = latestAdaptive
    ? answers.find((answer) => answer.question_id === latestAdaptive.question_id)
    : undefined;
  const latestAdaptiveEvidence = latestAdaptive
    ? evidence.find((item) => item.question_id === latestAdaptive.question_id)
    : undefined;
  const hasExplicitContext = answers.some((answer) => Boolean(answer.free_text?.trim()));
  const role: RoundItemRole | null = latestAdaptive
    ? latestAdaptiveAnswer?.free_text?.trim() ||
      latestAdaptiveEvidence?.approach === 'approach' ||
      latestAdaptiveEvidence?.approach === 'withdraw'
      ? 'clarifier'
      : null
    : approaches.has('approach') && approaches.has('withdraw')
      ? 'counterexample'
      : coreEvidence.filter((item) => item.approach === 'withdraw').length >= 4 ||
          hasExplicitContext
        ? 'clarifier'
        : null;
  if (!role) return null;
  const definition = definitions[lens];
  const adaptiveChoiceText: Record<RoundApproach, string> = {
    approach: '继续靠近或表达',
    protect: '先保护自己的边界',
    analyze: '继续观察和分析',
    withdraw: '先暂停或退出',
  };
  const text = latestAdaptive
    ? `你在刚才的追问中选择了“${
        adaptiveChoiceText[latestAdaptiveEvidence?.approach ?? 'analyze']
      }”。当对方进一步回应时，你更可能怎么做？`
    : role === 'counterexample'
      ? '刚才有些情境里你愿意靠近，有些情境里你选择后退。请选一个更接近真实情况的后续做法。'
      : '你多次选择先退开。请选一个更接近真实情况的后续做法。';
  const followupNumber = adaptiveQuestions.length + 1;
  return {
    question_id: `${lens}.followup.${role}.${followupNumber}.v1`,
    parent_question_id: latestAdaptive?.question_id,
    question_bank_version: THEME_QUESTION_BANK_VERSION,
    copy_version: 'zh-CN-v1',
    theme_lens: lens,
    focus_key: role,
    focus_label: role === 'counterexample' ? '反例追问' : '澄清追问',
    context: 'counterexample',
    context_label: role === 'counterexample' ? '反例情境' : '澄清情境',
    role,
    source: 'dynamic',
    science_status: 'approval_required',
    confounders: ['current_context', 'response_interpretation'],
    prompt: text,
    options: APPROACHES.map((approach, index) => ({
      id: (['A', 'B', 'C', 'D'] as ThemeOptionId[])[index]!,
      approach,
      text: `${definition.option_stems[approach]} ${optionSuffix.counterexample[approach]}`,
    })),
  };
}

export function buildThemeRoundResult(
  lens: ThemeLens,
  questions: ThemeQuestion[],
  answers: ThemeRoundAnswer[]
): ThemeRoundResult | null {
  const errors = validateThemeRoundAnswers(questions, answers);
  if (
    errors.some(
      (error) =>
        error.startsWith('missing_core_answer') || error === 'round_requires_six_core_questions'
    )
  )
    return null;
  const definition = definitions[lens];
  const evidence = resolveEvidence(questions, answers);
  if (evidence.length < 6) return null;
  const counts = APPROACHES.map((approach) => ({
    approach,
    count: evidence.filter((item) => item.approach === approach).length,
  }));
  const dominant = [...counts].sort(
    (a, b) => b.count - a.count || a.approach.localeCompare(b.approach)
  )[0]!.approach;
  const topCount = Math.max(...counts.map((item) => item.count));
  const hasSingleDominant = counts.filter((item) => item.count === topCount).length === 1;
  const observations = evidence.slice(0, 4).map((item) => ({
    focus: item.focus_label,
    evidence_question_id: item.question_id,
    text: `在${item.context_label}的「${item.focus_label}」里，你选择了「${item.choice_text}」；这轮你更倾向于${definition.approach_summary[item.approach]}。`,
  }));
  const varied = new Set(evidence.map((item) => item.approach)).size > 1;
  return {
    result_version: 'theme-round-result-2026-07-30-v1',
    theme_lens: lens,
    theme_title: `本轮${definition.title}`,
    headline: hasSingleDominant
      ? `这轮${definition.title}里，你更常${definition.approach_summary[dominant]}。`
      : `这轮${definition.title}里，你在不同情境中采用了不同的应对方式。`,
    summary: `这不是对你的固定定义，而是六个具体情境里反复出现的应对方向。下面每一条都能回看你当时的选择。`,
    observations,
    strength: hasSingleDominant
      ? definition.strength[dominant]
      : '你在这轮不同情境中保留了多种回应方式。',
    watchout: hasSingleDominant
      ? definition.watchout[dominant]
      : '目前没有单一方向，不能据此推断稳定倾向。',
    counterevidence: varied
      ? '你在不同情境里并不是同一种反应。这个差异值得保留，下一轮可以继续看什么条件会让你靠近、保护、分析或后退。'
      : '这轮选择比较集中，但还不能说明这会在所有关系、时间和压力情境里都一样。',
    boundary: '这是本轮主题测试留下的可回看线索，不是对你的永久人格定义。',
    evidence,
  };
}

function resolveEvidence(
  questions: ThemeQuestion[],
  answers: ThemeRoundAnswer[]
): ThemeRoundEvidence[] {
  return answers.flatMap((answer) => {
    const question = questions.find((item) => item.question_id === answer.question_id);
    const option = question?.options.find((item) => item.id === answer.choice_id);
    if (!question || !option) return [];
    return [
      {
        question_id: question.question_id,
        focus_label: question.focus_label,
        context_label: question.context_label,
        choice_id: option.id,
        choice_text: option.text,
        approach: option.approach,
      },
    ];
  });
}
