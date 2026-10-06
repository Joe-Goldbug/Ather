/**
 * 修复验证器 — V1 / V2 / V3 三层验证
 *
 * V1: 编译层 (tsc + eslint + build)      — 必须全过
 * V2: 测试层 (bun run test)              — 有测试时必须全过
 * V3: 变更范围 (diff 行数 + 文件范围)    — 防止引入新 bug
 */

import { execSync, spawnSync } from "node:child_process";
import type { BugFixConfig, VerifyLayerResult } from "./types.ts";

// ─── 公共执行工具 ─────────────────────────────────────────────────────────────

function runCmd(
  command: string,
  cwd: string,
  timeoutMs = 120_000
): { success: boolean; output: string; durationMs: number } {
  const start = Date.now();
  const [bin, ...args] = command.split(" ");
  const result = spawnSync(bin, args, {
    cwd,
    encoding: "utf-8",
    timeout: timeoutMs,
    shell: true,
  });
  const durationMs = Date.now() - start;
  const output = [result.stdout ?? "", result.stderr ?? ""].join("\n").trim();
  const success = result.status === 0 && !result.error;
  return { success, output, durationMs };
}

// ─── V1: 编译层验证 ───────────────────────────────────────────────────────────

export async function verifyV1(config: BugFixConfig): Promise<VerifyLayerResult> {
  console.log("[V1] 编译层验证 (tsc + eslint + build)...");

  const steps = [
    { name: "tsc", cmd: config.commands.typecheck },
    { name: "eslint", cmd: config.commands.lint },
    { name: "build", cmd: config.commands.build },
  ];

  const outputs: string[] = [];
  const start = Date.now();

  for (const step of steps) {
    const { success, output } = runCmd(step.cmd, config.projectRoot);
    outputs.push(`[${step.name}] ${success ? "✓" : "✗"}\n${output}`);
    if (!success) {
      return {
        layer: "V1",
        passed: false,
        output: outputs.join("\n\n"),
        durationMs: Date.now() - start,
      };
    }
    console.log(`  [V1/${step.name}] ✓`);
  }

  return {
    layer: "V1",
    passed: true,
    output: outputs.join("\n\n"),
    durationMs: Date.now() - start,
  };
}

// ─── V2: 测试层验证 ───────────────────────────────────────────────────────────

export async function verifyV2(config: BugFixConfig): Promise<VerifyLayerResult> {
  console.log("[V2] 测试层验证...");
  const start = Date.now();

  // 先检测是否有测试文件，没有就跳过
  const hasTests = checkHasTests(config.projectRoot);
  if (!hasTests) {
    console.log("  [V2] 跳过：未检测到测试文件");
    return {
      layer: "V2",
      passed: true,
      output: "SKIP: no test files detected",
      durationMs: Date.now() - start,
    };
  }

  const { success, output } = runCmd(config.commands.test, config.projectRoot, 180_000);
  console.log(`  [V2/test] ${success ? "✓" : "✗"}`);
  return {
    layer: "V2",
    passed: success,
    output,
    durationMs: Date.now() - start,
  };
}

// ─── V3: 变更范围验证 ─────────────────────────────────────────────────────────

export async function verifyV3(
  config: BugFixConfig,
  snapshotHash: string
): Promise<VerifyLayerResult & { diffLines: number; changedFiles: string[] }> {
  console.log("[V3] 变更范围验证 (diff 行数 + 文件边界)...");
  const start = Date.now();

  // 获取 diff 统计
  const diffStat = runCmd(
    `git diff --stat ${snapshotHash} HEAD`,
    config.projectRoot
  );
  const diffLines = parseDiffLines(diffStat.output);
  const changedFiles = parseDiffFiles(diffStat.output);

  const violations: string[] = [];

  if (diffLines > config.maxDiffLines) {
    violations.push(`diff 行数 ${diffLines} 超过限制 ${config.maxDiffLines}`);
  }

  // 检查是否触碰了 TIER 3 文件（schema/migration/env）
  const tier3FilePatterns = [
    /migration/,
    /schema\.ts$/,
    /schema\.sql$/,
    /\.env/,
    /secrets/,
  ];
  const dangerFiles = changedFiles.filter((f) =>
    tier3FilePatterns.some((p) => p.test(f))
  );
  if (dangerFiles.length > 0) {
    violations.push(`触碰了高危文件: ${dangerFiles.join(", ")}`);
  }

  const passed = violations.length === 0;
  console.log(`  [V3] ${passed ? "✓" : "✗"} diff=${diffLines}行, 文件=${changedFiles.length}个`);
  if (!passed) violations.forEach((v) => console.log(`  [V3] ✗ ${v}`));

  return {
    layer: "V3",
    passed,
    output: violations.join("\n") || `diff: ${diffLines} lines, ${changedFiles.length} files`,
    durationMs: Date.now() - start,
    diffLines,
    changedFiles,
  };
}

// ─── 综合验证入口 ─────────────────────────────────────────────────────────────

export async function runFullVerification(
  config: BugFixConfig,
  snapshotHash: string
): Promise<{
  passed: boolean;
  failedLayer?: "V1" | "V2" | "V3";
  layers: VerifyLayerResult[];
  diffLines: number;
}> {
  const layers: VerifyLayerResult[] = [];

  const v1 = await verifyV1(config);
  layers.push(v1);
  if (!v1.passed) return { passed: false, failedLayer: "V1", layers, diffLines: 0 };

  const v2 = await verifyV2(config);
  layers.push(v2);
  if (!v2.passed) return { passed: false, failedLayer: "V2", layers, diffLines: 0 };

  const v3 = await verifyV3(config, snapshotHash);
  layers.push(v3);
  if (!v3.passed) return { passed: false, failedLayer: "V3", layers, diffLines: v3.diffLines };

  return { passed: true, layers, diffLines: v3.diffLines };
}

// ─── 工具函数 ─────────────────────────────────────────────────────────────────

function checkHasTests(projectRoot: string): boolean {
  try {
    const result = spawnSync(
      "find",
      [".", "-name", "*.test.ts", "-o", "-name", "*.spec.ts", "-maxdepth", "6"],
      { cwd: projectRoot, encoding: "utf-8", timeout: 5_000 }
    );
    return (result.stdout ?? "").trim().length > 0;
  } catch {
    return false;
  }
}

function parseDiffLines(statOutput: string): number {
  // git diff --stat 末行：N files changed, X insertions(+), Y deletions(-)
  const match = statOutput.match(/(\d+) insertions?\(\+\).*?(\d+) deletions?\(-\)/);
  if (match) return Number(match[1]) + Number(match[2]);
  // 降级：统计 + 和 - 的行数
  const lines = statOutput.split("\n").filter((l) => /\|\s+\d+/.test(l));
  return lines.reduce((sum, l) => {
    const m = l.match(/\|\s+(\d+)/);
    return sum + (m ? Number(m[1]) : 0);
  }, 0);
}

function parseDiffFiles(statOutput: string): string[] {
  return statOutput
    .split("\n")
    .filter((l) => /\|\s+\d+/.test(l))
    .map((l) => l.trim().split("|")[0].trim())
    .filter(Boolean);
}
