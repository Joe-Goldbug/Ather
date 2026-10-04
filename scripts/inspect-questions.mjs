// 实测一轮的真实题目构成：数量、角色、情境、选项
const BASE = 'http://localhost:3002';
const log = (s) => process.stdout.write(`${s}\n`);

const login = await fetch(`${BASE}/auth/dev-login`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: '{}',
});
const cookie = (login.headers.getSetCookie?.() ?? []).map((c) => c.split(';')[0]).join('; ');

const start = await fetch(`${BASE}/v1/assessment-rounds`, {
  method: 'POST',
  headers: { Cookie: cookie, 'Content-Type': 'application/json' },
  body: JSON.stringify({ locale: 'zh-CN' }),
});
const started = await start.json();
const roundId = started.round.id;
log(`轮次: ${roundId}  主题: ${started.round.theme_lens}`);

const items = [];
for (let i = 0; i < 12; i += 1) {
  const r = await fetch(`${BASE}/v1/assessment-rounds/${roundId}/next`, {
    headers: { Cookie: cookie },
  });
  const j = await r.json();
  if (j.state !== 'question' || !j.question) {
    log(`第 ${i + 1} 次取题 → state=${j.state}（无新题）`);
    break;
  }
  items.push(j.question);
  const q = j.question;
  log(
    `${String(i + 1).padStart(2)}. [${q.role}/${q.context}] ${(q.prompt ?? '').slice(0, 34)}… 选项${q.options.length}`,
  );
  // 答 A，推进到下一题
  const a = await fetch(`${BASE}/v1/assessment-rounds/${roundId}/items/${j.item_id}/responses`, {
    method: 'POST',
    headers: { Cookie: cookie, 'Content-Type': 'application/json' },
    body: JSON.stringify({ choice_id: 'A', operation_id: crypto.randomUUID() }),
  });
  const aj = await a.json();
  if (aj.state && aj.state !== 'question') {
    log(`→ 提交后 state=${aj.state}，停止取题`);
    break;
  }
}

log(`\n本轮共取到 ${items.length} 题`);
const byRole = {};
const byCtx = {};
for (const q of items) {
  byRole[q.role] = (byRole[q.role] ?? 0) + 1;
  byCtx[q.context] = (byCtx[q.context] ?? 0) + 1;
}
log(`角色分布: ${JSON.stringify(byRole)}`);
log(`情境分布: ${JSON.stringify(byCtx)}`);
