import { RoundApproach, ThemeOptionId } from './theme-round';

export interface StoryDecisionNode {
  id: string;
  title: string;
  context: string;
  options: {
    id: ThemeOptionId;
    text: string;
    consequence: string;
    approach: RoundApproach;
  }[];
}

export const GUEST_EPISODE_ID = 'rain-before-stop';
export const GUEST_EPISODE_VERSION = 'v1';
export const GUEST_QUESTION_BANK_VERSION = 'guest-rain-before-stop-v1';
export const GUEST_COPY_VERSION = 'zh-CN-v1';

export const RAIN_BEFORE_STOP_NODES: StoryDecisionNode[] = [
  {
    id: 'node-1',
    title: '迟到的消息',
    context: '活动开始前一小时，负责带来防雨设备的乔没有出现，也没有回复消息。天空已经开始变暗，其他人等你提出下一步。',
    options: [
      { id: 'A', text: '直接联系乔，同时请另一个人一起找备用设备', consequence: '小组立刻动起来，但你临时接过了协调责任。', approach: 'approach' },
      { id: 'B', text: '先明确自己能负责的部分，不接下设备缺口', consequence: '你的任务没有失控，但其他人需要重新分配工作。', approach: 'protect' },
      { id: 'C', text: '先核对天气、库存和乔最后留下的信息', consequence: '你找到更准确的缺口，但可行动时间少了一些。', approach: 'analyze' },
      { id: 'D', text: '建议先按原计划推进，等乔再回复', consequence: '当前气氛没有升级，但设备问题继续悬而未决。', approach: 'withdraw' },
    ]
  },
  {
    id: 'node-2',
    title: '多出来的责任',
    context: '备用设备找到了，但林希望你顺便负责入口、物资和新人说明。你原本只答应处理其中一项。',
    options: [
      { id: 'A', text: '接下来，并请林和你一起快速分配具体任务', consequence: '工作推进很快，但你仍承担了核心协调压力。', approach: 'approach' },
      { id: 'B', text: '说明原先的承诺，只再接一个最紧急的部分', consequence: '边界变清楚，但现场需要有人接受剩余任务。', approach: 'protect' },
      { id: 'C', text: '先列出三项任务的时间和依赖，再决定接多少', consequence: '分配更有依据，但林觉得你没有马上答应。', approach: 'analyze' },
      { id: 'D', text: '暂时离开协调讨论，先完成自己原来的任务', consequence: '你守住了节奏，但错过了影响分工的机会。', approach: 'withdraw' },
    ]
  },
  {
    id: 'node-3',
    title: '当众的分歧',
    context: '布置进行到一半，林当着所有人的面否定你的入口方案，并说“现在没时间重新讨论”。你认为他的方案会让雨水进入场地。',
    options: [
      { id: 'A', text: '当场说明风险，并邀请大家用两分钟比较两个方案', consequence: '风险被公开讨论，但现场张力明显上升。', approach: 'approach' },
      { id: 'B', text: '明确表示你不会为那个入口方案负责', consequence: '责任边界清楚了，但问题本身仍需别人处理。', approach: 'protect' },
      { id: 'C', text: '提出先做一个快速检查，用现场结果决定', consequence: '争论转成验证，但会消耗有限时间。', approach: 'analyze' },
      { id: 'D', text: '先不争论，按林的方案继续，之后再提醒', consequence: '冲突暂时结束，但你担心的风险没有被处理。', approach: 'withdraw' },
    ]
  },
  {
    id: 'node-4',
    title: '不完整的解释',
    context: '乔终于出现。他说自己遇到突发情况，却避开细节。有人小声告诉你，乔可能只是忘了时间。接下来你们仍需要一起完成最关键的布置。',
    options: [
      { id: 'A', text: '私下问乔现在是否能继续合作，并听他说明需要什么', consequence: '你们重新建立了协作，但真相仍未完全确认。', approach: 'approach' },
      { id: 'B', text: '不追问原因，只把关键任务拆开，避免再次依赖他', consequence: '任务风险下降，但乔感受到明显距离。', approach: 'protect' },
      { id: 'C', text: '对照时间线和现有信息，再判断他的说法是否可信', consequence: '你保留了判断空间，但合作启动得更慢。', approach: 'analyze' },
      { id: 'D', text: '暂时不处理这件事，让其他人和乔配合', consequence: '你避开了不舒服的判断，也失去直接了解他的机会。', approach: 'withdraw' },
    ]
  },
  {
    id: 'node-5',
    title: '短暂的破裂',
    context: '入口最终出现积水。林对你说：“你早就觉得有问题，为什么没有让大家停下来？”无论你之前做过什么，这句话都忽略了一部分事实。',
    options: [
      { id: 'A', text: '说明当时发生了什么，并邀请林一起先处理积水', consequence: '关系仍有摩擦，但你们开始共同解决问题。', approach: 'approach' },
      { id: 'B', text: '先纠正责任归属，拒绝独自承担这次后果', consequence: '事实边界被保住，但修复行动延后。', approach: 'protect' },
      { id: 'C', text: '回顾当时的决定和信息，找出具体失误环节', consequence: '讨论更接近事实，但情绪没有立刻被回应。', approach: 'analyze' },
      { id: 'D', text: '不再解释，转身去做一个不需要合作的任务', consequence: '冲突没有继续升级，但误解暂时保留下来。', approach: 'withdraw' },
    ]
  },
  {
    id: 'node-6',
    title: '再次合作',
    context: '雨势减弱，活动可以继续。林提出把最后一项工作交给你和乔共同完成，并让你决定怎么合作。',
    options: [
      { id: 'A', text: '先说清彼此需要，再一起完成最后一项工作', consequence: '合作关系得到修复，但需要再次投入信任。', approach: 'approach' },
      { id: 'B', text: '把工作拆成互不依赖的两部分，各自完成', consequence: '风险更可控，但你们不会真正重新磨合。', approach: 'protect' },
      { id: 'C', text: '先设定检查点和失败预案，再开始合作', consequence: '合作更可预测，但过程显得谨慎而缓慢。', approach: 'analyze' },
      { id: 'D', text: '建议由其他人接手，自己完成收尾工作', consequence: '你避免再次受影响，但关系停留在未解决状态。', approach: 'withdraw' },
    ]
  }
];

