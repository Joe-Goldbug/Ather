// scripts/verify-rls.mjs
// 真实 RLS 隔离验证：使用非特权角色 + 真实 SQL 查询（不手写用户过滤条件）
// 验收标准：
// 1. 匿名用户通过纯 SELECT count(*) FROM <table> 读不到任何私密数据 (count === 0)
// 2. 用户 A 无法读取、更新或删除用户 B 的记录
// 3. 会话撤回后，相同 token 查询立即返回 0 行
// 4. 清除 session_token 后，连接不残留上一位用户的权限

import 'dotenv/config';
import { Client } from 'pg';
import { randomUUID } from 'node:crypto';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error('[verify-rls] DATABASE_URL is required');
  process.exit(1);
}

function isLocal(url) {
  try {
    const u = new URL(url);
    return ['localhost', '127.0.0.1', '::1'].includes(u.hostname);
  } catch {
    return false;
  }
}

const client = new Client({
  connectionString: databaseUrl,
  ssl: isLocal(databaseUrl) ? false : { rejectUnauthorized: false },
  connectionTimeoutMillis: 20000,
});

await client.connect();

const schema = process.env.DATABASE_SCHEMA || process.env.EVA_DATABASE_SCHEMA || 'public';
await client.query(`SET search_path TO ${schema}`);

const TABLES = [
  'captures',
  'theme_assessment_rounds',
  'theme_assessment_round_items',
  'theme_assessment_round_answers',
  'theme_assessment_result_revisions',
  'theme_assessment_result_responses',
];

console.log(`[verify-rls] Connected. Schema: ${schema}`);

// ── 1. 检查表是否开启 RLS ──────────────────────────────────────────
const rlsStatus = await client.query(
  `SELECT relname, relrowsecurity, relforcerowsecurity
   FROM pg_class
   WHERE relnamespace = $1::regnamespace AND relname = ANY($2)`,
  [schema, TABLES],
);

const missingTables = TABLES.filter((t) => !rlsStatus.rows.some((r) => r.relname === t));
if (missingTables.length > 0) {
  console.error(`[verify-rls] 缺少表: ${missingTables.join(', ')}`);
  process.exit(1);
}

const noRls = rlsStatus.rows.filter((r) => !r.relrowsecurity).map((r) => r.relname);
if (noRls.length > 0) {
  console.error(`[verify-rls] 以下表未启用 RLS: ${noRls.join(', ')}`);
  process.exit(1);
}
console.log(`[verify-rls] 表 RLS 状态检查: 全部 ${TABLES.length} 张表均已启用 relrowsecurity`);

// ── 2. 准备真实非特权角色 ───────────────────────────────────────────
const currentRoleRes = await client.query('SELECT current_user, rolbypassrls FROM pg_roles WHERE rolname = current_user');
const currentRole = currentRoleRes.rows[0];
console.log(`[verify-rls] 当前连接角色: ${currentRole.current_user} (bypassrls=${currentRole.rolbypassrls})`);

const VERIFIER_ROLE = 'eva_rls_verifier';
// 创建非特权测试角色（无 BYPASSRLS）
await client.query(`
  DO $$
  BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${VERIFIER_ROLE}') THEN
      CREATE ROLE ${VERIFIER_ROLE} NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
    END IF;
  END
  $$;
`);
await client.query(`GRANT USAGE ON SCHEMA ${schema} TO ${VERIFIER_ROLE}`);
await client.query(`GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA ${schema} TO ${VERIFIER_ROLE}`);

// ── 3. 准备隔离测试数据（User A & User B）─────────────────────────────
const userAId = randomUUID();
const userBId = randomUUID();
const tokenA = `test-token-a-${randomUUID()}`;
const tokenB = `test-token-b-${randomUUID()}`;
const captureAId = randomUUID();
const captureBId = randomUUID();
const roundAId = randomUUID();
const roundBId = randomUUID();

