#!/usr/bin/env ts-node
/**
 * =============================================================================
 * Neon 数据库验证脚本
 * =============================================================================
 *
 * 功能:
 *   - 测试数据库连接
 *   - 验证所有必需表是否存在
 *   - 检查索引是否正确创建
 *   - 验证数据库权限
 *   - 输出详细验证报告
 *
 * 用法:
 *   npx ts-node scripts/verify-neon-db.ts [--verbose] [--json] [--help]
 *
 * 退出代码:
 *   0 - 所有验证通过
 *   1 - 环境变量问题
 *   2 - 连接失败
 *   3 - 表结构验证失败
 *   4 - 索引验证失败
 *   5 - 权限验证失败
 *
 * 作者: DevOps Agent
 * 日期: 2026-04-03
 * =============================================================================
 */

import { Pool, PoolConfig, QueryResult } from "pg";
import * as fs from "fs";
import * as path from "path";

// =============================================================================
// 类型定义
// =============================================================================
interface VerificationResult {
  name: string;
  status: "PASS" | "FAIL" | "WARN";
  message: string;
  details?: any;
  duration?: number;
}

interface VerificationReport {
  timestamp: string;
  database: {
    host: string;
    database: string;
    version: string;
  };
  summary: {
    total: number;
    passed: number;
    failed: number;
    warnings: number;
  };
  results: VerificationResult[];
}

interface TableDefinition {
  name: string;
  required: boolean;
  columns: string[];
}

interface IndexDefinition {
  name: string;
  table: string;
  required: boolean;
}

// =============================================================================
// 配置
// =============================================================================
const CONFIG = {
  // 必需的数据库表
  requiredTables: [
    {
      name: "users",
      required: true,
      columns: ["id", "email", "name", "avatar_url", "created_at", "updated_at"],
    },
    {
      name: "email_login_challenges",
      required: true,
      columns: ["id", "email", "code_hash", "expires_at", "attempts", "consumed", "created_at"],
    },
    {
      name: "auth_rate_limits",
      required: true,
      columns: ["id", "identifier", "action", "created_at"],
    },
    {
      name: "session_tokens",
      required: true,
      columns: ["id", "user_id", "token", "expires_at", "created_at", "revoked"],
    },
    {
      name: "sessions",
      required: false, // 可选表
      columns: ["id", "user_id", "status", "created_at", "updated_at"],
    },
  ] as TableDefinition[],

  // 必需的索引
  requiredIndexes: [
    { name: "idx_users_email", table: "users", required: true },
    { name: "idx_login_challenges_email_expires", table: "email_login_challenges", required: true },
    { name: "idx_login_challenges_email_created", table: "email_login_challenges", required: true },
    { name: "idx_auth_rate_limits_lookup", table: "auth_rate_limits", required: true },
    { name: "idx_session_tokens_token", table: "session_tokens", required: true },
    { name: "idx_session_tokens_user_id", table: "session_tokens", required: true },
  ] as IndexDefinition[],

  // 连接池配置
  poolConfig: {
    max: 5,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
  },
};

// =============================================================================
// 全局状态
// =============================================================================
let pool: Pool | null = null;
let verbose = false;
let outputJson = false;
const results: VerificationResult[] = [];
let dbHost = "";
let dbName = "";

// =============================================================================
// 日志函数
// =============================================================================
function log(message: string, level: "info" | "success" | "warning" | "error" | "debug" = "info") {
  const timestamp = new Date().toISOString().split("T")[1].split(".")[0];
  const prefix = `[${timestamp}]`;

  const colors: Record<string, string> = {
    info: "\x1b[36m",    // Cyan
    success: "\x1b[32m", // Green
    warning: "\x1b[33m", // Yellow
    error: "\x1b[31m",   // Red
    debug: "\x1b[90m",   // Gray
    reset: "\x1b[0m",
  };

  if (level === "debug" && !verbose) return;

  const labels: Record<string, string> = {
    info: "INFO",
    success: "PASS",
    warning: "WARN",
    error: "FAIL",
    debug: "DEBUG",
  };

  if (outputJson) return; // JSON 模式下不输出到控制台

  const color = colors[level] || colors.info;
  console.log(`${prefix} ${color}[${labels[level]}]${colors.reset} ${message}`);
}

