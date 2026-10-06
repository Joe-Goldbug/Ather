import type { Locale } from '../shared/locales.js';
import type { ChoiceOption } from '../shared/types.js';

export interface OptionCopy {
  text: string;
  label: string;
  feedback: string;
}

export interface ScenarioCopy {
  title: string;
  setup: string;
  prompt: string;
  options: Record<ChoiceOption, OptionCopy>;
}

type LocaleCopy = Record<string, ScenarioCopy>;

// Level 1 is currently Chinese-first by product decision.
// Other locales temporarily reuse the Chinese copy so the baseline stays
// complete and testable instead of silently falling back to an old question set.
const ZH: LocaleCopy = {
  trust: {
    title: '先接住，还是先留边界',
    setup: '一个你还不算很熟的人，深夜突然发来很长一段消息，讲了自己最近最脆弱的状态，还说“我不知道还能跟谁说”。',
    prompt: '你更可能怎么回应？',
    options: {
      A: { text: '马上认真接住，继续问细节，也让对方知道你愿意听。', label: '先靠近', feedback: '你对脆弱信号的开放度比较高，连接往往先于防备。' },
      B: { text: '表达关心，但会留一点边界，比如约到白天再聊，或只回应最核心的部分。', label: '关心但设限', feedback: '你愿意靠近，但不会立刻把自己完全放进对方的情绪里。' },
      C: { text: '先把话题拉回实际问题，帮对方想办法，不太进入情绪层。', label: '先解决事', feedback: '你更信任可处理的事实，而不是立刻进入高强度情绪交换。' },
      D: { text: '先不回或很晚再回，等自己准备好再决定要不要接住。', label: '先拉开', feedback: '你需要先确认安全和容量，再决定别人能靠你多近。' },
    },
  },
  conflict: {
    title: '被当众否定方案',
    setup: '会议上，你刚讲完一个准备了很久的方案，同事当着所有人说：“这个方向我觉得根本走不通。”',
    prompt: '你第一反应更接近哪一种？',
    options: {
      A: { text: '立刻反问具体哪里不通，把问题摊开讲清楚。', label: '当场顶住', feedback: '你倾向在现场把主动权拿回来，不愿让模糊否定悬着。' },
      B: { text: '先让对方把理由说完，再逐点回应。', label: '先听再拆', feedback: '你更偏向带着控制感地处理冲突，而不是先拼气势。' },
      C: { text: '表面先接住，会议后再单独处理，不想在现场把气氛顶太满。', label: '延后处理', feedback: '你会优先管理场面和关系，再决定要不要正面碰撞。' },
      D: { text: '先退一步，不再继续争，心里记下这次不舒服。', label: '先收回去', feedback: '你面对公开冲突时更容易先撤出，代价是自己的立场可能被压住。' },
    },
  },
  attachment: {
    title: '重要的人突然冷下来',
    setup: '一个对你来说很重要的人，这几天明显变冷，但没有解释原因，回复也比以前少很多。',
    prompt: '你更可能怎么理解并行动？',
    options: {
      A: { text: '主动问清楚发生了什么，不想让猜测一直拖着。', label: '直接确认', feedback: '你更愿意把不确定性摊到台面上，而不是让它自己发酵。' },
      B: { text: '先观察一阵，给对方空间，不急着立刻定义这段变化。', label: '先留空间', feedback: '你对关系波动有一定容纳度，不会马上把它翻译成拒绝。' },
      C: { text: '开始反复想是不是自己哪里做错了，会想办法补救。', label: '先怪自己', feedback: '关系信号一旦变模糊，你比较容易先往“是不是我不够好”上走。' },
      D: { text: '也跟着收回自己，告诉自己不要再投入太多。', label: '先抽离', feedback: '当你感到失衡时，你会用撤回来保护自己不被进一步伤到。' },
    },
  },
  emotion: {
    title: '重要失败是自己造成的',
    setup: '一件很重要的事做砸了，而且你很清楚，核心失误确实在你自己。',
    prompt: '情绪上来以后，你更容易走向哪条路？',
    options: {
      A: { text: '先把事实整理清楚，马上进入补救和修正。', label: '先修复', feedback: '你会把情绪往行动里导，试图用处理问题来重新站稳。' },
      B: { text: '允许自己难受一会儿，再找可信的人说清楚。', label: '先消化', feedback: '你不是没有情绪，而是更愿意让情绪被看见后再继续行动。' },
      C: { text: '会先替自己找一些外部原因，让自己别那么难受。', label: '先缓冲', feedback: '你会先保护自我完整，再决定要不要完全承担这次失败。' },
      D: { text: '很容易陷进自责，反复回想自己怎么会犯这种错。', label: '先自罚', feedback: '你对自己的失误不容易轻轻放过，情绪常会先变成内耗。' },
    },
  },
  stress: {
    title: '连续高压，还睡不好',
    setup: '你已经连续几天高压运转、睡眠不足，但手上的关键任务还在往上堆。',
    prompt: '你通常会怎么应对这种状态？',
    options: {
      A: { text: '快速排序，先砍掉低优先级，保住最重要的那部分。', label: '先做取舍', feedback: '你压力下会优先重建控制感，而不是试图全部扛住。' },
      B: { text: '顶着做，逼自己再冲一段，等忙完再说。', label: '继续硬扛', feedback: '你在压力里容易进入高激活模式，先靠推动力撑过去。' },
      C: { text: '表面继续做，但其实已经有点麻木，只是在机械推进。', label: '麻木推进', feedback: '你未必停下，但身心会先切成低感受模式来过载生存。' },
      D: { text: '会拖、会逃，哪怕知道拖下去只会更糟。', label: '先回避', feedback: '当压力超过容量时，你更容易先从任务里退出，而不是继续硬碰。' },
    },
  },
  achievement: {
    title: '有瑕疵，还要不要熬夜改',
    setup: '一个要交出去的方案已经能用，但你很清楚里面还有几处不完美。再改一晚会更好，但你也已经很累了。',
    prompt: '你更可能怎么选？',
    options: {
      A: { text: '继续改，宁愿多熬一点，也想把它交到自己能接受的标准。', label: '标准优先', feedback: '你对“交出去之前够不够好”这件事要求比较高。' },
      B: { text: '只改最关键的缺口，剩下的接受它不是满分。', label: '关键优先', feedback: '你在质量和代价之间会做权衡，不追求处处都满。' },
      C: { text: '按时交，清楚说明限制，不再额外消耗自己。', label: '边界优先', feedback: '你更重视可持续性，不愿为了完美反复透支。' },
      D: { text: '找值得信任的人快速帮你过一遍，再决定要不要继续改。', label: '借外部校准', feedback: '你会把成败的一部分交给外部反馈来校正，而不是只靠自己闷头判断。' },
    },
  },
  selfview: {
    title: '被你认可的人公开否定',
    setup: '一个你很认可、也很在意其判断的人，当众否定了你投入很多的作品或想法。',
    prompt: '你更像会怎么处理这一下？',
    options: {
      A: { text: '先拆里面有没有真问题，有的话就吸收，没有就放下。', label: '分离评价', feedback: '你有能力把“我是谁”和“这次被否定了”分开看。' },
      B: { text: '先保护自己的判断，不急着让这次评价改写你。', label: '先护住自己', feedback: '你需要先稳住自我感，再决定要不要让反馈进来。' },
      C: { text: '会明显怀疑自己，甚至连继续做下去的劲都被打掉。', label: '被打塌', feedback: '外部否定很容易碰到你的核心自我评价，而不只是作品本身。' },
      D: { text: '第一反应会想到是不是条件、资源或环境本来就不公平。', label: '先看外因', feedback: '你会先从外部结构里找解释，这能保护你，也可能挡住部分真实反馈。' },
    },
  },
  socialenergy: {
    title: '独处久了，被邀请出门',
    setup: '你已经自己待了挺久，这时有人邀请你去一个不算重要、但也不讨厌的聚会。',
    prompt: '你更可能怎么决定？',
    options: {
      A: { text: '去，觉得换到人群里反而能让自己重新有点活力。', label: '社交回血', feedback: '你有时会通过人与人的流动感把自己重新点亮。' },
      B: { text: '可以去，但会给自己设时长或保留随时离开的空间。', label: '有限参与', feedback: '你不是简单想去或不想去，你更在意是否能掌握自己的能量消耗。' },
      C: { text: '不太想去，更想把这段独处继续留给自己。', label: '独处恢复', feedback: '你倾向把安静和不被打扰当成真正有效的恢复方式。' },
      D: { text: '会去，但更多是因为不好意思拒绝，回来通常更累。', label: '关系驱动', feedback: '你会为了关系或气氛参与社交，但代价常落在你自己的能量上。' },
    },
  },
  conflict_friend: {
    title: '好朋友指出你没做好',
    setup: '一个关系很近的朋友跟你合作了一件事，结束后他说：“你那一部分其实没处理好，我有点失望。”',
    prompt: '面对亲近关系里的这类评价，你更像哪种反应？',
    options: {
      A: { text: '直接问清楚哪里没做好，不想让误会和情绪一起长大。', label: '先讲明白', feedback: '关系越近，你越想尽快把真实问题摊开，而不是让它沉着。' },
      B: { text: '先接住对方感受，再慢慢讨论事实，不想让关系先炸。', label: '先稳关系', feedback: '你处理亲近冲突时，会更主动照顾连接本身。' },
      C: { text: '表面接受，心里其实会记住这一下，之后会变得保留。', label: '收进心里', feedback: '你未必当场冲突，但亲近关系里的失望会在你心里留下痕。' },
      D: { text: '先躲一下，不想立刻碰，因为会觉得很压。', label: '先避开', feedback: '熟人冲突对你的负荷更大，所以你更可能先退出现场。' },
    },
  },
  stress_chronic: {
    title: '长期努力，却没反馈',
    setup: '你已经努力了一段时间，但这件事一直没有明显反馈，也看不到什么时候会有结果。',
    prompt: '长期看不到回报时，你更可能怎么撑？',
    options: {
      A: { text: '重新定义阶段目标，让自己至少看见一点可验证的进展。', label: '重设坐标', feedback: '你更靠重新组织意义和节奏来抵抗长期消耗。' },
      B: { text: '继续加码投入，想靠更努力打穿这个阶段。', label: '再顶一段', feedback: '没有反馈时，你容易把“再多做一点”当成主要应对方式。' },
      C: { text: '先把投入降下来，避免自己被这件事拖空。', label: '先保容量', feedback: '你会在长期拉扯里优先守住可持续性，而不是一直硬撑。' },
      D: { text: '继续做，但心里已经有点抽离，只是惯性在推你。', label: '惯性前进', feedback: '你不一定停止，但动力和意义感可能先被耗薄。' },
    },
  },
  social_lowenergy: {
    title: '累到不行，朋友又来约',
    setup: '你已经很累了，这时一个亲近的朋友邀请你见面，说只是想陪你待一会儿。',
    prompt: '在低能量状态下，你更可能怎么回应？',
    options: {
      A: { text: '坦白自己很累，但愿意换成低消耗的见法，比如散步或短聊。', label: '调低强度也连接', feedback: '你会尝试同时保护能量和关系，而不是二选一。' },
      B: { text: '答应去，因为亲近的人值得，但去之前已经知道会消耗。', label: '关系优先', feedback: '你会为了关系把自己推出去，哪怕知道恢复成本不低。' },
      C: { text: '还是拒绝，觉得现在最需要的是一个人先缓回来。', label: '恢复优先', feedback: '你能在亲近关系里表达自己的容量边界，而不是勉强维持在场。' },
      D: { text: '先拖着不回复，既不想拒绝，也没有力气答应。', label: '卡在中间', feedback: '当能量很低时，你更容易卡在回应义务和自我保护之间。' },
    },
  },
  motive_silence: {
    title: '你为什么最后选择沉默',
    setup: '回想一次你本来可以说出来、但最后没有说的场景。',
    prompt: '如果只能选一个，更接近你当时沉默的真实原因是？',
    options: {
      A: { text: '我还没想清楚，怕自己说早了反而说错。', label: '先观察', feedback: '你的沉默更像是为了继续判断，而不是单纯退缩。' },
      B: { text: '我怕说出来以后关系会更糟。', label: '怕伤关系', feedback: '你会把关系后果放得很前，这常常决定你说不说。' },
      C: { text: '我觉得说了也未必有用，不想白白消耗。', label: '觉得无效', feedback: '你对表达是否值得投入有很强的现实判断。' },
      D: { text: '我当时情绪太满，先不说，是怕自己说得太重。', label: '先稳住自己', feedback: '你在沉默里保留的，不一定是退让，也可能是自我控制。' },
    },
  },
  motive_social: {
    title: '有用，但你其实不想去',
    setup: '有一个场合对你未来是有帮助的，但你当下其实很不想去。',
    prompt: '如果只能选一个，更接近你会怎么决定的真实原因是？',
    options: {
      A: { text: '我会去，因为长期目标比当下这点不想更重要。', label: '目标驱动', feedback: '你能为了更长线的结果暂时压住即时感受。' },
      B: { text: '我会去，因为不想让别人失望，也不想自己显得不合群。', label: '关系驱动', feedback: '你对他人感受和外部评价的敏感，会影响你的社交选择。' },
      C: { text: '我不会去，因为我知道现在状态不好，去了也未必真的有效。', label: '状态判断', feedback: '你更重视投入产出比，不愿在空转状态里硬上。' },
      D: { text: '我不会去，因为不想在自己很抗拒的时候勉强进入那个场域。', label: '真实边界', feedback: '你更在意自己是否是自愿在场，而不只是这件事值不值得。' },
    },
  },
  reality_refuse: {
    title: '隐性退让与妥协边界',
    setup: '回忆最近一次：你本想说「不」，最后却说了「好的」。',
    prompt: '当时是什么情况？是什么让你最终没能拒绝？',
    options: {
      A: { text: '先想起当时那个场景。', label: '回到情境', feedback: '这题是自由输入，不显示选项。' },
      B: { text: '写下你原本想说的话。', label: '写下原句', feedback: '这题是自由输入，不显示选项。' },
      C: { text: '写下你最后没有拒绝的原因。', label: '写下原因', feedback: '这题是自由输入，不显示选项。' },
      D: { text: '写下答应之后你对自己的感觉。', label: '写下余波', feedback: '这题是自由输入，不显示选项。' },
    },
  },
};

export const LOCALE_SCRIPT_COPY: Record<Locale, LocaleCopy> = {
  'zh-CN': ZH,
  en: ZH,
  ja: ZH,
  es: ZH,
};

export function getScenarioCopy(locale: Locale, scenarioId: string): ScenarioCopy | null {
  const copy = LOCALE_SCRIPT_COPY[locale] ?? LOCALE_SCRIPT_COPY['zh-CN'];
  return copy[scenarioId] ?? LOCALE_SCRIPT_COPY['zh-CN'][scenarioId] ?? null;
}