export interface GuestEpisodeAnswer {
  node_id: string;
  choice_id: ThemeOptionId;
}

export interface GuestEpisodeResult {
  episode_id: string;
  episode_version: string;
  episode_title: string;
  evidence_kind: 'simulation';
  science_status: 'candidate_only';
  source_independence_group: string;
  summary: string;
  pattern: string;
  benefits: string;
  costs: string;
  exceptions: string;
  unknowns: string;
}

export function validateGuestEpisodeAnswers(answers: GuestEpisodeAnswer[]): string[] {
  const errors: string[] = [];
  if (answers.length !== 6) errors.push('requires_six_answers');

  const answerCounts = new Map<string, number>();
  for (const answer of answers) {
    answerCounts.set(answer.node_id, (answerCounts.get(answer.node_id) ?? 0) + 1);
  }
  for (const [nodeId, count] of answerCounts) {
    if (count > 1) errors.push(`duplicate_answer:${nodeId}`);
  }

  const answeredNodeIds = new Set(answers.map((answer) => answer.node_id));
  for (const node of RAIN_BEFORE_STOP_NODES) {
    if (!answeredNodeIds.has(node.id)) errors.push(`missing_answer:${node.id}`);
  }

  for (const answer of answers) {
    const node = RAIN_BEFORE_STOP_NODES.find((n) => n.id === answer.node_id);
    if (!node) {
      errors.push(`unknown_node:${answer.node_id}`);
    } else {
      if (!node.options.some((o) => o.id === answer.choice_id)) {
        errors.push(`invalid_choice:${answer.node_id}`);
      }
    }
  }
  return errors;
}