function logInfo(message: string) {
  log(message, "info");
}

function logSuccess(message: string) {
  log(message, "success");
}

function logWarning(message: string) {
  log(message, "warning");
}

function logError(message: string) {
  log(message, "error");
}

function logDebug(message: string) {
  log(message, "debug");
}

// =============================================================================
// 帮助信息
// =============================================================================
function showHelp() {
  console.log(`
Neon 数据库验证脚本

用法: npx ts-node scripts/verify-neon-db.ts [选项]

选项:
    --verbose       显示详细输出
    --json          输出 JSON 格式报告
    --help          显示此帮助信息

环境变量:
    DATABASE_URL    Neon PostgreSQL 连接字符串（必需）

示例:
    # 运行完整验证
    npx ts-node scripts/verify-neon-db.ts

    # 详细模式
    npx ts-node scripts/verify-neon-db.ts --verbose

    # 输出 JSON 报告
    npx ts-node scripts/verify-neon-db.ts --json > report.json

退出代码:
    0   所有验证通过
    1   环境变量问题
    2   连接失败
    3   表结构验证失败
    4   索引验证失败
    5   权限验证失败
`);
}

// =============================================================================
// 参数解析
// =============================================================================
function parseArgs(): number | null {
  const args = process.argv.slice(2);

  for (const arg of args) {
    switch (arg) {
      case "--verbose":
      case "-v":
        verbose = true;
        break;
      case "--json":
      case "-j":
        outputJson = true;
        break;
      case "--help":
      case "-h":
        showHelp();
        return 0;
      default:
        if (arg.startsWith("-")) {
          logError(`未知选项: ${arg}`);
          showHelp();
          return 1;
        }
    }
  }

  return null;
}

// =============================================================================
// 检查环境变量
// =============================================================================
async function checkEnvironment(): Promise<boolean> {
  const startTime = Date.now();
  const result: VerificationResult = {
    name: "环境变量检查",
    status: "PASS",
    message: "",
    duration: 0,
  };

  logInfo("检查环境变量...");

  if (!process.env.DATABASE_URL) {
    result.status = "FAIL";
    result.message = "DATABASE_URL 环境变量未设置";
    result.details = {
      hint: "设置方法: export DATABASE_URL=\"postgresql://user:pass@host/db?sslmode=require\"",
    };
    results.push(result);
    logError(result.message);
    return false;
  }

  // 解析 DATABASE_URL（仅用于报告，不暴露敏感信息）
  // SECURITY: 仅检测 URL 是否设置，不解析主机名等敏感信息
  if (process.env.DATABASE_URL) {
    // 仅检查 URL 存在性，不解析任何组件
    dbHost = "[REDACTED]";
    dbName = "[REDACTED]";
  }

  result.message = "DATABASE_URL 已设置";
  result.duration = Date.now() - startTime;
  results.push(result);
  logSuccess(result.message);
  // SECURITY: 不记录 DATABASE_URL 长度或任何元信息

  return true;
}

// =============================================================================
// 创建连接池
// =============================================================================
async function createPool(): Promise<boolean> {
  const startTime = Date.now();
  const result: VerificationResult = {
    name: "连接池创建",
    status: "PASS",
    message: "",
    duration: 0,
  };

  logInfo("创建数据库连接池...");

  try {
    const config: PoolConfig = {
      connectionString: process.env.DATABASE_URL,
      ssl: {
        rejectUnauthorized: false,
      },
      ...CONFIG.poolConfig,
    };

    pool = new Pool(config);

    // 添加错误处理
    pool.on("error", (err: Error) => {
      logError(`连接池错误: ${err.message}`);
    });

    result.message = "连接池创建成功";
    result.duration = Date.now() - startTime;
    results.push(result);
    logSuccess(result.message);
    return true;
  } catch (error) {
    result.status = "FAIL";
    result.message = `连接池创建失败: ${error instanceof Error ? error.message : String(error)}`;
    result.duration = Date.now() - startTime;
    results.push(result);
    logError(result.message);
    return false;
  }
}

