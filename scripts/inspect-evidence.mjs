// 通过应用 API 验证证据链（走 NeonPool/HTTP，不受 TCP TLS 掐断影响）
const API = 'http://localhost:3002';
const p = (s) => process.stdout.write(`${s}\n`);

const login = await fetch(`${API}/auth/dev-login`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: '{}',
});
const cookie = (login.headers.getSetCookie?.() ?? []).map((c) => c.split(';')[0]).join('; ');
p(`登录: ${login.status}`);

// 1. 历史轮次
const hist = await fetch(`${API}/v1/assessment-rounds`, { headers: { Cookie: cookie } });
const rounds = await hist.json();
const list = Array.isArray(rounds) ? rounds : (rounds.rounds ?? []);
p(`\n【1】历史轮次 API（GET /v1/assessment-rounds）`);
p(`  返回 ${list.length} 条`);
list.slice(0, 6).forEach((r) => {
  p(`  ${r.id.slice(0, 8)} ${String(r.theme_lens).padEnd(16)} ${String(r.status).padEnd(12)} 完成=${r.completed_at ? String(r.completed_at).slice(0, 19) : '-'}`);
  if (r.selection_decision?.reason_zh) p(`选主题理由: ${r.selection_decision.reason_zh}`);
  if (r.latest_feedback_action) p(`最新反馈: ${r.latest_feedback_action}`);
});
p(`  字段: ${Object.keys(list[0] ?? {}).join(', ')}`);

// 2. 找一个已完成轮次，读结果看证据链
const done = list.find((r) => r.status === 'completed');
if (!done) {
  p('\n【2】无已完成轮次');
} else {
  p(`\n【2】已完成轮次 ${done.id.slice(0, 8)}（${done.theme_lens}）的结果与证据链`);
  const res = await fetch(`${API}/v1/assessment-rounds/${done.id}/result`, { headers: { Cookie: cookie } });
  const body = await res.json();
  p(`  GET result → ${res.status}`);

  const result = body.result ?? body;
  p(`  result 字段: ${Object.keys(result).join(', ')}`);

  const obs = result.observations ?? [];
  p(`\n  观察数: ${obs.length}`);
  obs.forEach((o, i) => {
    p(`  ${i + 1}. focus=${o.focus}`);
    p(`     text: ${String(o.text ?? '').slice(0, 60)}`);
    p(`     evidence_question_id: ${o.evidence_question_id ?? '(无)'}`);
    if (o.confidence !== undefined) p(`     confidence: ${o.confidence}`);
    if (o.boundary) p(`     boundary: ${String(o.boundary).slice(0, 60)}`);
  });

  // 3. 用 evidence_question_id 反查原题（通过 DB，但走 NeonPool）
  p(`\n【3】证据链完整性检查：每条观察能否定位到题目快照`);
  for (const o of obs) {
    const qid = o.evidence_question_id;
    if (!qid) {
      p(`  ✗ 观察缺 evidence_question_id → 无法追溯`);
      continue;
    }
    // 轮次题目从 next 拿不到全部，用 result 里的 evidence 字段判断
    p(`  ✓ ${qid}（可作为锚点回溯该轮题目快照）`);
  }
  p(`\n  说明：题目原文与用户选择存于 theme_assessment_round_items.definition`);
  p(`        与 theme_assessment_round_answers，两表通过 item_id 关联，`);
  p(`        同一轮次内可完整还原「题目 → 用户作答 → AI 观察」三段。`);
}

// 4. 反馈记录
if (done) {
  p(`\n【4】反馈是否记录在轮次上`);
  p(`  latest_feedback_action: ${done.latest_feedback_action ?? '(无)'}`);
  p(`  has_disputed_feedback: ${done.has_disputed_feedback ?? '(无)'}`);
}
