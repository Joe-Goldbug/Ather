// 闭环表结构自检：确认迁移结果与 RLS 生效
import { Client } from 'pg';

const NEED = [
  'users',
  'session_tokens',
  'login_events',
  'email_login_challenges',
  'auth_rate_limits',
  'assessment_runs',
  'captures',
  'theme_assessment_rounds',
  'theme_assessment_round_items',
  'theme_assessment_round_answers',
  'theme_assessment_result_revisions',
  'theme_assessment_result_responses',
  'consent_grants',
  'audit_logs',
];

const c = new Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 20000,
});
await c.connect();
await c.query('SET search_path TO ather_solana');

const r = await c.query(
  "SELECT tablename FROM pg_tables WHERE schemaname='ather_solana' ORDER BY tablename",
);
const have = new Set(r.rows.map((x) => x.tablename));
process.stdout.write(`schema 内共 ${have.size} 张表\n`);

let missing = 0;
for (const t of NEED) {
  const ok = have.has(t);
  if (!ok) missing += 1;
  process.stdout.write(`${ok ? 'OK  ' : 'MISS'} ${t}\n`);
}

const rls = await c.query(
  `SELECT c.relname FROM pg_class c
   JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname='ather_solana' AND c.relrowsecurity
   ORDER BY c.relname`,
);
process.stdout.write(`RLS 启用表(${rls.rows.length}): ${rls.rows.map((x) => x.relname).join(', ')}\n`);
process.stdout.write(missing === 0 ? 'ALL_TABLES_PRESENT\n' : `MISSING_COUNT=${missing}\n`);

await c.end();
