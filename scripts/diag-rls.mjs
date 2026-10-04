// RLS 策略逐层排查：确认是策略不匹配，还是 RLS 未生效
import { Client } from 'pg';

const c = new Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 20000,
});
await c.connect();
await c.query('SET search_path TO ather_solana');
await c.query("SELECT set_config('app.session_token', '', false)");

const probe = await c.query("SELECT current_setting('app.session_token', true) AS tok");
process.stdout.write(`app.session_token = ${JSON.stringify(probe.rows[0].tok)}\n`);

const sub = await c.query(
  `SELECT count(*)::int c FROM session_tokens
   WHERE token = current_setting('app.session_token', true) AND NOT revoked AND expires_at > NOW()`,
);
process.stdout.write(`策略子查询命中行数 = ${sub.rows[0].c}（应为 0）\n`);

const direct = await c.query(
  `SELECT count(*)::int c FROM theme_assessment_rounds
   WHERE user_id = (SELECT user_id FROM session_tokens
                    WHERE token = current_setting('app.session_token', true)
                      AND NOT revoked AND expires_at > NOW())`,
);
process.stdout.write(`策略条件下可见行数 = ${direct.rows[0].c}（应为 0）\n`);

const all = await c.query('SELECT count(*)::int c FROM theme_assessment_rounds');
process.stdout.write(`无条件总行数 = ${all.rows[0].c}\n`);

// 关键判定：两个数字不同 => RLS 生效；相同 => RLS 被绕过
process.stdout.write(
  direct.rows[0].c === 0 && all.rows[0].c > 0 ? 'RLS_ACTIVE\n' : 'RLS_BYPASSED\n',
);

await c.end();
