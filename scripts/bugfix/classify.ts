/**
 * Bug 分级器 — TIER 1 / 2 / 3 判断
 *
 * TIER 1: 编译期错误，确定性高，直接修
 * TIER 2: 需调查，修复范围 < 3 个文件
 * TIER 3: 业务/架构/安全，需人工
 */

import { createHash } from "node:crypto";
import type { BugItem, BugSource, BugTier } from "./types.ts";

// ─── TIER 1 判断规则 ──────────────────────────────────────────────────────────

const TIER1_TSC_PATTERNS = [
  /TS\d{4}/,                              // 所有 TypeScript 错误码
  /Cannot find module/,
  /Type '.*' is not assignable/,
  /Property '.*' does not exist/,
  /Object is possibly 'undefined'/,
  /Object is possibly 'null'/,
  /Argument of type '.*' is not assignable/,
  /Expected \d+ arguments, but got/,
];

const TIER1_ESLINT_PATTERNS = [
  /error\s+/,                             // eslint error 级（不是 warning）
];

const TIER1_TYPO_PATTERNS = [
  /adapative/i,
  /recieve/i,
  /seperator/i,
  /occured/i,
  /publically/i,
  /existance/i,
];

// ─── TIER 3 强制人工规则 ──────────────────────────────────────────────────────

const TIER3_PATTERNS = [
  /security/i,
  /xss/i,
  /sql injection/i,
  /race condition/i,
  /schema migration/i,
  /breaking change/i,
  /api contract/i,
];

const TIER3_FILE_PATTERNS = [
  /migration/,
  /schema\.ts$/,
  /schema\.sql$/,
  /\.env/,
  /secrets/,
  /auth.*strategy/i,
];

// ─── 核心分级逻辑 ─────────────────────────────────────────────────────────────

export function classifyBug(params: {
  source: BugSource;
  message: string;
  file?: string;
  affectedFiles?: string[];
}): BugTier {
  const { source, message, file = "", affectedFiles = [] } = params;

  // TIER 3: 强制优先检查（安全/架构，绝不自动修）
  if (TIER3_PATTERNS.some((p) => p.test(message))) return 3;
  if (TIER3_FILE_PATTERNS.some((p) => p.test(file))) return 3;
  if (affectedFiles.some((f) => TIER3_FILE_PATTERNS.some((p) => p.test(f)))) return 3;
  // 影响文件 > 3 → TIER 3
  if (affectedFiles.length > 3) return 3;

  // TIER 1: 编译期，高确定性
  if (source === "tsc" && TIER1_TSC_PATTERNS.some((p) => p.test(message))) return 1;
  if (source === "eslint" && TIER1_ESLINT_PATTERNS.some((p) => p.test(message))) return 1;
  if (TIER1_TYPO_PATTERNS.some((p) => p.test(message))) return 1;

  // TIER 1: build 失败但错误信息明确（包含文件+行号）
  if (source === "build" && /:\d+:\d+/.test(message)) return 1;

  // TIER 2: 其余情况
  return 2;
}

// ─── 解析 TSC 输出 → BugItem[] ────────────────────────────────────────────────

export function parseTscOutput(output: string): BugItem[] {
  const bugs: BugItem[] = [];
  // 格式：path/to/file.ts(line,col): error TSxxxx: message
  const lineRe = /^(.+?)\((\d+),(\d+)\):\s+(error|warning)\s+(TS\d+:\s*.+)$/gm;
  let match: RegExpExecArray | null;

  while ((match = lineRe.exec(output)) !== null) {
    const [, file, line, col, severity, msg] = match;
    if (severity !== "error") continue; // 只处理 error，忽略 warning

    const tier = classifyBug({ source: "tsc", message: msg, file });
    bugs.push(makeBugItem("tsc", msg.trim(), file, Number(line), Number(col), tier));
  }
  return bugs;
}

// ─── 解析 ESLint JSON 输出 → BugItem[] ───────────────────────────────────────

