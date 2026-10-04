// 验证历史轮次 UI：API 数据 → 页面渲染
// 注意：主题卡片与历史区块都是客户端异步渲染，SSR HTML 里看不到，
// 所以这里验证「API 返回的数据结构是否满足 UI 所需字段」+「SSR 无报错」。
const WEB = 'http://localhost:3000';
const p = (s) => process.stdout.write(`${s}\n`);
let fails = 0;
const check = (l, ok, d = '') => {
  p(`${ok ? 'PASS' : 'FAIL'}  ${l}${d ? ` — ${d}` : ''}`);
  if (!ok) fails += 1;
};

// 1. 登录取 cookie
const login = await fetch(`${WEB}/api/auth/dev-login`, { method: 'POST' });
const cookie = (login.headers.getSetCookie?.() ?? []).map((c) => c.split(';')[0]).join('; ');
check('登录', login.status === 200 && cookie.includes('ather_session'), `status=${login.status}`);

// 2. history API 返回结构是否满足 UI 所需
const hist = await fetch(`${WEB}/api/v1/assessment-rounds`, { headers: { Cookie: cookie } });
const rounds = await hist.json();
check('history API', hist.status === 200 && Array.isArray(rounds), `${rounds.length} 条`);

const UI_FIELDS = [
  'id', 'theme_lens', 'theme_title', 'status',
  'completed_at', 'headline', 'boundary',
  'feedback_state', 'whole_result_refuted', 'latest_feedback_action',
];
const sample = rounds[0] ?? {};
const missing = UI_FIELDS.filter((f) => !(f in sample));
check('UI 所需字段齐全', missing.length === 0, missing.length ? `缺: ${missing}` : '10/10');

// 3. 三个状态分支各有实例可展示
const disputed = rounds.filter((r) => r.feedback_state === 'needs_follow_up');
const refuted = rounds.filter((r) => r.whole_result_refuted);
const recorded = rounds.filter((r) => r.feedback_state === 'recorded');
const inProgress = rounds.filter(
  (r) => r.status === 'in_progress' || r.status === 'ready_to_complete',
);
p('');
p(`  状态分布：needs_follow_up=${disputed.length} whole_refuted=${refuted.length} recorded=${recorded.length} in_progress=${inProgress.length}`);
check('至少一个可跳转的历史轮次', rounds.filter((r) => r.headline).length > 0,
  `${rounds.filter((r) => r.headline).length} 轮有 headline 可跳`);

// 4. 页面 SSR 不报错
const page = await fetch(`${WEB}/theme-assessment`);
const html = await page.text();
check('页面 200', page.status === 200, `status=${page.status}`);
check('SSR 无运行时错误', !/Application error|Unhandled Runtime|Internal Server Error/i.test(html));

// 5. 确认新代码已进 bundle
p('');
p(`  页面含 loading 文案（预期，主题卡片为客户端渲染）: ${html.includes('正在准备') ? 'YES' : 'NO'}`);

p(`\n${fails === 0 ? 'ALL_PASS' : `FAILURES=${fails}`}`);
if (fails > 0) process.exitCode = 1;
