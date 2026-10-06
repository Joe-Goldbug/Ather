// 审查数据可追溯性：AI 生成内容的证据链 + 用户历史记录
import { Client } from 'pg';

const c = new Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 20000,
});
await c.connect();
const schema = process.env.DATABASE_SCHEMA || process.env.EVA_DATABASE_SCHEMA || 'ather_solana';
await c.query(`SET search_path TO ${schema}`);
const p = (s) => process.stdout.write(`${s}\n`);

// ── 1. 轮次历史 ──
const rounds = await c.query(`
  SELECT r.id, r.theme_lens, r.status, r.created_at, r.completed_at,
         (SELECT count(*)::int FROM theme_assessment_round_items i WHERE i.round_id = r.id) AS items,
         (SELECT count(*)::int FROM theme_assessment_round_answers a WHERE a.round_id = r.id) AS answers
  FROM theme_assessment_rounds r ORDER BY r.created_at DESC LIMIT 6
`);
p('【1】轮次历史（theme_assessment_rounds）');
rounds.rows.forEach((r) => {
  p(
    `  ${r.id.slice(0, 8)} ${r.theme_lens.padEnd(16)} ${r.status.padEnd(12)} 题${r.items} 答${r.answers} ${String(r.created_at).slice(0, 19)}`,
  );
});
p('');

// ── 2. 已完成轮次（真正有结果的）──
const done = await c.query(
  `SELECT id, theme_lens, completed_at FROM theme_assessment_rounds
   WHERE status = 'completed' ORDER BY completed_at DESC LIMIT 3`,
);
p(`【2】已完成并出结果的轮次：${done.rowCount} 个`);
done.rows.forEach((r) => {
  p(`  ${r.id.slice(0, 8)} ${r.theme_lens} @ ${String(r.completed_at).slice(0, 19)}`);
});
p('');

if (done.rowCount === 0) {
  p('  （暂无已完成轮次，改用任意 revision 检查）');
}

// ── 3. AI 结果版本 ──
const revs = await c.query(`
  SELECT id, round_id, revision_number, result, published_at, created_at
  FROM theme_assessment_result_revisions
  WHERE invalidated_at IS NULL
  ORDER BY created_at DESC LIMIT 3
`);
p('【3】AI 结果版本（result jsonb）');
revs.rows.forEach((r) => {
  const obs = r.result?.observations ?? [];
  p(`  revision ${r.id.slice(0, 8)} round=${r.round_id.slice(0, 8)} #${r.revision_number} 观察数=${obs.length} published=${r.published_at ? 'Y' : 'N'}`);
});
p('');

if (revs.rowCount === 0) {
  p('  （库中暂无结果版本）');
  await c.end();
  process.exit(0);
}

// ── 4. 证据链核心测试：观察 → 原题 → 用户作答 ──
const r0 = revs.rows[0];
const list = r0.result?.observations ?? [];
p('【4】证据链追溯（最新结果的全部观察）');
p(`  observation 字段: ${Object.keys(list[0] ?? {}).join(', ')}`);

let traced = 0;
for (const o of list) {
  const qid = o.evidence_question_id;
  if (!qid) {
    p(`  ✗ 观察缺少 evidence_question_id`);
    continue;
  }
  // 反查题目快照
  const item = await c.query(
    `SELECT question_id, role, definition FROM theme_assessment_round_items
     WHERE question_id = $1 LIMIT 1`,
    [qid],
  );
  if (item.rowCount === 0) {
    p(`  ✗ ${qid} → 找不到题目快照（证据链断裂）`);
    continue;
  }
  const def = item.rows[0].definition ?? {};
  // 反查用户作答。
  // ⚠️ answers 表**不存 question_id**，需经 item_id 两跳关联：
  //   answers.item_id -> round_items.id -> round_items.question_id
  const ans = await c.query(
    `SELECT a.choice_id, a.free_text, a.answered_at
     FROM theme_assessment_round_answers a
     JOIN theme_assessment_round_items i ON i.id = a.item_id
     WHERE i.question_id = $1 LIMIT 1`,
    [qid],
  );
  if (ans.rowCount === 0) {
    p(`  ~ ${qid} → 题目在库，但无作答记录（该观察可能来自推断）`);
    continue;
  }
  traced += 1;
  const opts = def.options ?? [];
  const picked = opts.find((x) => x.id === ans.rows[0].choice_id);
  p(`  ✓ ${qid}`);
  p(`     题目: [${item.rows[0].role}] ${String(def.prompt ?? '').slice(0, 36)}…`);
  p(`     用户选: ${ans.rows[0].choice_id}「${(picked?.text ?? '-').slice(0, 40)}」`);
  p(`     作答时间: ${String(ans.rows[0].answered_at).slice(0, 19)}`);
}
p(`\n  证据链完整度: ${traced}/${list.length} 条观察可回溯到「题目原文 + 用户选择 + 时间戳」`);

// ── 5. 用户反馈 ──
const fb = await c.query(`
  SELECT action, observation_question_id, explanation, created_at
  FROM theme_assessment_result_responses ORDER BY created_at DESC LIMIT 5
`);
p(`\n【5】用户反馈记录（最近 ${fb.rowCount} 条）`);
fb.rows.forEach((r) => {
  p(`  ${r.action.padEnd(8)} 指向=${(r.observation_question_id ?? '整份').slice(0, 40)} "${(r.explanation ?? '-').slice(0, 26)}"`);
});

await c.end();
