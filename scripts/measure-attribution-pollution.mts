/**
 * V-2 存量归因污染占比测量（只读，不写任何数据）。
 *
 * 用法：bun run scripts/measure-attribution-pollution.mts
 *
 * 方法：对生产库 source_type='diary' 的证据，在其 quote 中寻找触发词；
 * 找到的视为"可测样本"，用 classifyAttribution 归因。
 *
 * 已知局限：
 * - 历史 quote = 前 200 字（2-A2 修复前的产物），触发词可能不在 quote 里，
 *   可测样本本身是子集 → about_other 占比是**下界**。
 * - 2026-09-11 实测：生产库 diary 证据为 0 行（diary 是 legacy 通道，
 *   活跃自由文本通道是 captures）——本脚本当前测不出任何东西，
 *   保留用于 diary 流量起量后的复测。
 */
import { readFileSync } from 'node:fs';
import pg from 'pg';
import { classifyAttribution } from '../packages/core/src/evidence/attribution.js';
import { PATTERN_DIMENSION_MAP } from '../packages/core/src/evidence/diary-evidence.js';

const envText = readFileSync(new URL('../apps/api/.env', import.meta.url), 'utf8');
const env = Object.fromEntries(
  envText
    .split(/\r?\n/)
    .filter((l) => l && !l.startsWith('#') && l.includes('='))
    .map((l) => {
      const i = l.indexOf('=');
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    }),
);

const c = new pg.Client({ connectionString: env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await c.connect();
const res = await c.query(
  `SELECT id, dimension, quote FROM evidence_events
   WHERE source_type = 'diary' AND quote IS NOT NULL AND quote <> ''`,
);
await c.end();

let measurable = 0;
let aboutOther = 0;
let hypothetical = 0;
const samples: Array<{ dimension: string; quote: string }> = [];

for (const row of res.rows) {
  const rules = PATTERN_DIMENSION_MAP.filter((r) => r.dimension === row.dimension);
  for (const { pattern } of rules) {
    const m = new RegExp(pattern.source, pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`).exec(row.quote);
    if (!m) continue;
    measurable += 1;
    const attribution = classifyAttribution(row.quote, m.index);
    if (attribution === 'about_other') {
      aboutOther += 1;
      if (samples.length < 8) samples.push({ dimension: row.dimension, quote: row.quote.slice(0, 60) });
    } else if (attribution === 'hypothetical') {
      hypothetical += 1;
    }
    break; // 每条证据只计一次（首个命中规则）
  }
}

const total = res.rows.length;
const pct = (n: number, d: number) => (d > 0 ? ((n / d) * 100).toFixed(1) : '0.0');
console.log(`[V-2] diary 证据总数: ${total}`);
console.log(`[V-2] quote 内可测样本: ${measurable}（历史 quote=前200字，可测即子集）`);
console.log(`[V-2] about_other: ${aboutOther}（占可测样本 ${pct(aboutOther, measurable)}%，占总数下界 ${pct(aboutOther, total)}%）`);
console.log(`[V-2] hypothetical: ${hypothetical}`);
if (samples.length) {
  console.log('[V-2] about_other 样例:');
  for (const s of samples) console.log(`  - [${s.dimension}] ${s.quote}`);
}
process.exit(0);
