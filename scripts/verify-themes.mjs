// 验证五个主题的完整数据链路
// 页面主题卡片由 GET /v1/assessment-themes/coverage 驱动，
// 这里验证该接口返回 5 个主题、每项字段齐全、且可建轮。
const BASE = 'http://localhost:3002';
const log = (s) => process.stdout.write(`${s}\n`);
let fails = 0;
const check = (l, ok, d = '') => {
  log(`${ok ? 'PASS' : 'FAIL'}  ${l}${d ? ` — ${d}` : ''}`);
  if (!ok) fails += 1;
};

const EXPECT = [
  ['emotion', '情绪反应侧写'],
  ['relationship', '关系与情感侧写'],
  ['social', '社交方式侧写'],
  ['workplace', '职场应对侧写'],
  ['self_evaluation', '自我关系侧写'],
];

const login = await fetch(`${BASE}/auth/dev-login`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: '{}',
});
const cookie = (login.headers.getSetCookie?.() ?? []).map((c) => c.split(';')[0]).join('; ');

const cov = await fetch(`${BASE}/v1/assessment-themes/coverage`, { headers: { Cookie: cookie } });
const covJson = await cov.json();

check('coverage 返回 5 个主题', covJson.themes?.length === 5, `实际 ${covJson.themes?.length} 个`);

for (const [lens, title] of EXPECT) {
  const t = (covJson.themes ?? []).find((x) => x.theme_lens === lens);
  check(
    `主题 ${lens}`,
    !!t && t.title === title && typeof t.completed_rounds === 'number',
    t ? `${t.title} | 已完成 ${t.completed_rounds} 轮` : '缺失',
  );
}

check('有推荐主题', !!covJson.recommended_theme, `推荐=${covJson.recommended_theme}`);
log(`  推荐理由: ${covJson.recommendation ?? '-'}`);

// 逐个主题建轮，确认每个都能进入答题
for (const [lens] of EXPECT) {
  const r = await fetch(`${BASE}/v1/assessment-rounds`, {
    method: 'POST',
    headers: { Cookie: cookie, 'Content-Type': 'application/json' },
    body: JSON.stringify({ theme: lens, locale: 'zh-CN' }),
  });
  const j = await r.json();
  const ok = r.status === 201 && j.round?.theme_lens === lens && !!j.next?.question;
  check(
    `建轮 ${lens}`,
    ok,
    ok
      ? `round=${j.round.id.slice(0, 8)} 首题角色=${j.next.question.role} 题量下限=${j.next.decision_minimum}`
      : `status=${r.status} ${JSON.stringify(j).slice(0, 90)}`,
  );
}

log(`\n${fails === 0 ? 'ALL_PASS' : `FAILURES=${fails}`}`);
if (fails > 0) process.exitCode = 1;
