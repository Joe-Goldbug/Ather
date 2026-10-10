const zh = {
  title: '我的笔记', subtitle: '记下一个时刻，慢慢看懂自己。', write: '记一笔', records: '我的记录', review: '回看自己',
  prompt: '今天，有哪个瞬间让你留意到自己？', hint: '一句话也可以。发生了什么，你当时怎么想、怎么反应？',
  placeholder: '比如：今天有人临时找我帮忙。我答应得很快，回家后却一直有点烦……',
  privacy: '保存只会保留原文。点击解读后，这条内容会发送给模型服务；不会自动加入长期画像或周期回看。',
  save: '保存这条笔记', ideas: '也可以从这些时刻开始', positive: '我和这个人在一起特别自在。',
  difficult: '我嘴上说没事，心里却过不去。', different: '这一次，我的反应和以前不一样。',
  reminder: '不必每天写，也不用只记录难过的时候。', help: '不知道从哪里写？',
  event: '当时发生了什么？', action: '你说了什么、做了什么？有没有没说出口的话？', feeling: '你现在是什么感受？还不清楚也可以。',
  original: '你的原文', back: '返回记录', open: '打开记录', analyze: '帮我看懂这次反应',
  consent: '仅使用这条原文和你保留的补充生成解读。由你核对，不代表你固定不变的性格。',
  reaction: '你当时怎样反应', impact: '可能带来的影响', uncertainty: '还不能确定的原因', evidence: '查看原文依据',
  fits: '符合', partly: '部分符合', wrong: '理解错了', supplement: '补充事实',
  feedbackLabel: '补充或纠正', feedbackPlaceholder: '比如：不是怕拒绝，我只是当时忘了约定。',
  retain: '保留我的补充', revise: '根据补充更新解读', saved: '你的回应已保留。原文没有被改写。',
  history: '解读与反馈历史', version: '版本', pending: '等你核对', disputed: '有异议', noAnalysis: '尚未解读',
  choose: '选择你愿意一起回看的记录', chooseHint: '每次由你选择 2–4 条。点击生成后，只把这些原文和补充发送给模型；本次选择不会授权自动周期分析。',
  compare: '回看这些记录', selection: '条已选择', comparison: '不同情境中的自己', compareBoundary: '相似、不同和例外只描述你选中的记录，不能直接证明人格或成长。',
  empty: '还没有记录，写下你的第一条吧。', more: '载入更早的记录', noReview: '先选两条具体经历，再看看情境和反应有什么不同。',
  failed: '操作未完成，请重试。你的记录仍被保留。', retry: '重新加载记录', incomplete: '部分记录未能加载，请重试。',
  busy: '正在处理…', loading: '正在加载…', oldCues: '以前的关键词提示', savedReviews: '已保存的回看',
  loginRequired: '登录后保留你的笔记',
};
const en: typeof zh = {
  title: 'My notes', subtitle: 'Keep a moment. Get to know yourself.', write: 'Write a note', records: 'My records', review: 'Look back',
  prompt: 'What moment today made you notice yourself?', hint: 'One sentence is enough. What happened, and how did you think or respond?',
  placeholder: 'Someone asked for help today. I said yes quickly, but felt annoyed when I got home…',
  privacy: 'Saving keeps your words only. Reviewing sends this note to the model service; it does not opt you into a long-term profile or periodic analysis.',
  save: 'Save this note', ideas: 'You can start with these moments', positive: 'I feel especially at ease with this person.',
  difficult: 'I said it was fine, but could not let it go.', different: 'This time, I responded differently.',
  reminder: 'No need to write daily, or only when things are difficult.', help: 'Not sure where to begin?',
  event: 'What happened?', action: 'What did you say or do? What did you leave unsaid?', feeling: 'How do you feel now? It is okay not to know yet.',
  original: 'Your words', back: 'Back to records', open: 'Open note', analyze: 'Help me understand this response',
  consent: 'Uses only this note and your saved additions. Check the interpretation yourself; it is not a fixed description of your character.',
  reaction: 'How you responded', impact: 'Possible effects', uncertainty: 'What is still uncertain', evidence: 'See the original evidence',
  fits: 'Fits', partly: 'Partly fits', wrong: 'Misunderstood', supplement: 'Add context',
  feedbackLabel: 'Add or correct context', feedbackPlaceholder: 'For example: I was not afraid to refuse; I had forgotten my plans.',
  retain: 'Keep my addition', revise: 'Update using my feedback', saved: 'Your response is saved. Your original words remain intact.',
  history: 'Interpretation and feedback history', version: 'Version', pending: 'For you to check', disputed: 'Disputed', noAnalysis: 'Not reviewed yet',
  choose: 'Choose records to review together', chooseHint: 'Choose 2–4 each time. Generating sends only these words and additions to the model; this does not authorize periodic analysis.',
  compare: 'Review these records', selection: 'selected', comparison: 'You in different situations', compareBoundary: 'Similarities, differences, and exceptions describe only the selected records. They do not prove personality or growth.',
  empty: 'No notes yet. Write your first one.', more: 'Load older records', noReview: 'Choose two real moments to explore differences in context and response.',
  failed: 'The action could not be completed. Your records are retained. Please retry.', retry: 'Reload records', incomplete: 'Some records could not be loaded. Please retry.',
  busy: 'Working…', loading: 'Loading…', oldCues: 'Previous keyword cues', savedReviews: 'Saved comparisons',
  loginRequired: 'Sign in to retain your notes',
};
export function notesCopy(locale: string): typeof zh {
  if (locale === 'zh-CN') return zh;
  if (locale === 'ja') return { ...en, title: '私のメモ', subtitle: '一瞬を残して、自分を少しずつ知る。', write: '書く', records: '私の記録', review: '振り返る', save: 'メモを保存', analyze: 'この反応を理解する', back: '記録に戻る', fits: '当てはまる', partly: '一部当てはまる', wrong: '理解が違う' };
  if (locale === 'es') return { ...en, title: 'Mis notas', subtitle: 'Guarda un momento. Conócete poco a poco.', write: 'Escribir', records: 'Mis registros', review: 'Mirar atrás', save: 'Guardar esta nota', analyze: 'Ayúdame a entender esta reacción', back: 'Volver a los registros', fits: 'Encaja', partly: 'En parte', wrong: 'No me entendió' };
  return en;
}
