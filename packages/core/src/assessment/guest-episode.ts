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

  const nodeApproaches: Record<string, RoundApproach> = {};
  const orderedFacts = answers.map((answer) => {
    const node = RAIN_BEFORE_STOP_NODES.find((item) => item.id === answer.node_id)!;
    const option = node.options.find((item) => item.id === answer.choice_id)!;
    counts[option.approach]++;
    nodeApproaches[node.id] = option.approach;
    return { node, option };
  });
  const approachNames: Record<RoundApproach, string> = {
    approach: '主动沟通',
    protect: '明确界限',
    analyze: '核查依据',
    withdraw: '暂缓避险',
  };

  const descriptions: Record<RoundApproach, { action: string; benefit: string; cost: string }> = {
    approach: {
      action: '主动沟通并推动共同处理',
      benefit: '让信息更快流动，推动事情往前走，避免问题被搁置。',
      cost: '容易替别人承担原本不需要负责的协调压力，并在事情不顺时较早成为被追责的对象。',
    },
    protect: {
      action: '明确职责界限，先说明自己能负责的部分',
      benefit: '守住自己的工作边界，避免无端承担不属于自己的责任。',
      cost: '容易拉开与同伴的距离，可能让现场紧急问题暂时悬空，并在需要协同配合时显得防备较重。',
    },
    analyze: {
      action: '先核查事实依据与现有数据，再决定下一步',
      benefit: '减少在混乱中凭直觉盲动，使后续处理更有依据。',
      cost: '核查过程会消耗现场有限的行动时间，可能让急于得到回应的同伴感到迟疑与距离。',
    },
    withdraw: {
      action: '暂缓表态、退出当前冲突或先做不需要配合的事',
      benefit: '避免在情绪最高点激化正面冲突，保护自己的注意力和节奏。',
      cost: '没有真正解决面前的分歧与隐患，把现场决定权留给了别人，也容易被误解为回避问题。',
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
  const replayFacts = orderedFacts.slice(0, 3).map(({ node, option }) => `在“${node.title}”时，你选择了“${option.text}”`).join('；');
  const laterFacts = orderedFacts.slice(3).map(({ node, option }) => `随后在“${node.title}”时，你选择了“${option.text}”`).join('；');
  const story_replay = `${replayFacts}。${laterFacts}。这六次选择构成了同一段协作压力逐步上升的故事：从消息迟到、工作临时增加，到公开归责和后续安排。它们可以帮助你回看自己在不同压力点怎样行动；它们不能证明你在现实里一定会这样做，也不能替你解释选择背后的原因。`;
  const primaryObservation: GuestEpisodeObservation = {
    id: `guest:${top}:primary`,
    title: `这次最常见的做法：${approachNames[top]}`,
    text: `在${topFacts.map(({ node }) => `“${node.title}”`).join('、')}等 ${topFacts.length} 个节点里，你选择${descriptions[top].action}。在协作出现空白、责任不清或场面紧张时，这种做法会让${descriptions[top].benefit.replace('。', '')}。它的代价也很具体：${descriptions[top].cost.replace('。', '')}。这不是对你好坏的评价，而是在提醒你，同一种处理方式既能解决眼前问题，也可能把系统原本的问题压到你身上。这里描述的是这段模拟中的可见选择和可能后果，不是在判断你的动机。`,
    evidence_node_ids: topFacts.map(({ node }) => node.id),
    evidence: observationEvidence(topFacts),
    reflection_question: `你在这些节点里这样做，更多是因为这符合你的习惯、当时信息不足，还是这只是你希望做到的处理方式？`,
  };
  const observations: GuestEpisodeObservation[] = [primaryObservation];
  if (firstChange && priorFact) {
    observations.push({
      id: 'guest:transition:first-change',
      title: '第一次改变做法的地方',
      text: `你从“${priorFact.node.title}”中的${approachNames[priorFact.option.approach]}，转到“${firstChange.node.title}”中的${approachNames[firstChange.option.approach]}。这只能说明这两个节点的选择不同；是因为责任、时间、关系还是精力发生了变化，需要由你补充，不能从选择本身确定原因。`,
      evidence_node_ids: [priorFact.node.id, firstChange.node.id],
      evidence: observationEvidence([priorFact, firstChange]),
      reflection_question: `从“${priorFact.node.title}”到“${firstChange.node.title}”，什么信息或感受让你改变了做法？`,
    });
  }
  if (repeated.length > 1 || highestCount < 4) {
    observations.push({
      id: 'guest:variation:distribution',
      title: '这次没有单一固定的应对方式',
      text: `六个节点的选择没有完全收敛到一种做法。${repeated.map((approach) => `“${approachNames[approach]}”`).join('、')}在这次作答中同样突出。不同情境下换做法可以是在权衡，也可能只是故事条件不同；这份结果不能把变化自动解释成成熟、摇摆或人格特征。`,
      evidence_node_ids: orderedFacts.map(({ node }) => node.id),
      evidence: observationEvidence(orderedFacts),
      reflection_question: '回看这些节点时，哪一次选择最不像现实中的你？为什么？',
    });
  }

  let summary = '';
  let pattern = '';
  let benefits = '';
  let costs = '';
  let exceptions = '';

  if (highestCount === 6) {
    summary = `面对突发协作与冲突，你六次都选择${descriptions[top].action}。`;
    pattern = `六个情境节点中，你的选择方向完全一致，始终倾向于${descriptions[top].action}。`;
    benefits = descriptions[top].benefit;
    costs = descriptions[top].cost;
    exceptions = '六个节点都选择了相同方向，这次模拟中没有出现反向的例外选择。';
  } else if (repeated.length === 1 && highestCount >= 3) {
    summary = `面对突发协作与冲突，你更常选择${descriptions[top].action}。`;
    pattern = `六个节点中，你有 ${highestCount} 次选择${descriptions[top].action}，这是本章最主要的做法。`;
    benefits = descriptions[top].benefit;
    costs = descriptions[top].cost;
    const exceptionNodes = RAIN_BEFORE_STOP_NODES.filter(
      (node) => nodeApproaches[node.id] !== top
    ).map((node) => `《${node.title}》`);
    exceptions = `${exceptionNodes.join('、')}中的选择与主要做法不同，表明在特定情境下你改变了反应策略。`;
  } else if (repeated.length === 2 && highestCount === 3) {
    const [app1, app2] = repeated;
    summary = `你在“${approachNames[app1!]}”和“${approachNames[app2!]}”之间各做了一半选择，没有单一主导做法。`;
    pattern = `六个节点中，你各有 3 次选择${descriptions[app1!].action}与${descriptions[app2!].action}。`;
    benefits = `【${approachNames[app1!]}】${descriptions[app1!].benefit}\n\n【${approachNames[app2!]}】${descriptions[app2!].benefit}`;
    costs = `【${approachNames[app1!]}】${descriptions[app1!].cost}\n\n【${approachNames[app2!]}】${descriptions[app2!].cost}`;
    exceptions = '六个节点被这两种做法平分，没有出现第三种应对方式。这两种做法的切换取决于具体节点的情境。';
  } else if (repeated.length === 2 && highestCount === 2) {
    const [app1, app2] = repeated;
    summary = `你在“${approachNames[app1!]}”和“${approachNames[app2!]}”之间交替较多，同时也尝试了其他做法。`;
    pattern = `六个节点中，${descriptions[app1!].action}与${descriptions[app2!].action}各出现了 2 次。`;
    benefits = `【${approachNames[app1!]}】${descriptions[app1!].benefit}\n\n【${approachNames[app2!]}】${descriptions[app2!].benefit}`;
    costs = `【${approachNames[app1!]}】${descriptions[app1!].cost}\n\n【${approachNames[app2!]}】${descriptions[app2!].cost}`;
    const exceptionNodes = RAIN_BEFORE_STOP_NODES.filter(
      (node) => nodeApproaches[node.id] !== app1 && nodeApproaches[node.id] !== app2
    ).map((node) => `《${node.title}》`);
    exceptions = `${exceptionNodes.join('、')}中的选择与上述两种做法不同，表明在特定节点你采取了不同策略。`;
  } else if (repeated.length === 3 && highestCount === 2) {
    const [app1, app2, app3] = repeated;
    summary = `你在“${approachNames[app1!]}”、“${approachNames[app2!]}”与“${approachNames[app3!]}”之间均分了选择，没有单一主导做法。`;
    pattern = `六个节点中，你在“${approachNames[app1!]}”、“${approachNames[app2!]}”与“${approachNames[app3!]}”上各选了 2 次，处理方式较为分散。`;
    benefits = `【${approachNames[app1!]}】${descriptions[app1!].benefit}\n\n【${approachNames[app2!]}】${descriptions[app2!].benefit}\n\n【${approachNames[app3!]}】${descriptions[app3!].benefit}`;
    costs = `【${approachNames[app1!]}】${descriptions[app1!].cost}\n\n【${approachNames[app2!]}】${descriptions[app2!].cost}\n\n【${approachNames[app3!]}】${descriptions[app3!].cost}`;
    exceptions = '六个节点被三种不同的做法均分，没有哪一种做法占据主导地位。选择出现差异；差异的原因需要你补充，不能仅凭这次模拟推断。';
  } else {
    // Mathematically unreachable defensive fallback for 6 nodes and 4 choices.
    // Preserves complete runtime safety and conforms to non-sycophantic language.
    const top = ranked[0]!;
    summary = `这次作答整体较为分散，未出现单一主导做法。`;
    pattern = `六个节点中，你的选择较为分散，未呈现出明显的单一惯性。`;
    benefits = descriptions[top].benefit;
    costs = descriptions[top].cost;
    const exceptionNodes = RAIN_BEFORE_STOP_NODES.filter(
      (node) => nodeApproaches[node.id] !== top
    ).map((node) => `《${node.title}》`);
    exceptions = `${exceptionNodes.join('、')}中的选择各不相同，表明你在不同情境下的处理方式差异较大。`;
  }

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
