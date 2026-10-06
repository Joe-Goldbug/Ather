// RLS 隔离验证：确认匿名/其他用户读不到不该读的数据
//
// 判定方法（不能用「单条件查询」对比，必须用「策略条件」对比「无条件」）：
//   RLS_ACTIVE   =策略条件下 0 行 + 无条件 N 行（N>0）→ 策略确实在过滤
//   RLS_BYPASSED = 两个数字相同 → 策略被绕过
//
// 注意：neondb_owner 带rolbypassrls=true，必须依赖
// 004_force_rls.sql 的 FORCE ROW LEVEL SECURITY 才会受策略约束。
import { Client } from 'pg';

const c = new Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 20000,
});
await c.connect();
const schema = process.env.DATABASE_SCHEMA || process.env.EVA_DATABASE_SCHEMA || 'ather_solana';
await c.query(`SET search_path TO ${schema}`);

const TABLES = [
  'theme_assessment_rounds',
  'theme_assessment_round_items',
  'theme_assessment_round_answers',
  'theme_assessment_result_revisions',
  'theme_assessment_result_responses',
  'captures',
];

// ── 1. 强制 RLS 是否已应用 ──────────────────────────────────────────
const force = await c.query(
  `SELECT relname, relrowsecurity, relforcerowsecurity
   FROM pg_class
   WHERE relnamespace = schema::regnamespace AND relname = ANY($1)`,
  [TABLES],
);
const notForced = force.rows.filter((r) => !r.relforcerowsecurity).map((r) => r.relname);
process.stdout.write(
  `FORCE RLS: ${force.rows.length - notForced.length}/${force.rows.length} 表已启用` +
    (notForced.length ? ` | 未启用: ${notForced.join(', ')}` : '') +
    '\n',
);

// ── 2. 匿名视角：策略条件下应全部为 0 ──────────────────────────────
await c.query("SELECT set_config('app.session_token', '', false)");
const POLICYT_OWNER = `(SELECT user_id FROM session_tokens
   WHERE token = current_setting('app.session_token', true)
     AND NOT revoked AND expires_at > NOW())`;

let policyVisible = 0;
let totalVisible = 0;
for (const t of TABLES) {
  const viaPolicy = await c.query(
    t === 'theme_assessment_round_items' || t === 'theme_assessment_result_revisions'
      ? `SELECT count(*)::int c FROM ${t}
         WHERE round_id IN (SELECT id FROM theme_assessment_rounds WHERE user_id = ${POLICYT_OWNER})`
      : `SELECT count(*)::int c FROM ${t} WHERE user_id = ${POLICYT_OWNER}`,
  );
  const total = await c.query(`SELECT count(*)::int c FROM ${t}`);
  policyVisible += viaPolicy.rows[0].c;
  totalVisible += total.rows[0].c;
}
process.stdout.write(`匿名经策略可见: ${policyVisible} 行（应0）\n`);
process.stdout.write(`匿名无条件可见: ${totalVisible} 行（应 > 0，证明有数据）\n`);

// ── 3. 已登录用户：应能读到自己���轮次 ───────────────────────────────
const { rows: sessions } = await c.query(
  `SELECT u.email, s.token
   FROM session_tokens s JOIN users u ON u.id = s.user_id
   WHERE NOT s.revoked AND s.expires_at > NOW()
   ORDER BY s.created_at DESC`,
);
process.stdout.write(`活跃会话: ${sessions.length} 个\n`);

let ownVisible = 0;
if (sessions.length > 0) {
  const t = sessions[0].token;
  await c.query('SELECT set_config($1, $2, false)', ['app.session_token', t]);
  const mine = await c.query(
    `SELECT count(*)::int c FROM theme_assessment_rounds
     WHERE user_id = ${POLICYT_OWNER}`,
  );
  ownVisible = mine.rows[0].c;
  process.stdout.write(`以 ${sessions[0].email} 身份可见自己的轮次: ${ownVisible} 行（应 > 0）\n`);
}

const rlsOk =
  notForced.length === 0 && policyVisible === 0 && totalVisible > 0 && ownVisible > 0;
process.stdout.write(rlsOk ? '\nRLS_OK\n' : '\nRLS_PROBLEM\n');
if (!rlsOk) process.exitCode = 1;

await c.end();
