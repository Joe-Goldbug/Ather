// Ather-Solana 闭环端到端自测
// 覆盖：访客测评 → dev-login → 建轮 → 逐题作答 → complete → 读结果 → 提交反馈 → 轮次历史 → 主题覆盖
//
// 用法：node scripts/e2e-closed-loop.mjs [baseUrl]
// 前置：API 已启动，Redis 6379 在线
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';

const BASE = process.argv[2] || 'http://localhost:3002';
const COOKIE_FILE = '.tmp/cookies.txt';

let cookie = '';
try {
  const raw = readFileSync(COOKIE_FILE, 'utf8');
  const line = raw.split('\n').find((l) => l.includes('ather_session'));
  if (line) {
    const parts = line.trim().split('\t');
    cookie = `ather_session=${parts[parts.length - 1]}`;
  }
} catch {
  /* 首次运行无 cookie */
}

async function api(path, opts = {}) {
  const res = await fetch(`${BASE}${path}`, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      ...(cookie ? { Cookie: cookie } : {}),
      ...(opts.headers ?? {}),
    },
  });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = text.slice(0, 200);
  }
  return { status: res.status, json };
}

let failures = 0;
function check(label, ok, detail = '') {
  process.stdout.write(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}\n`);
  if (!ok) failures += 1;
}

async function main() {
  // 1. 访客测评（免登录）
  const guest = await api('/v1/story/guest-opening');
  check(
    '访客测评 guest-opening',
    guest.status === 200 && Array.isArray(guest.json.nodes) && guest.json.nodes.length > 0,
    `status=${guest.status} nodes=${guest.json.nodes?.length ?? 0}`,
  );

  // 2. dev-login
  const login = await api('/auth/dev-login', { method: 'POST', body: '{}' });
  check(
    'dev-login',
    login.status === 200 && !!login.json.user_id,
    `status=${login.status} mode=${login.json.session_mode ?? '-'}`,
  );

  // 3. auth/me
  const me = await api('/auth/me');
  check('auth/me', me.status === 200 && !!me.json.email, `email=${me.json.email ?? '-'}`);

  // 4. 主题覆盖
  const cov = await api('/v1/assessment-themes/coverage');
  check('主题覆盖 coverage', cov.status === 200, `status=${cov.status}`);

  // 5. 建轮
  const created = await api('/v1/assessment-rounds', { method: 'POST', body: '{}' });
  const roundId = created.json.round?.id;
  check(
    '建轮 POST /v1/assessment-rounds',
    !!roundId,
    `round=${roundId ?? '-'} theme=${created.json.round?.theme_lens ?? '-'}`,
  );
  if (!roundId) {
    process.stdout.write('\n建轮失败，后续步骤跳过\n');
    return;
  }

  // 6. 逐题作答（6–8 题）
  let answered = 0;
  let followups = 0;
  // 记录 core 题 ID 用于去重统计。
  // 为什么要去重：`/next` 偶发返回失效 item_id，会走complete 409 兜底路径，
  // 该路径可能把同一道题再返回一次，导致 answered 虚高（实测出现过 9）。
  const coreIdsSeen = new Set();
  for (let i = 0; i < 30; i += 1) {
    const next = await api(`/v1/assessment-rounds/${roundId}/next`);
    let itemId = next.json.item_id;
    let question = next.json.question;

    // /next 偶发返回失效 item_id，complete 的 409 里 next 字段是权威来源
    if (!itemId) {
      const done = await api(`/v1/assessment-rounds/${roundId}/complete`, {
        method: 'POST',
        body: JSON.stringify({ operation_id: randomUUID() }),
      });
      if (done.status === 409 && done.json.next?.item_id) {
        itemId = done.json.next.item_id;
        question = done.json.next.question;
      } else {
        break;
      }
    }

    const opts = question?.options ?? [];
    const choice = opts.length ? opts[answered % opts.length].id : 'A';
    const resp = await api(`/v1/assessment-rounds/${roundId}/items/${itemId}/responses`, {
      method: 'POST',
      body: JSON.stringify({ choice_id: choice, operation_id: randomUUID() }),
    });
    if (resp.status !== 200 && resp.status !== 201) {
      check(`第 ${answered + 1} 题作答`, false, `status=${resp.status} ${JSON.stringify(resp.json).slice(0, 120)}`);
      break;
    }
    answered += 1;
    if (question?.role && question.role !== 'core') followups += 1;
    else if (question?.role === 'core') coreIdsSeen.add(question.question_id ?? itemId);
  }
  // core 必须是 6 题（theme-round.ts:620 `coreIds.size < 6` 硬校验）。
  // 上限 8：多出的是 clarifier / counterexample 追问。
  // 注意：这里的 409 兜底路径会先取一次题再作答，若next 重复返回同一题，
  // 用 Set 去重后再统计，避免把同一题计两次。
  const coreAnswered = new Set(coreIdsSeen);
  check(
    '逐题作答（core 6 题，含追问共 6–8）',
    coreAnswered.size === 6 && answered >= 6 && answered <= 8,
    `core去重=${coreAnswered.size} 总作答=${answered} 追问=${followups}`,
  );

  // 7. complete
  const done = await api(`/v1/assessment-rounds/${roundId}/complete`, {
    method: 'POST',
    body: JSON.stringify({ operation_id: randomUUID() }),
  });
  check(
    'complete 生成结果',
    done.status === 200 || done.status === 201,
    `status=${done.status}`,
  );

  // 8. 读结果
  const result = await api(`/v1/assessment-rounds/${roundId}/result`);
  const resultOk = result.status === 200;
  const obsCount = result.json?.result?.observations?.length ?? result.json?.observations?.length ?? 0;
  check('读结果 GET result', resultOk, `status=${result.status} observations=${obsCount}`);

  // 9. 提交反馈（operation_id 必填，否则 invalid_response_command）
  if (resultOk) {
    const obs = result.json?.result?.observations ?? [];
    const target = obs[0]?.evidence_question_id ?? null;
    const fb = await api(`/v1/assessment-rounds/${roundId}/result/responses`, {
      method: 'POST',
      body: JSON.stringify({
        action: 'confirm',
        operation_id: randomUUID(),
        ...(target ? { observation_question_id: target } : {}),
      }),
    });
    check(
      '提交反馈 result/responses',
      fb.status === 200 || fb.status === 201,
      `status=${fb.status} action=confirm target=${target ?? 'whole-round'}`,
    );
  }

  // 10. 轮次历史
  const list = await api('/v1/assessment-rounds');
  const rounds = list.json?.rounds ?? list.json ?? [];
  check(
    '轮次历史 GET /v1/assessment-rounds',
    list.status === 200 && Array.isArray(rounds) && rounds.length > 0,
    `status=${list.status} count=${Array.isArray(rounds) ? rounds.length : '-'}`,
  );

  process.stdout.write(`\n${failures === 0 ? 'ALL_PASS' : `FAILURES=${failures}`}\n`);
  if (failures > 0) process.exitCode = 1;
}

main().catch((e) => {
  process.stdout.write(`ERROR ${e instanceof Error ? e.message : String(e)}\n`);
  process.exitCode = 1;
});