try {
  // 插入测试用户与有效会话
  await client.query(
    `INSERT INTO users (id, email) VALUES ($1, $2), ($3, $4) ON CONFLICT (id) DO NOTHING`,
    [userAId, `test-user-a-${userAId.slice(0, 8)}@eva.test`, userBId, `test-user-b-${userBId.slice(0, 8)}@eva.test`],
  );

  await client.query(
    `INSERT INTO session_tokens (token, user_id, expires_at, revoked) VALUES
     ($1, $2, NOW() + INTERVAL '1 day', false),
     ($3, $4, NOW() + INTERVAL '1 day', false)`,
    [tokenA, userAId, tokenB, userBId],
  );

  // 插入属于 User A 和 User B 的私密记录
  await client.query(
    `INSERT INTO captures (id, user_id, entry_type, process_mode, modality, source_weight, captured_at, capture_mode, allow_weekly_review, raw_text) VALUES
     ($1, $2, 'quick_fragment', 'save_only', 'text', 1.0, NOW(), 'real', false, 'User A Secret Observation'),
     ($3, $4, 'quick_fragment', 'save_only', 'text', 1.0, NOW(), 'real', false, 'User B Secret Observation')`,
    [captureAId, userAId, captureBId, userBId],
  );

  await client.query(
    `INSERT INTO theme_assessment_rounds (id, user_id, theme_lens, locale, status, question_bank_version, started_at, entry_source) VALUES
     ($1, $2, 'emotion', 'zh-CN', 'in_progress', 'v1', NOW(), 'registered_theme'),
     ($3, $4, 'emotion', 'zh-CN', 'in_progress', 'v1', NOW(), 'registered_theme')`,
    [roundAId, userAId, roundBId, userBId],
  );

  // ── 4. 切换为非特权角色执行真实 RLS 检验 ────────────────────────────
  await client.query(`SET ROLE ${VERIFIER_ROLE}`);

  // (1) 匿名视角：无 session_token，SELECT count(*) 必须为 0，不能读取到任何私密数据
  await client.query(`SELECT set_config('app.session_token', '', false)`);
  for (const t of TABLES) {
    const res = await client.query(`SELECT count(*)::int AS c FROM ${t}`);
    const visibleCount = res.rows[0].c;
    if (visibleCount !== 0) {
      throw new Error(`[RLS 失败] 匿名用户在表 ${t} 可读取到 ${visibleCount} 条数据！`);
    }
  }
  console.log('[verify-rls] 验收 1 通过: 匿名视角下全表纯查询返回 0 行，未泄露任何数据');

  // (2) 用户 A 视角：只能读到自己的记录，读不到用户 B 的记录
  await client.query(`SELECT set_config('app.session_token', $1, false)`, [tokenA]);
  const userACaptures = await client.query(`SELECT id, user_id FROM captures`);
  if (!userACaptures.rows.some((r) => r.id === captureAId)) {
    throw new Error('[RLS 失败] 用户 A 无法读取自己的 captures 记录！');
  }
  if (userACaptures.rows.some((r) => r.id === captureBId || r.user_id === userBId)) {
    throw new Error('[RLS 失败] 用户 A 读到了用户 B 的 captures 记录！跨租户泄露！');
  }

  const userARounds = await client.query(`SELECT id, user_id FROM theme_assessment_rounds`);
  if (!userARounds.rows.some((r) => r.id === roundAId)) {
    throw new Error('[RLS 失败] 用户 A 无法读取自己的 rounds 记录！');
  }
  if (userARounds.rows.some((r) => r.id === roundBId || r.user_id === userBId)) {
    throw new Error('[RLS 失败] 用户 A 读到了用户 B 的 rounds 记录！跨租户泄露！');
  }
  console.log('[verify-rls] 验收 2 通过: 用户 A 只能读取自身记录，严密隔离用户 B');

  // (3) 越权写入防护：用户 A 无法修改或删除用户 B 的数据
  const updateRes = await client.query(
    `UPDATE captures SET raw_text = 'Malicious Update' WHERE id = $1`,
    [captureBId],
  );
  if (updateRes.rowCount !== 0) {
    throw new Error(`[RLS 失败] 用户 A 竟然修改了用户 B 的记录！受影响行数: ${updateRes.rowCount}`);
  }

  const deleteRes = await client.query(
    `DELETE FROM captures WHERE id = $1`,
    [captureBId],
  );
  if (deleteRes.rowCount !== 0) {
    throw new Error(`[RLS 失败] 用户 A 竟然删除了用户 B 的记录！受影响行数: ${deleteRes.rowCount}`);
  }
  console.log('[verify-rls] 验收 3 通过: 用户 A 对用户 B 数据的篡改与删除操作被 RLS 阻止 (0 行受影响)');

  // (4) 会话撤回防护：撤回 Token A 后，立即失去访问权限
  await client.query(`RESET ROLE`); // 临时切回管理身份标记撤回
  await client.query(`UPDATE session_tokens SET revoked = true WHERE token = $1`, [tokenA]);
  await client.query(`SET ROLE ${VERIFIER_ROLE}`);

  await client.query(`SELECT set_config('app.session_token', $1, false)`, [tokenA]);
  const revokedCaptures = await client.query(`SELECT count(*)::int AS c FROM captures`);
  if (revokedCaptures.rows[0].c !== 0) {
    throw new Error(`[RLS 失败] 会话撤回后，Token A 仍能读取 ${revokedCaptures.rows[0].c} 行数据！`);
  }
  console.log('[verify-rls] 验收 4 通过: 会话撤回后即时阻断，Token 无法再读取任何数据');

  // (5) 连接池会话清理：清除 session_token 后连接回归匿名态
  await client.query(`SELECT set_config('app.session_token', '', false)`);
  const clearedRes = await client.query(`SELECT count(*)::int AS c FROM captures`);
  if (clearedRes.rows[0].c !== 0) {
    throw new Error(`[RLS 失败] 清除 session_token 后连接仍残留用户上下文！`);
  }
  console.log('[verify-rls] 验收 5 通过: 清除上下文后连接池复用不会继承上个用户身份');

  console.log('\n[verify-rls] 全部真实 RLS 隔离与授权验收项全部通过 (RLS_VERIFIED_SUCCESS)');
} finally {
  // 清理测试数据
  await client.query(`RESET ROLE`);
  await client.query(`DELETE FROM captures WHERE id IN ($1, $2)`, [captureAId, captureBId]);
  await client.query(`DELETE FROM theme_assessment_rounds WHERE id IN ($1, $2)`, [roundAId, roundBId]);
  await client.query(`DELETE FROM session_tokens WHERE token IN ($1, $2)`, [tokenA, tokenB]);
  await client.query(`DELETE FROM users WHERE id IN ($1, $2)`, [userAId, userBId]);
  await client.end();
}
