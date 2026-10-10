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
export const GUEST_EPISODE_TITLE = '突发压力与协作应对';
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
    context: '入口最终出现积水。林对你说：“你早就觉得有问题，为什么没有让大家停下来？”这句话把责任集中到了你身上，而前面发生了什么需要你们共同回看。',
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
  story_replay: string;
  observations: GuestEpisodeObservation[];
}

export interface GuestEpisodeObservation {
  id: string;
  title: string;
  text: string;
  evidence_node_ids: string[];
  evidence: Array<{
    node_id: string;
    node_title: string;
    choice_text: string;
  }>;
  reflection_question: string;
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

  const orderedFacts = answers.map((answer) => {
    const node = RAIN_BEFORE_STOP_NODES.find((item) => item.id === answer.node_id)!;
    const option = node.options.find((item) => item.id === answer.choice_id)!;
    counts[option.approach]++;
    return { node, option };
  });
  const approachNames: Record<RoundApproach, string> = {
    approach: '把问题带到台面上处理',
    protect: '把责任和范围说清楚',
    analyze: '先把事情弄清楚',
    withdraw: '先从当前拉扯里退开',
  };

  const descriptions: Record<RoundApproach, { action: string; benefit: string; cost: string }> = {
    approach: {
      action: '把担心和分工带到台面上，试着推动共同处理',
      benefit: '让信息更快流动，问题不必一直被搁置。',
      cost: '也可能让你先接住原本不该由你独自承担的协调压力。',
    },
    protect: {
      action: '先说明自己能负责什么、不愿独自承担什么',
      benefit: '让责任的边界更清楚，避免把不属于你的后果一并接下。',
      cost: '现场的问题仍需要有人继续接手，关系也可能因此暂时变得更疏离。',
    },
    analyze: {
      action: '先核对信息、时间和条件，再决定下一步',
      benefit: '让行动有更清楚的依据，少一点在混乱里凭感觉接下事情。',
      cost: '等你把事情理顺时，急着得到回应的人可能已经感到等待。',
    },
    withdraw: {
      action: '先不继续拉扯，暂缓表态或把注意力放回自己能做的部分',
      benefit: '避免在当下把冲突推得更高，也给自己留出空间。',
      cost: '你的担心和意见会暂时留在后面，现场可能仍沿着你并不认同的方向继续。',
    },
  };

  const ALL_APPROACHES: RoundApproach[] = ['approach', 'protect', 'analyze', 'withdraw'];
  const ranked = [...ALL_APPROACHES].sort((left, right) => {
    const diff = counts[right] - counts[left];
    if (diff !== 0) return diff;
    return ALL_APPROACHES.indexOf(left) - ALL_APPROACHES.indexOf(right);
  });
  const highestCount = counts[ranked[0]!];
  const repeated = ranked.filter((approach) => counts[approach] === highestCount);

  const top = ranked[0]!;
  const topFacts = orderedFacts.filter((fact) => fact.option.approach === top);
  const firstChangeIndex = orderedFacts.findIndex((fact, index) => index > 0 && fact.option.approach !== orderedFacts[index - 1]!.option.approach);
  const firstChange = firstChangeIndex > 0 ? orderedFacts[firstChangeIndex] : null;
  const priorFact = firstChangeIndex > 0 ? orderedFacts[firstChangeIndex - 1] : null;
  const observationEvidence = (facts: typeof orderedFacts) => facts.map(({ node, option }) => ({
    node_id: node.id,
    node_title: node.title,
    choice_text: option.text,
  }));
  const replayFacts = orderedFacts.map(({ node, option }) => `“${node.title}”：${option.text}`).join('；');
  const story_replay = `这六个选择记录的是你在这段协作故事中的行动：${replayFacts}。完整选择留在这里供你回看；下面只挑其中几处，看看这次的你怎样面对事情。`;
  const primaryObservation: GuestEpisodeObservation = {
    id: `guest:${top}:primary`,
    title: repeated.length === 1 ? `你更常${approachNames[top]}` : `这次你也会${approachNames[top]}`,
    text: `在${topFacts.map(({ node }) => `“${node.title}”`).join('、')}里，你${descriptions[top].action}。这样做可能${descriptions[top].benefit.replace('。', '')}；同时，${descriptions[top].cost.replace('。', '')}。`,
    evidence_node_ids: topFacts.map(({ node }) => node.id),
    evidence: observationEvidence(topFacts),
    reflection_question: `这更像你平时会做的事，还是这次故事里你希望做到的处理方式？`,
  };
  const observations: GuestEpisodeObservation[] = [primaryObservation];
  if (firstChange && priorFact) {
    observations.push({
      id: 'guest:transition:first-change',
      title: `到了“${firstChange.node.title}”，你换了一种做法`,
      text: `前一段你选择${approachNames[priorFact.option.approach]}；到了这里，你改为${approachNames[firstChange.option.approach]}。这个变化是这段故事里真实出现的，但为什么会变，需要听你自己的解释。`,
      evidence_node_ids: [priorFact.node.id, firstChange.node.id],
      evidence: observationEvidence([priorFact, firstChange]),
      reflection_question: `从“${priorFact.node.title}”到这里，什么信息、关系或感受让你换了做法？`,
    });
  }
  const nonTopFacts = orderedFacts.filter((fact) => fact.option.approach !== top);
  if (nonTopFacts.length > 0 && observations.length < 3) {
    const contrast = nonTopFacts.find(({ node }) => node.id === 'node-5') ?? nonTopFacts[0]!;
    observations.push({
      id: 'guest:variation:contrast',
      title: `“${contrast.node.title}”里，你用了另一种做法`,
      text: `在这里，你选择${descriptions[contrast.option.approach].action}。这说明这次作答里的你并不是只会用一种办法：当情境改变时，你会调整回应。这个调整本身不等于成熟、退缩或某种固定特质。`,
      evidence_node_ids: [contrast.node.id],
      evidence: observationEvidence([contrast]),
      reflection_question: `回看这一处，它像现实中的你吗？如果不像，真实的你会怎样处理？`,
    });
  }

  let summary = '';
  let pattern = '';
  let benefits = '';
  let costs = '';
  let exceptions = '';

  const tied = repeated.length > 1;
  summary = tied
    ? '这次的你，会依事情和关系的变化调整做法。'
    : `这次的你，更常${approachNames[top]}。`;
  pattern = tied
    ? '六个节点没有收敛成一种固定做法；你在不同压力点用不同方式保护事情、关系或自己。'
    : `在六个节点里，你有 ${highestCount} 次选择${approachNames[top]}；另外的选择让这份结果保留了情境差异。`;
  benefits = descriptions[top].benefit;
  costs = descriptions[top].cost;
  exceptions = nonTopFacts.length
    ? `在${nonTopFacts.map(({ node }) => `《${node.title}》`).join('、')}里，你改用了别的做法。差异需要结合当时的感受与条件来理解。`
    : '六个节点里，你都使用了相近的做法；这仍只说明这段故事中的选择。';

  return {
    episode_id: GUEST_EPISODE_ID,
    episode_version: GUEST_EPISODE_VERSION,
    episode_title: GUEST_EPISODE_TITLE,
    evidence_kind: 'simulation',
    science_status: 'candidate_only',
    source_independence_group: `simulation:${GUEST_EPISODE_ID}:${GUEST_EPISODE_VERSION}`,
    summary,
    pattern,
    benefits,
    costs,
    exceptions,
    unknowns: '这是根据单次模拟故事作出的初步观察，不是对你的永久定性。',
    story_replay,
    observations,
  };
}