export function buildGuestEpisodeResult(answers: GuestEpisodeAnswer[]): GuestEpisodeResult | null {
  const errors = validateGuestEpisodeAnswers(answers);
  if (errors.length > 0) return null;

  const counts: Record<RoundApproach, number> = {
    approach: 0, protect: 0, analyze: 0, withdraw: 0
  };

  const nodeApproaches: Record<string, RoundApproach> = {};
  for (const answer of answers) {
    const node = RAIN_BEFORE_STOP_NODES.find((n) => n.id === answer.node_id)!;
    const option = node.options.find((o) => o.id === answer.choice_id)!;
    counts[option.approach]++;
    nodeApproaches[node.id] = option.approach;
  }
  const descriptions: Record<RoundApproach, { action: string; benefit: string; cost: string }> = {
    approach: {
      action: '主动接触他人、表达需要并推动共同处理',
      benefit: '让信息和关系更快重新连接',
      cost: '可能让你承担更多协调压力，也更早暴露自己的立场',
    },
    protect: {
      action: '先明确责任、依赖和个人边界',
      benefit: '减少失控、误解责任或再次被占用',
      cost: '可能拉开合作距离，也可能让共同问题稍后才被处理',
    },
    analyze: {
      action: '先核对信息、设置检查点，再决定行动',
      benefit: '降低误判，并让决定更容易说明和复查',
      cost: '可能消耗行动窗口，也可能让他人感到你没有马上回应',
    },
    withdraw: {
      action: '暂缓回应、退出当前冲突或先处理别的部分',
      benefit: '避免在压力最高时冲动升级',
      cost: '可能把决定权交给别人，也让误解和风险暂时保留',
    },
  };
  const ranked = (Object.keys(counts) as RoundApproach[]).sort(
    (left, right) => counts[right] - counts[left]
  );
  const highestCount = counts[ranked[0]!];
  const repeated = ranked.filter((approach) => counts[approach] === highestCount && highestCount >= 2);
  const pairKey = repeated.length === 2 ? [...repeated].sort().join('+') : '';
  const pairSummaries: Record<string, string> = {
    'analyze+withdraw': '你在突发压力中兼具理性核查与抽离避险，习惯先退后半步理清全貌再做决断。',
    'approach+protect': '你在协作中兼具推动意愿与边界意识，愿意主动担当但坚持权责清晰。',
    'analyze+approach': '你在协作分歧中兼具主动性与事实导向，善于用客观依据推进共同行动。',
    'analyze+protect': '你在复杂局面中展现出严谨的防御姿态，依靠规则边界与理性核查应对风险。',
    'protect+withdraw': '你在外部压力下注重自我保护与低能耗应对，优先守住核心阵地与节奏。',
    'approach+withdraw': '你在冲突与协作中根据局势灵活进退，在主动介入与果断止损间切换。',
  };
  const singleSummaries: Record<RoundApproach, string> = {
    approach: '你在人际与任务突发状况中倾向于主动破局，优先通过沟通与协同建立解决路径。',
    protect: '你在高压协作中优先厘清权责与边界，防止自身与任务陷入被动与失控。',
    analyze: '你在面对不确定与分歧时优先核对事实依据，以理智审慎作为第一防线。',
    withdraw: '你在压力与冲突峰值时倾向于先暂缓抽离，避免情绪升级并保存心力。',
  };

  const summary = repeated.length === 1
    ? singleSummaries[repeated[0]!]
    : (pairSummaries[pairKey] || '你在多重压力情境中展现出平衡且灵活的应对策略。');

  const pattern = repeated.length === 1
    ? `这一章里，你主要采取“${descriptions[repeated[0]!].action}”的方式，展现出连贯的应对姿态。`
    : `这一章里，你在“${descriptions[repeated[0]!].action}”与“${descriptions[repeated[1]!].action}”之间灵活切换，展现出复合的应对节奏。`;

  const selectedBenefits = repeated.map((approach) => descriptions[approach].benefit);
  const selectedCosts = repeated.map((approach) => descriptions[approach].cost);
  const exceptionNodes = RAIN_BEFORE_STOP_NODES.filter(
    (node) => !repeated.includes(nodeApproaches[node.id]!)
  ).map((node) => `《${node.title}》`);

  return {
    episode_id: GUEST_EPISODE_ID,
    episode_version: GUEST_EPISODE_VERSION,
    episode_title: '雨停之前',
    evidence_kind: 'simulation',
    science_status: 'candidate_only',
    source_independence_group: `simulation:${GUEST_EPISODE_ID}:${GUEST_EPISODE_VERSION}`,
    summary,
    pattern,
    benefits: selectedBenefits.join('；') || '本章应对方式较为分散，未呈现单一突出的收益侧重。',
    costs: selectedCosts.join('；') || '本章应对方式较为分散，未呈现单一突出的潜在代价。',
    exceptions: exceptionNodes.length > 0
      ? `${exceptionNodes.join('、')}中的选择与主要惯性不同，表明当触及特定人际变数时，你的决策策略会发生针对性调整。`
      : '六个节点均保持了一致的应对姿态；在不同关系和压力条件下，可能还会浮现出更丰富的侧面。',
    unknowns: '本章仅折射出你在特定模拟情境下的决策倾向；真实心智随情境演变，不被单一剧本所限定。',
  };
}
