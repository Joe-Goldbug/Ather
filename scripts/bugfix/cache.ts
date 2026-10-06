/**
 * Error Cache — 持久化错误记忆
 *
 * 规则 3: error-cache 防御
 * - ADD-only：新错误直接追加
 * - 命中已知错误 → 直接输出 fix 方案，不重复分析
 * - 每次修复失败 → 写入
 * - 修复成功 → last_seen 更新 + count++
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import type { ErrorCache, ErrorCacheEntry } from "./types.ts";

const DEFAULT_CACHE_PATH = resolve(
  import.meta.dirname ?? ".",
  "../../.memory/error-cache.json"
);

export function loadCache(cachePath = DEFAULT_CACHE_PATH): ErrorCache {
  if (!existsSync(cachePath)) return {};
  try {
    return JSON.parse(readFileSync(cachePath, "utf-8")) as ErrorCache;
  } catch {
    console.warn(`[cache] 解析失败，返回空缓存: ${cachePath}`);
    return {};
  }
}

export function saveCache(cache: ErrorCache, cachePath = DEFAULT_CACHE_PATH): void {
  const dir = dirname(cachePath);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(cachePath, JSON.stringify(cache, null, 2) + "\n", "utf-8");
}

/**
 * 查找是否命中已知错误
 * 匹配策略：对关键词做 substring match（不做 exact match，容错性更好）
 */
export function lookupCache(
  errorMessage: string,
  cache: ErrorCache
): { key: string; entry: ErrorCacheEntry } | null {
  const msgLower = errorMessage.toLowerCase();
  for (const [key, entry] of Object.entries(cache)) {
    if (msgLower.includes(key.toLowerCase())) {
      return { key, entry };
    }
  }
  return null;
}

/**
 * 记录修复失败
 */
export function recordFailure(
  key: string,
  fixSummary: string,
  projectRoot: string,
  cachePath = DEFAULT_CACHE_PATH
): void {
  const cache = loadCache(cachePath);
  const today = new Date().toISOString().slice(0, 10);

  if (cache[key]) {
    cache[key].last_seen = today;
    cache[key].count += 1;
    if (!cache[key].projects.includes(projectRoot)) {
      cache[key].projects.push(projectRoot);
    }
  } else {
    cache[key] = {
      fix: fixSummary,
      first_seen: today,
      last_seen: today,
      count: 1,
      projects: [projectRoot],
    };
  }

  saveCache(cache, cachePath);
  console.log(`[cache] 记录失败: "${key}" (count=${cache[key].count})`);
}

/**
 * 记录修复成功（同样更新 last_seen，标记"此方案有效"）
 */
export function recordSuccess(
  key: string,
  projectRoot: string,
  cachePath = DEFAULT_CACHE_PATH
): void {
  const cache = loadCache(cachePath);
  if (!cache[key]) return;
  const today = new Date().toISOString().slice(0, 10);
  cache[key].last_seen = today;
  cache[key].count += 1;
  if (!cache[key].projects.includes(projectRoot)) {
    cache[key].projects.push(projectRoot);
  }
  saveCache(cache, cachePath);
}

/**
 * 打印所有缓存条目（用于调试/报告）
 */
export function printCache(cachePath = DEFAULT_CACHE_PATH): void {
  const cache = loadCache(cachePath);
  const keys = Object.keys(cache);
  if (keys.length === 0) {
    console.log("[cache] 暂无缓存记录");
    return;
  }
  console.log(`\n[cache] 共 ${keys.length} 条记录:\n`);
  for (const [key, entry] of Object.entries(cache)) {
    console.log(`  ▸ ${key}`);
    console.log(`    fix: ${entry.fix}`);
    console.log(`    seen: ${entry.first_seen} → ${entry.last_seen} (${entry.count}次)\n`);
  }
}
