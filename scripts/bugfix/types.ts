/**
 * Bug Fix 规则体系 — 类型定义
 * 与设计文档对齐：TIER 1/2/3 分级 + V1/V2/V3 验证层
 */

// ─── Bug 分级 ────────────────────────────────────────────────────────────────

export type BugTier = 1 | 2 | 3;

export interface BugItem {
  id: string;                    // 唯一标识，一般用 hash(source+message)
  tier: BugTier;
  source: BugSource;
  message: string;               // 原始错误信息
  file?: string;                 // 出错文件路径
  line?: number;
  column?: number;
  cacheKey?: string;             // 命中 error-cache 时的 key
  retryCount: number;            // 连续失败次数，>= 3 → 强制人工
  status: BugStatus;
}

export type BugSource =
  | "tsc"          // TypeScript 编译器
  | "eslint"       // ESLint error 级
  | "build"        // bun run build
  | "test"         // 测试失败
  | "runtime"      // 运行时错误（日志/sentry）
  | "manual";      // 手动标记

export type BugStatus =
  | "pending"       // 待处理
  | "fixing"        // 正在修
  | "verified"      // V1+V2+V3 全通过
  | "needs_human"   // TIER 3 / 三击失败 / 超行数限制
  | "skipped";      // 主动跳过

// ─── 修复结果 ─────────────────────────────────────────────────────────────────

export interface FixResult {
  bugId: string;
  success: boolean;
  stage: "V1" | "V2" | "V3" | "none";  // 在哪一层失败的
  diffLines?: number;                    // 修复 diff 行数
  errorOutput?: string;                  // 失败时的原始输出
  snapshotHash?: string;                 // 修复前 git commit hash
}

// ─── 验证层结果 ───────────────────────────────────────────────────────────────

export interface VerifyLayerResult {
  layer: "V1" | "V2" | "V3";
  passed: boolean;
  output: string;
  durationMs: number;
}

// ─── Error Cache 格式 ─────────────────────────────────────────────────────────

export interface ErrorCacheEntry {
  fix: string;              // 一句话修复方案
  first_seen: string;       // ISO date
  last_seen: string;        // ISO date
  count: number;
  projects: string[];
}

export type ErrorCache = Record<string, ErrorCacheEntry>;

// ─── 循环状态 ─────────────────────────────────────────────────────────────────

export interface LoopState {
  round: number;
  startedAt: string;        // ISO datetime
  bugs: BugItem[];
  fixed: string[];          // bugId list
  skipped: string[];        // bugId list (TIER 3 / needs_human)
  results: FixResult[];
}

// ─── 配置 ─────────────────────────────────────────────────────────────────────

export interface BugFixConfig {
  projectRoot: string;
  maxDiffLines: number;      // 默认 50，超出 → needs_human
  maxRetries: number;        // 默认 3，三击规则
  tier2MaxFiles: number;     // TIER 2 最多影响几个文件，默认 3
  commands: {
    typecheck: string;       // 默认 "bun run tsc --noEmit"
    lint: string;            // 默认 "bun run eslint . --max-warnings 0"
    build: string;           // 默认 "bun run build"
    test: string;            // 默认 "bun run test"
  };
}