// =============================================================================
// 测试数据库连接
// =============================================================================
async function testConnection(): Promise<boolean> {
  const startTime = Date.now();
  const result: VerificationResult = {
    name: "数据库连接测试",
    status: "PASS",
    message: "",
    duration: 0,
  };

  logInfo("测试数据库连接...");

  if (!pool) {
    result.status = "FAIL";
    result.message = "连接池未初始化";
    results.push(result);
    logError(result.message);
    return false;
  }

  try {
    const client = await pool.connect();
    try {
      // 测试查询
      const versionResult = await client.query("SELECT version()");
      const version = versionResult.rows[0].version;

      result.message = "数据库连接成功";
      result.details = { version: version.substring(0, 20) + "..." }; // 仅显示版本前缀
      result.duration = Date.now() - startTime;
      results.push(result);
      logSuccess(`${result.message} (${result.duration}ms)`);
      // SECURITY: 不记录完整的 PostgreSQL 版本信息
      return true;
    } finally {
      client.release();
    }
  } catch (error) {
    result.status = "FAIL";
    result.message = `连接失败: ${error instanceof Error ? error.message : String(error)}`;
    result.duration = Date.now() - startTime;
    results.push(result);
    logError(result.message);
    logInfo("排查建议: 1) 检查网络连接 2) 验证凭据 3) 确认 Neon 项目状态");
    return false;
  }
}

