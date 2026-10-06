#!/usr/bin/env bun
/**
 * Bug Fix 主循环
 *
 * 入口：
 *   bun run bugfix              — 交互模式
 *   bun run bugfix --auto      — 自动模式（无 stdin 等待）
 *   bun run bugfix --scan      — 仅扫描
 *   bun run bugfix --dev --auto — 静态+运行时全扫描
 *
 * 流程：扫描 → 分级 → 缓存查 → 快照 → 修复 → 三层验证 → 提交/回滚
 */

import { resolve } from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { writeFileSync, mkdirSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";

import { parseTscOutput, parseEslintOutput, parseTestOutput, printClassification } from "./classify.ts";
import { loadCache, lookupCache, recordFailure, recordSuccess, printCache } from "./cache.ts";

// ─── 类型（内联避免循环依赖）───────────────────────────────────────────────────

interface BugItem {
  id: string;
  tier: 1 | 2 | 3;
  source: string;
  message: string;
  file?: string;
  line?: number;
  retryCount: number;
  status: "pending" | "needs_human" | "skipped" | "verified" | "fixing";
}

interface LoopState {
  round: number;
  startedAt: string;
  bugs: BugItem[];
  fixed: string[];
  skipped: string[];
  results: FixResult[];
}

interface FixResult {
  bugId: string;
  success: boolean;
  stage: string;
  diffLines?: number;
  errorOutput?: string;
  snapshotHash?: string;
}

interface BugFixConfig {
  projectRoot: string;
  maxDiffLines: number;
  maxRetries: number;
  commands: {
    typecheck: string;
    lint: string;
    build: string;
    test: string;
  };
}

// ─── Dev 环境管理 ─────────────────────────────────────────────────────────────

let devChild: ReturnType<typeof spawn> | null = null;
let redisStop: (() => Promise<void>) | null = null;

async function startDevEnvironment(projectRoot: string): Promise<boolean> {
  console.log("[dev] 启动 Redis Memory Server...");
  const { RedisMemoryServer } = await import("redis-memory-server");
  const redis = new RedisMemoryServer({ instance: { port: 6379 } });
  try {
    await redis.start();
    console.log("[dev] Redis ✓");
  } catch {
    console.warn("[dev] Redis 启动失败，假设已存在");
  }
  redisStop = () => redis.stop().catch(() => {});

  const { readFileSync, existsSync: exists } = await import("node:fs");
  const { resolve: res2 } = await import("node:path");
  const envPath = res2(projectRoot, "backend/.env");
  const envVars: Record<string, string> = {};
  if (exists(envPath)) {
    const content = readFileSync(envPath, "utf-8");
    for (const line of content.split("\n")) {
      const m = line.match(/^([^=]+)=(.*)$/);
      if (m) envVars[m[1].trim()] = m[2].trim();
    }
  }

  const apiEnv = {
    ...process.env,
    ...envVars,
    PORT: envVars.PORT ?? "3001",
    REDIS_URL: envVars.REDIS_URL ?? "redis://127.0.0.1:6379",
    NODE_ENV: "development",
  };

  console.log("[dev] 启动 API on http://127.0.0.1:3001...");
  devChild = spawn("bun", ["run", "dev"], {
    cwd: res2(projectRoot, "apps/api"),
    env: apiEnv,
    stdio: ["ignore", "pipe", "pipe"],
  });

  devChild.stderr?.on("data", (d: Buffer) => {
    const line = d.toString().trim();
    if (line && !line.includes("ioredis")) process.stderr.write(`[api] ${line}\n`);
  });
  devChild.stdout?.on("data", (d: Buffer) => {
    const line = d.toString().trim();
    if (line) process.stdout.write(`[api] ${line}\n`);
  });

  console.log("[dev] 等待 API 就绪...");
  for (let i = 0; i < 30; i++) {
    await new Promise((r) => setTimeout(r, 2000));
    try {
      const r = await fetch("http://127.0.0.1:3001/health");
      if (r.ok) { console.log("[dev] API 健康 ✓"); return true; }
    } catch { }
    process.stdout.write(".");
  }
  console.log("\n[dev] API 启动超时");
  return false;
}

async function stopDevEnvironment(): Promise<void> {
  if (devChild && !devChild.killed) {
    devChild.kill("SIGINT");
    devChild = null;
  }
  await new Promise((r) => setTimeout(r, 1500));
  if (redisStop) { await redisStop(); redisStop = null; }
  console.log("[dev] 环境已关闭");
}

// ─── TIER 分类 ────────────────────────────────────────────────────────────────

function classifyBug(source: string, message: string, file?: string): 1 | 2 | 3 {
  if (/TS\d{4}|Cannot find module|Type '.*' is not assignable|Property '.*' does not exist/i.test(message)) return 1;
  if (/adapative|recieve|seperator|occured/i.test(message)) return 1;
  if (/security|xss|sql injection|race condition|schema migration/i.test(message)) return 3;
  if (/migration|schema\.ts$|\.env|secrets/i.test(file ?? "")) return 3;
  return 2;
}

function makeBugId(source: string, message: string, file?: string, line?: number): string {
  return createHash("sha1").update(`${source}:${file ?? ""}:${line ?? 0}:${message}`).digest("hex").slice(0, 8);
}

// ─── 扫描 ────────────────────────────────────────────────────────────────────

async function scanBugs(config: BugFixConfig): Promise<BugItem[]> {
  console.log("\n[loop] 扫描中...\n");
  const bugs: BugItem[] = [];

  const tscResult = runSilent(config.commands.typecheck, config.projectRoot);
  if (!tscResult.success) {
    const parsed = parseTscOutput(tscResult.output);
    bugs.push(...parsed);
    console.log(`  tsc: ${parsed.length} 个错误`);
  } else {
    console.log("  tsc: ✓");
  }

  const lintResult = runSilent(config.commands.lint, config.projectRoot);
  if (!lintResult.success) {
    const jsonStart = lintResult.output.indexOf("[");
    if (jsonStart >= 0) {
      const parsed = parseEslintOutput(lintResult.output.slice(jsonStart));
      bugs.push(...parsed);
      console.log(`  eslint: ${parsed.length} 个 error`);
    }
  } else {
    console.log("  eslint: ✓");
  }

  const testResult = runSilent(config.commands.test, config.projectRoot);
  if (!testResult.success) {
    const parsed = parseTestOutput(testResult.output);
    bugs.push(...parsed);
    console.log(`  test: ${parsed.length} 个失败`);
  } else {
    console.log("  test: ✓");
  }

  writeScanReports(bugs, config.projectRoot);
  return bugs;
}

function parseSmokeTestOutput(output: string): BugItem[] {
  const bugs: BugItem[] = [];
  const failRe = /❌ Smoke test failed: (.+)/g;
  let match: RegExpExecArray | null;
  while ((match = failRe.exec(output)) !== null) {
    const msg = match[1].trim();
    const tier = classifyBug("smoke-test", msg);
    bugs.push({
      id: makeBugId("smoke-test", msg),
      tier,
      source: "smoke-test",
      message: `[smoke-test] ${msg}`,
      retryCount: 0,
      status: tier === 3 ? "needs_human" : "pending",
    });
  }
  return bugs;
}

function writeScanReports(bugs: BugItem[], projectRoot: string): void {
  const reportsDir = resolve(projectRoot, "reports");
  if (!existsSync(reportsDir)) mkdirSync(reportsDir, { recursive: true });
  const json = {
    generatedAt: new Date().toISOString(),
    total: bugs.length,
    byTier: {
      TIER_1: bugs.filter((b) => b.tier === 1).length,
      TIER_2: bugs.filter((b) => b.tier === 2).length,
      TIER_3: bugs.filter((b) => b.tier === 3).length,
    },
    bugs: bugs.map((b) => ({ id: b.id, tier: b.tier, source: b.source, file: b.file, line: b.line, message: b.message, status: b.status })),
  };
  writeFileSync(resolve(reportsDir, "eva-bugfix-scan.json"), JSON.stringify(json, null, 2));
  const mdLines = [
    "# Bugfix Scan Report",
    `Generated: ${json.generatedAt}`,
    "",
    `**Total**: ${bugs.length} bugs  | T1: ${json.byTier.TIER_1}  T2: ${json.byTier.TIER_2}  T3: ${json.byTier.TIER_3}`,
    "",
    ...bugs.map((b) => `### [T${b.tier}] ${b.source} — ${b.file ?? "?"}:${b.line ?? "?"}\n\n${b.message}\n`),
  ];
  writeFileSync(resolve(reportsDir, "eva-bugfix-scan.md"), mdLines.join("\n"));
  console.log(`[scan] 报告已写入 reports/ (${bugs.length} 个 bug)`);
}

// ─── 主循环 ──────────────────────────────────────────────────────────────────

export async function runLoop(
  config?: BugFixConfig,
  opts: { autoMode?: boolean; devMode?: boolean } = {}
): Promise<LoopState> {
  const { autoMode = false, devMode = false } = opts;
  const cfg = config ?? makeDefaultConfig();
  const state: LoopState = { round: 1, startedAt: new Date().toISOString(), bugs: [], fixed: [], skipped: [], results: [] };
  const modeTag = autoMode ? (devMode ? "AUTO+DEV" : "AUTO") : "交互";
  console.log("╔══════════════════════════════════════════════╗");
  console.log("║         EVA Bug Fix Loop — 启动          ║");
  console.log(`║  projectRoot: ${cfg.projectRoot.slice(-28).padStart(28)}  ║`);
  console.log(`║  模式: ${modeTag.padEnd(22)}  ║`);
  console.log("╚══════════════════════════════════════════════╝\n");

  // 阶段1: 静态扫描
  console.log("[scan] === 静态扫描 ===");
  const staticBugs = await scanBugs(cfg);

  // 阶段2: 运行时扫描（仅 --dev 模式）
  let runtimeBugs: BugItem[] = [];
  if (devMode) {
    console.log("\n[scan] === 运行时扫描 ===");
    const ready = await startDevEnvironment(cfg.projectRoot);
    if (ready) {
      const smokeResult = spawnSync("bun", ["run", "scripts/smoke-test.ts"], {
        cwd: cfg.projectRoot,
        encoding: "utf-8",
        timeout: 180_000,
      });
      const smokeOutput = [smokeResult.stdout ?? "", smokeResult.stderr ?? ""].join("\n");
      if (smokeResult.status !== 0) {
        runtimeBugs = parseSmokeTestOutput(smokeOutput);
        console.log(`  smoke-test: ${runtimeBugs.length} 个运行时 bug`);
      } else {
        console.log("  smoke-test: ✓");
      }
    }
    await stopDevEnvironment();
  }

  const bugs = [...staticBugs, ...runtimeBugs];
  state.bugs = bugs;
  printClassification(bugs);

  if (bugs.length === 0) {
    console.log("[loop] 🎉 无 bug，全部通过！");
    return state;
  }

  const queue = [...bugs].sort((a, b) => a.tier - b.tier);
  for (const bug of queue) {
    if (bug.status === "needs_human" || bug.status === "skipped") { state.skipped.push(bug.id); continue; }
    const result = await processBug(bug, cfg, autoMode);
    state.results.push(result);
    if (result.success) { state.fixed.push(bug.id); }
    else if (bug.status === "needs_human" || bug.status === "skipped") { state.skipped.push(bug.id); }
    state.round++;
  }

  printSummary(state);
  return state;
}

// ─── 单个 Bug 修复 ─────────────────────────────────────────────────────────────

async function processBug(bug: BugItem, config: BugFixConfig, autoMode: boolean): Promise<FixResult> {
  if (bug.retryCount >= config.maxRetries) {
    bug.status = "needs_human";
    return { bugId: bug.id, success: false, stage: "none", errorOutput: "三击规则触发" };
  }

  const cache = loadCache();
  const hit = lookupCache(bug.message, cache);
  if (hit) {
    console.log(`\n[loop] ⚡ 命中缓存 "${hit.key}" → ${hit.entry.fix}`);
  }

  console.log("\n─────────────────────────────────────────────────────");
  console.log(`[bug #${bug.id}] T${bug.tier} | ${bug.source} | ${bug.file ?? "?"}:${bug.line ?? "-"}`);
  console.log(`  ${bug.message.slice(0, 100)}`);
  console.log(`  → 模式: ${autoMode ? "AUTO" : "交互"}`);

  if (autoMode) {
    console.log("  → TIER 2 需人工调查，AUTO 模式暂跳过");
    bug.status = "needs_human";
    return { bugId: bug.id, success: false, stage: "none", errorOutput: "TIER 2 in auto mode skipped" };
  }

  await waitForUser();
  const snapshotHash = takeSnapshot(config.projectRoot);
  console.log(`\n[loop] 验证 Bug #${bug.id} (快照: ${snapshotHash})`);
  const verification = await runFullVerification(config, snapshotHash);

  if (!verification.passed) {
    const failedLayer = verification.failedLayer!;
    const failOutput = verification.layers.find((l) => l.layer === failedLayer)?.output ?? "";
    console.log(`\n[loop] ✗ ${failedLayer} 验证失败`);
    console.log(failOutput.slice(0, 300));
    const cacheKey = deriveErrorKey(bug.message);
    recordFailure(cacheKey, bug.message.slice(0, 80), config.projectRoot);
    bug.retryCount++;
    if (bug.retryCount >= config.maxRetries) { bug.status = "needs_human"; console.log("[loop] 三击规则 → needs_human"); }
    rollbackToSnapshot(snapshotHash, config.projectRoot);
    return { bugId: bug.id, success: false, stage: failedLayer, snapshotHash, errorOutput: failOutput };
  }

  const commitMsg = `fix(${bug.source}): ${bug.message.slice(0, 60).replace(/\n/g, " ")}`;
  const { success: committed, hash: fixHash } = createFixCommit(commitMsg, config.projectRoot);
  if (committed) {
    recordSuccess(deriveErrorKey(bug.message), config.projectRoot);
    bug.status = "verified";
    console.log(`\n[loop] ✓ Bug #${bug.id} 修复并提交 (${fixHash})`);
  }
  return { bugId: bug.id, success: true, stage: "V3", snapshotHash, diffLines: verification.diffLines };
}

// ─── 三层验证 ────────────────────────────────────────────────────────────────

async function runFullVerification(config: BugFixConfig, snapshotHash: string): Promise<{ passed: boolean; failedLayer?: string; layers: Array<{ layer: string; passed: boolean; output: string; durationMs: number }>; diffLines: number }> {
  const start = Date.now();
  console.log("[V1] 编译层验证...");
  const v1steps = [
    { name: "tsc", cmd: config.commands.typecheck },
    { name: "eslint", cmd: config.commands.lint },
    { name: "build", cmd: config.commands.build },
  ];
  for (const step of v1steps) {
    const { success, output } = runSilent(step.cmd, config.projectRoot);
    if (!success) {
      console.log(`  [V1/${step.name}] ✗`);
      return { passed: false, failedLayer: "V1", layers: [{ layer: "V1", passed: false, output, durationMs: Date.now() - start }], diffLines: 0 };
    }
    console.log(`  [V1/${step.name}] ✓`);
  }

  console.log("[V2] 测试层验证...");
  const hasTests = runSilent("find . -name '*.test.ts' -maxdepth 6", config.projectRoot).success;
  if (hasTests) {
    const { success, output } = runSilent(config.commands.test, config.projectRoot);
    console.log(`  [V2/test] ${success ? "✓" : "✗"}`);
    if (!success) return { passed: false, failedLayer: "V2", layers: [{ layer: "V2", passed: false, output, durationMs: Date.now() - start }], diffLines: 0 };
  } else {
    console.log("  [V2] 跳过：无测试文件");
  }

  console.log("[V3] 变更范围验证...");
  const diffResult = runSilent(`git diff --stat ${snapshotHash} HEAD`, config.projectRoot);
  const diffLines = parseDiffLines(diffResult.output);
  const changedFiles = parseDiffFiles(diffResult.output);
  const dangerFiles = changedFiles.filter((f) => /migration|schema\.ts$|\.env|secrets/i.test(f));
  const v3passed = diffLines <= config.maxDiffLines && dangerFiles.length === 0;
  console.log(`  [V3] ${v3passed ? "✓" : "✗"} diff=${diffLines}行, 文件=${changedFiles.length}个`);
  if (dangerFiles.length > 0) console.log(`  [V3] ✗ 高危文件: ${dangerFiles.join(", ")}`);
  if (!v3passed) return { passed: false, failedLayer: "V3", layers: [{ layer: "V3", passed: false, output: `diff=${diffLines}行`, durationMs: Date.now() - start }], diffLines };

  return { passed: true, layers: [{ layer: "V1", passed: true, output: "all pass", durationMs: 0 }], diffLines };
}

// ─── 快照 ────────────────────────────────────────────────────────────────────

let stashMarker = "";

export function takeSnapshot(projectRoot: string): string {
  const hash = currentHash(projectRoot);
  const dirty = isWorkingTreeDirty(projectRoot);
  if (dirty) {
    stashMarker = `bugfix-${Date.now()}`;
    const r = run("git stash push -m \"" + stashMarker + "\"", projectRoot);
    if (!r.success) console.warn("[snapshot] stash 失败");
  }
  console.log(`[snapshot] ✓ hash=${hash} dirty=${dirty}`);
  return hash;
}

export function rollbackToSnapshot(snapshotHash: string, projectRoot: string): boolean {
  console.log(`[snapshot] 回滚到 ${snapshotHash}...`);
  const r = run("git reset --hard " + snapshotHash, projectRoot);
  if (!r.success) { console.error(`[snapshot] ✗ 回滚失败`); return false; }
  if (stashMarker) {
    const list = run("git stash list", projectRoot);
    if (list.output.includes(stashMarker)) run("git stash pop", projectRoot);
    stashMarker = "";
  }
  console.log("[snapshot] ✓ 回滚成功");
  return true;
}

export function createFixCommit(message: string, projectRoot: string): { success: boolean; hash: string } {
  run("git add -A", projectRoot);
  const r = run("git commit -m \"" + message.replace(/"/g, "'") + "\"", projectRoot);
  return { success: r.success, hash: currentHash(projectRoot) };
}

function currentHash(projectRoot: string): string {
  return run("git rev-parse HEAD", projectRoot).output.trim() || "unknown";
}

function isWorkingTreeDirty(projectRoot: string): boolean {
  return run("git status --porcelain", projectRoot).output.trim().length > 0;
}

// ─── 工具函数 ────────────────────────────────────────────────────────────────

function makeDefaultConfig(projectRoot?: string): BugFixConfig {
  const root = projectRoot ?? resolve(import.meta.dirname ?? ".", "../..");
  return {
    projectRoot: root,
    maxDiffLines: 50,
    maxRetries: 3,
    commands: {
      typecheck: "bun x tsc -p packages/core/tsconfig.json --noEmit && bun x tsc -p apps/api/tsconfig.json --noEmit && bun x tsc -p apps/web/tsconfig.json --noEmit",
      lint: "bunx eslint apps/api/src apps/web/src packages/core/src --format json --max-warnings 0",
      build: "bun run build",
      test: "bun run scripts/smoke-test.ts --ci",
    },
  };
}

function runSilent(cmd: string, cwd: string): { success: boolean; output: string } {
  const [bin, ...args] = cmd.split(" ");
  const r = spawnSync(bin, args, { cwd, encoding: "utf-8", timeout: 120_000, shell: true });
  return { success: r.status === 0, output: [r.stdout ?? "", r.stderr ?? ""].join("\n").trim() };
}

function run(cmd: string, cwd: string): { success: boolean; output: string } {
  const [bin, ...args] = cmd.split(" ");
  const r = spawnSync(bin, args, { cwd, encoding: "utf-8", timeout: 30_000, shell: true });
  return { success: r.status === 0, output: [r.stdout ?? "", r.stderr ?? ""].join("\n").trim() };
}

function deriveErrorKey(message: string): string {
  return message.replace(/\(.*?\)/g, "").replace(/at .+$/gm, "").trim().slice(0, 40).toLowerCase().replace(/[^a-z0-9\u4e00-\u9fa5]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
}

function parseDiffLines(s: string): number {
  const m = s.match(/(\d+) insertions?\(\+\).*?(\d+) deletions?\(-\)/);
  if (m) return Number(m[1]) + Number(m[2]);
  return 0;
}

function parseDiffFiles(s: string): string[] {
  return s.split("\n").filter((l) => /\|\s+\d+/.test(l)).map((l) => l.trim().split("|")[0].trim()).filter(Boolean);
}

async function waitForUser(): Promise<void> {
  process.stdout.write("\n  [按 Enter 确认已修复] > ");
  return new Promise((resolve) => {
    process.stdin.once("data", (chunk: Buffer) => { process.stdin.pause(); resolve(); });
    process.stdin.resume();
  });
}

function printSummary(state: LoopState): void {
  const needsHuman = state.bugs.filter((b) => b.status === "needs_human");
  console.log("\n╔══════════════════════════════════════════════╗");
  console.log("║                  本轮摘要                   ║");
  console.log(`║  已修复: ${String(state.fixed.length).padEnd(3)} 个                               ║`);
  console.log(`║  跳过:   ${String(state.skipped.length).padEnd(3)} 个                               ║`);
  console.log(`║  需人工: ${String(needsHuman.length).padEnd(3)} 个                               ║`);
  console.log("╚══════════════════════════════════════════════╝");
  if (needsHuman.length > 0) {
    console.log("\n  需要人工处理的 Bug:");
    for (const b of needsHuman) console.log(`    [T${b.tier}] #${b.id} ${b.file ?? ""}:${b.line ?? "-"} → ${b.message.slice(0, 60)}`);
  }
}

// ─── CLI 入口 ────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
if (args.includes("--scan")) {
  const cfg = makeDefaultConfig();
  const bugs = await scanBugs(cfg);
  printClassification(bugs);
} else if (args.includes("--cache")) {
  printCache();
} else {
  const autoMode = args.includes("--auto");
  const devMode = args.includes("--dev");
  await runLoop(undefined, { autoMode, devMode });
}
