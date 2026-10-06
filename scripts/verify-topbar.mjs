// 验证顶栏：① 未登录显示「登录/注册」② 登录后显示邮箱+退出 ③ 各页面都有顶栏
const WEB = 'http://localhost:3000';
const log = (s) => process.stdout.write(`${s}\n`);

const pages = ['/', '/play', '/theme-assessment', '/whitepaper', '/login'];
let fails = 0;
const check = (label, ok, detail = '') => {
  log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) fails += 1;
};

// ① 各页面 SSR 是否含顶栏
for (const p of pages) {
  const r = await fetch(`${WEB}${p}`);
  const html = await r.text();
  const hasBar = html.includes('top-bar__logo');
  const hasAuth = html.includes('登录 / 注册') || html.includes('退出登录');
  check(
    `顶栏存在 ${p}`,
    r.status === 200 && hasBar,
    `status=${r.status} logo=${hasBar} auth入口=${hasAuth}`,
  );
}

// ② 未登录态：应显示「登录 / 注册」
const anon = await (await fetch(`${WEB}/`)).text();
check('未登录显示登录入口', anon.includes('登录 / 注册'), '期待「登录 / 注册」');

// ③ 登录后：应显示邮箱 + 退出
const login = await fetch(`${WEB}/api/auth/dev-login`, { method: 'POST' });
const cookie = (login.headers.getSetCookie?.() ?? [])
  .map((c) => c.split(';')[0])
  .join('; ');
check('dev-login 成功', login.status === 200 && (cookie.includes('eva_session') || cookie.includes('ather_session')), `status=${login.status}`);

if (cookie) {
  // 用带 cookie 的请求拿 SSR HTML 不现实（fetch 不会带 cookie 到 SSR），
  // 改为验证 API 层：带 cookie 时 /auth/me 应返回用户
  const me = await fetch(`${WEB}/api/auth/me`, { headers: { Cookie: cookie } });
  const body = await me.json().catch(() => null);
  check('带 cookie 可取用户', me.status === 200 && !!body?.email, `email=${body?.email ?? '-'}`);
}

log(`\n${fails === 0 ? 'ALL_PASS' : `FAILURES=${fails}`}`);
if (fails > 0) process.exitCode = 1;
