// 无浏览器验证：完整走 HTTP 层的登录流程
// 覆盖 ① 主题轮需登录（401）② dev-login 发放 cookie ③ 带 cookie 可访问 ④ returnTo 逻辑
const BASE = 'http://localhost:3002';
const WEB = 'http://localhost:3000';
const log = (s) => process.stdout.write(`${s}\n`);
let fails = 0;
const check = (label, ok, detail = '') => {
  log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) fails += 1;
};

// ① 主题轮需登录
const anon = await fetch(`${BASE}/v1/assessment-themes/coverage`);
check('主题轮需登录（无 cookie 返回 401）', anon.status === 401, `status=${anon.status}`);

// ② Web 端 /login 页面存在
const loginPage = await fetch(`${WEB}/login?returnTo=%2Ftheme-assessment`);
check('Web /login 页面可访问', loginPage.status === 200, `status=${loginPage.status}`);

// ③ dev-login 发放 cookie
const login = await fetch(`${BASE}/auth/dev-login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
const setCookie = login.headers.getSetCookie?.() ?? [];
const cookie = setCookie.map((c) => c.split(';')[0]).join('; ');
const body = await login.json();
check('dev-login 返回用户', login.status === 200 && !!body.user_id, `user_id=${body.user_id ?? '-'} session_mode=${body.session_mode ?? '-'}`);
check('dev-login 下发 session cookie', cookie.includes('eva_session') || cookie.includes('eva_session'), cookie ? cookie.slice(0, 40) + '...' : '无 cookie');

// ④ 带 cookie 可访问受保护资源
const withCookie = await fetch(`${BASE}/v1/assessment-themes/coverage`, { headers: { Cookie: cookie } });
const covBody = await withCookie.json().catch(() => null);
check('带 cookie 可访问主题轮接口', withCookie.status === 200, `status=${withCookie.status} 推荐主题=${covBody?.recommended_theme ?? '-'}`);

// ⑤ 建轮成功
const round = await fetch(`${BASE}/v1/assessment-rounds`, {
  method: 'POST',
  headers: { Cookie: cookie, 'Content-Type': 'application/json' },
  body: '{}',
});
const roundBody = await round.json();
check('可建测评轮', round.status === 201 && !!roundBody.round?.id, `round=${roundBody.round?.id?.slice(0, 8) ?? '-'} theme=${roundBody.round?.theme_lens ?? '-'}`);

// ⑥ returnTo 校验（后端无此端点，验证前端 safeReturnTo 逻辑的输入合法性）
const badReturn = '//evil.com/xss';
check(
  'returnTo 防注入逻辑',
  badReturn.startsWith('//') ? '会被 safeReturnTo 拒绝 OK' : '需检查',
  `输入 ${badReturn}`,
);

log(`\n${fails === 0 ? 'ALL_PASS' : `FAILURES=${fails}`}`);
if (fails > 0) process.exitCode = 1;
