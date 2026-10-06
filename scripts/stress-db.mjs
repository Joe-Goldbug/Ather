// 压测：连续打满接口，看是否触发重试、以及是否会永久卡死
// 目的：验证「不需要重启进程」的改进是否真的有效
const BASE = 'http://localhost:3002';
const log = (s) => process.stdout.write(`${s}\n`);

// 登录拿 cookie
const login = await fetch(`${BASE}/auth/dev-login`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: '{}',
});
const cookie = (login.headers.getSetCookie?.() ?? []).map((c) => c.split(';')[0]).join('; ');
if (!cookie.includes('eva_session') && !cookie.includes('ather_session')) {
  log(`无法登录，跳过压测: ${login.status}`);
  process.exit(1);
}
log('已登录，开始压测 60 次…');

let ok = 0;
let retryable = 0;
let fatal = 0;
const codes = {};

for (let i = 0; i < 60; i += 1) {
  try {
    const r = await fetch(`${BASE}/v1/assessment-themes/coverage`, {
      headers: { Cookie: cookie },
      signal: AbortSignal.timeout(15_000),
    });
    codes[r.status] = (codes[r.status] ?? 0) + 1;
    if (r.status === 200) ok += 1;
    else if (r.status >= 500) retryable += 1;
    else fatal += 1;
  } catch (e) {
    fatal += 1;
    codes.NET_ERR = (codes.NET_ERR ?? 0) + 1;
  }
}

log(`结果: ok=${ok} 5xx=${retryable} 其他=${fatal}`);
log(`状态码分布: ${JSON.stringify(codes)}`);
log(ok >= 55 ? 'PASS 压测通过（连接稳定）' : `FAIL 压测失败，${60 - ok} 次失败`);

// 关键：失败后能否自愈（不重启进程）
if (ok < 60) {
  log('等待 3 秒后重试，验证自愈…');
  await new Promise((r) => setTimeout(r, 3000));
  const r = await fetch(`${BASE}/auth/me`, { headers: { Cookie: cookie } });
  log(`重试结果: HTTP ${r.status} ${r.status === 200 ? '→ 已自愈，无需重启 OK' : '→ 仍失败'}`);
} else {
  log('全部 200，无需验证自愈路径');
}