// =============================================================================
// 验证表结构
// =============================================================================
async function verifyTables(): Promise<boolean> {
  const startTime = Date.now();
  const result: VerificationResult = {
    name: "表结构验证",
    status: "PASS",
    message: "",
    duration: 0,
  };

  logInfo("验证数据库表...");

  if (!pool) {
    result.status = "FAIL";
    result.message = "连接池未初始化";
    results.push(result);
    return false;
  }

  const tableChecks: { name: string; exists: boolean; missingColumns?: string[] }[] = [];
  let passed = true;

  for (const table of CONFIG.requiredTables) {
    const tableStart = Date.now();

    try {
      // 检查表是否存在
      const existsResult = await pool.query(
        `
        SELECT EXISTS (
          SELECT FROM information_schema.tables
          WHERE table_schema = 'public'
          AND table_name = $1
        );
        `,
        [table.name]
      );

      const exists = existsResult.rows[0].exists;

      if (!exists) {
        tableChecks.push({ name: table.name, exists: false });
        if (table.required) {
          passed = false;
          logError(`表 ${table.name} 不存在 (必需)`);
        } else {
          logWarning(`表 ${table.name} 不存在 (可选)`);
        }
        continue;
      }

      // 检查列
      const columnsResult = await pool.query(
        `
        SELECT column_name
        FROM information_schema.columns
        WHERE table_schema = 'public'
        AND table_name = $1;
        `,
        [table.name]
      );

      const existingColumns = columnsResult.rows.map((r) => r.column_name);
      const missingColumns = table.columns.filter((c) => !existingColumns.includes(c));

      if (missingColumns.length > 0) {
        tableChecks.push({
          name: table.name,
          exists: true,
          missingColumns,
        });
        passed = false;
        logError(`表 ${table.name} 缺少列: ${missingColumns.join(", ")}`);
      } else {
        tableChecks.push({ name: table.name, exists: true });
        logSuccess(`表 ${table.name} 结构正常`);
      }

      logDebug(`表 ${table.name} 检查完成 (${Date.now() - tableStart}ms)`);
    } catch (error) {
      tableChecks.push({ name: table.name, exists: false });
      passed = false;
      logError(`检查表 ${table.name} 失败: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  result.status = passed ? "PASS" : "FAIL";
  result.message = passed
    ? `所有必需表结构正常 (${tableChecks.filter((t) => t.exists).length}/${tableChecks.length})`
    : "部分表结构验证失败";
  result.details = tableChecks;
  result.duration = Date.now() - startTime;
  results.push(result);

  if (!passed) {
    logInfo("建议执行初始化脚本: psql \"$DATABASE_URL\" -f backend/db/neon_setup.sql");
  }

  return passed;
}

// =============================================================================
// 验证索引
// =============================================================================
async function verifyIndexes(): Promise<boolean> {
  const startTime = Date.now();
  const result: VerificationResult = {
    name: "索引验证",
    status: "PASS",
    message: "",
    duration: 0,
  };

  logInfo("验证数据库索引...");

  if (!pool) {
    result.status = "FAIL";
    result.message = "连接池未初始化";
    results.push(result);
    return false;
  }

  const indexChecks: { name: string; exists: boolean; table: string }[] = [];
  let passed = true;

  for (const index of CONFIG.requiredIndexes) {
    const indexStart = Date.now();

    try {
      const existsResult = await pool.query(
        `
        SELECT EXISTS (
          SELECT FROM pg_indexes
          WHERE schemaname = 'public'
          AND indexname = $1
        );
        `,
        [index.name]
      );

      const exists = existsResult.rows[0].exists;
      indexChecks.push({ name: index.name, exists, table: index.table });

      if (!exists) {
        if (index.required) {
          passed = false;
          logError(`索引 ${index.name} 不存在 (表: ${index.table}, 必需)`);
        } else {
          logWarning(`索引 ${index.name} 不存在 (表: ${index.table}, 可选)`);
        }
      } else {
        logSuccess(`索引 ${index.name} 存在`);
      }

      logDebug(`索引 ${index.name} 检查完成 (${Date.now() - indexStart}ms)`);
    } catch (error) {
      indexChecks.push({ name: index.name, exists: false, table: index.table });
      passed = false;
      logError(`检查索引 ${index.name} 失败: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  result.status = passed ? "PASS" : "FAIL";
  result.message = passed
    ? `所有必需索引存在 (${indexChecks.filter((i) => i.exists).length}/${indexChecks.length})`
    : "部分索引验证失败";
  result.details = indexChecks;
  result.duration = Date.now() - startTime;
  results.push(result);

  return passed;
}

// =============================================================================
// 验证权限
// =============================================================================
async function verifyPermissions(): Promise<boolean> {
  const startTime = Date.now();
  const result: VerificationResult = {
    name: "权限验证",
    status: "PASS",
    message: "",
    duration: 0,
  };

  logInfo("验证数据库权限...");

  if (!pool) {
    result.status = "FAIL";
    result.message = "连接池未初始化";
    results.push(result);
    return false;
  }

  const permissionChecks: { operation: string; allowed: boolean; error?: string }[] = [];
  let passed = true;

  // 测试的操作列表
  const operations = [
    { name: "SELECT", query: "SELECT 1 as test" },
    { name: "CREATE TABLE", query: "CREATE TABLE IF NOT EXISTS __test_perm (id INT)" },
    { name: "INSERT", query: "INSERT INTO __test_perm (id) VALUES (1)" },
    { name: "UPDATE", query: "UPDATE __test_perm SET id = 2" },
    { name: "DELETE", query: "DELETE FROM __test_perm" },
    { name: "DROP TABLE", query: "DROP TABLE IF EXISTS __test_perm" },
  ];

  for (const op of operations) {
    const opStart = Date.now();
    try {
      await pool.query(op.query);
      permissionChecks.push({ operation: op.name, allowed: true });
      logSuccess(`${op.name} 权限正常`);
    } catch (error) {
      passed = false;
      permissionChecks.push({
        operation: op.name,
        allowed: false,
        error: error instanceof Error ? error.message : String(error),
      });
      logError(`${op.name} 权限不足`);
    }
    logDebug(`权限检查 ${op.name} 完成 (${Date.now() - opStart}ms)`);
  }

  // 获取当前用户
  try {
    const userResult = await pool.query("SELECT current_user");
    const currentUser = userResult.rows[0].current_user;
    logInfo(`当前数据库用户: ${currentUser}`);
  } catch {
    // 忽略错误
  }

  result.status = passed ? "PASS" : "FAIL";
  result.message = passed
    ? `所有权限检查通过 (${permissionChecks.filter((p) => p.allowed).length}/${permissionChecks.length})`
    : "部分权限检查失败";
  result.details = permissionChecks;
  result.duration = Date.now() - startTime;
  results.push(result);

  return passed;
}

// =============================================================================
// 生成报告
// =============================================================================
async function generateReport(): Promise<VerificationReport> {
  // 获取数据库版本
  let version = "unknown";
  if (pool) {
    try {
      const result = await pool.query("SELECT version()");
      // 仅提取版本号，不包含系统信息
      version = result.rows[0].version.split(" ")[1] || "unknown";
    } catch {
      // 忽略错误
    }
  }

  const passed = results.filter((r) => r.status === "PASS").length;
  const failed = results.filter((r) => r.status === "FAIL").length;
  const warnings = results.filter((r) => r.status === "WARN").length;

  return {
    timestamp: new Date().toISOString(),
    database: {
      host: "[REDACTED]",
      database: "[REDACTED]",
      version,
    },
    summary: {
      total: results.length,
      passed,
      failed,
      warnings,
    },
    results,
  };
}

// =============================================================================
// 打印报告
// =============================================================================
async function printReport(report: VerificationReport) {
  if (outputJson) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  console.log("\n" + "=".repeat(77));
  console.log("  Neon 数据库验证报告");
  console.log("=".repeat(77));
  console.log(`\n验证时间: ${report.timestamp}`);
  console.log(`数据库: [REDACTED]`);
  console.log(`版本: ${report.database.version}`);

  console.log("\n" + "-".repeat(77));
  console.log("  摘要");
  console.log("-".repeat(77));
  console.log(`  总检查项: ${report.summary.total}`);
  console.log(`  通过:     \x1b[32m${report.summary.passed}\x1b[0m`);
  console.log(`  失败:     \x1b[31m${report.summary.failed}\x1b[0m`);
  console.log(`  警告:     \x1b[33m${report.summary.warnings}\x1b[0m`);

  console.log("\n" + "-".repeat(77));
  console.log("  详细结果");
  console.log("-".repeat(77));

  for (const r of report.results) {
    const statusColor =
      r.status === "PASS" ? "\x1b[32m" : r.status === "WARN" ? "\x1b[33m" : "\x1b[31m";
    const duration = r.duration ? ` (${r.duration}ms)` : "";
    console.log(`  [${statusColor}${r.status}\x1b[0m] ${r.name}${duration}`);
    if (r.message) {
      console.log(`       ${r.message}`);
    }
  }

  console.log("\n" + "=".repeat(77));
  if (report.summary.failed === 0) {
    console.log("  \x1b[32m所有验证通过！数据库配置正确\x1b[0m");
  } else {
    console.log(`  \x1b[31m验证失败: ${report.summary.failed} 项检查未通过\x1b[0m`);
  }
  console.log("=".repeat(77) + "\n");
}

// =============================================================================
// 清理资源
// =============================================================================
async function cleanup() {
  if (pool) {
    try {
      await pool.end();
      logDebug("连接池已关闭");
    } catch (error) {
      logDebug(`关闭连接池失败: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}

// =============================================================================
// 主函数
// =============================================================================
async function main(): Promise<number> {
  const exitCode = parseArgs();
  if (exitCode !== null) {
    return exitCode;
  }

  if (!outputJson) {
    console.log("\n" + "=".repeat(77));
    console.log("  Neon PostgreSQL 数据库验证");
    console.log("=".repeat(77) + "\n");
  }

  try {
    // 1. 检查环境变量
    if (!(await checkEnvironment())) {
      await cleanup();
      return 1;
    }

    // 2. 创建连接池
    if (!(await createPool())) {
      await cleanup();
      return 2;
    }

    // 3. 测试连接
    if (!(await testConnection())) {
      await cleanup();
      return 2;
    }

    // 4. 验证表结构
    if (!(await verifyTables())) {
      await cleanup();
      const report = await generateReport();
      await printReport(report);
      return 3;
    }

    // 5. 验证索引
    if (!(await verifyIndexes())) {
      await cleanup();
      const report = await generateReport();
      await printReport(report);
      return 4;
    }

    // 6. 验证权限
    if (!(await verifyPermissions())) {
      await cleanup();
      const report = await generateReport();
      await printReport(report);
      return 5;
    }

    // 生成最终报告
    const report = await generateReport();
    await printReport(report);

    await cleanup();
    return report.summary.failed > 0 ? 1 : 0;
  } catch (error) {
    logError(`验证过程出错: ${error instanceof Error ? error.message : String(error)}`);
    await cleanup();
    return 1;
  }
}

// 运行主函数
main()
  .then((code) => {
    process.exit(code);
  })
  .catch((error) => {
    console.error(`致命错误: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  });