interface EslintResult {
  filePath: string;
  messages: Array<{
    severity: number;  // 1=warning, 2=error
    message: string;
    line?: number;
    column?: number;
    ruleId?: string | null;
  }>;
}

export function parseEslintOutput(jsonOutput: string): BugItem[] {
  const bugs: BugItem[] = [];
  let results: EslintResult[];
  try {
    results = JSON.parse(jsonOutput) as EslintResult[];
  } catch {
    return bugs;
  }

  for (const result of results) {
    for (const msg of result.messages) {
      if (msg.severity < 2) continue; // 只处理 error 级
      const text = `[${msg.ruleId ?? "eslint"}] ${msg.message}`;
      const tier = classifyBug({ source: "eslint", message: text, file: result.filePath });
      bugs.push(makeBugItem("eslint", text, result.filePath, msg.line, msg.column, tier));
    }
  }
  return bugs;
}

// ─── 解析测试输出 → BugItem[] ─────────────────────────────────────────────────

export function parseTestOutput(output: string): BugItem[] {
  const bugs: BugItem[] = [];
  // Vitest/Jest 格式：✗ test name \n   AssertionError...
  const failRe = /✗\s+(.+?)\n[\s\S]*?AssertionError[^\n]*/g;
  let match: RegExpExecArray | null;

  while ((match = failRe.exec(output)) !== null) {
    const [fullMatch, testName] = match;
    const tier = classifyBug({ source: "test", message: fullMatch });
    bugs.push(makeBugItem("test", `FAIL: ${testName}`, undefined, undefined, undefined, tier));
  }

  // 补充：简单检测 "FAIL src/..." 格式
  const simpleRe = /^FAIL\s+(.+)$/gm;
  while ((match = simpleRe.exec(output)) !== null) {
    const tier = classifyBug({ source: "test", message: match[0] });
    bugs.push(makeBugItem("test", match[0].trim(), match[1].trim(), undefined, undefined, tier));
  }

  return dedup(bugs);
}

// ─── 工具函数 ─────────────────────────────────────────────────────────────────

function makeBugItem(
  source: BugSource,
  message: string,
  file?: string | undefined,
  line?: number | undefined,
  column?: number | undefined,
  tier: BugTier = 2
): BugItem {
  const id = createHash("sha1")
    .update(`${source}:${file ?? ""}:${line ?? 0}:${message}`)
    .digest("hex")
    .slice(0, 8);

  return {
    id,
    tier,
    source,
    message,
    file,
    line,
    column,
    retryCount: 0,
    status: tier === 3 ? "needs_human" : "pending",
  };
}

function dedup(bugs: BugItem[]): BugItem[] {
  const seen = new Set<string>();
  return bugs.filter((b) => {
    if (seen.has(b.id)) return false;
    seen.add(b.id);
    return true;
  });
}

/**
 * 打印分级摘要
 */
export function printClassification(bugs: BugItem[]): void {
  const t1 = bugs.filter((b) => b.tier === 1);
  const t2 = bugs.filter((b) => b.tier === 2);
  const t3 = bugs.filter((b) => b.tier === 3);

  console.log("\n── Bug 分级摘要 ──────────────────────────────────────");
  console.log(`  TIER 1 (直接修)  : ${t1.length} 个`);
  console.log(`  TIER 2 (需调查)  : ${t2.length} 个`);
  console.log(`  TIER 3 (需人工)  : ${t3.length} 个`);
  console.log("──────────────────────────────────────────────────────\n");

  for (const b of [...t1, ...t2]) {
    const icon = b.tier === 1 ? "✓" : "⚠";
    console.log(`  [T${b.tier}] ${icon} [${b.source}] ${b.file ?? ""}:${b.line ?? "-"} → ${b.message.slice(0, 80)}`);
  }
  for (const b of t3) {
    console.log(`  [T3] ✗ [${b.source}] ${b.file ?? ""} → SKIP: ${b.message.slice(0, 60)}`);
  }
  console.log("");
}
