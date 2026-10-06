// packages/runtime-sentinel/src/loader.ts
// Discover project-supplied probes from `<projectRoot>/.sentinel/probes.{ts,mjs,js}`.
// Walks up from cwd until it finds `.sentinel/` or hits filesystem root.

import { existsSync, statSync } from 'node:fs';
import { dirname, resolve, isAbsolute } from 'node:path';
import { pathToFileURL } from 'node:url';
import { defaultProbes } from './default-probes.js';
import type { Probe } from './types.js';

export interface DiscoveryResult {
  probes: Probe[];
  /** Absolute path of the file that was loaded; undefined when default-probes is used */
  source?: string;
  /** Absolute path of the project root that contained `.sentinel/`; undefined when none */
  projectRoot?: string;
}

const PROBE_FILES = ['probes.ts', 'probes.mjs', 'probes.js'] as const;
const SENTINEL_DIR = '.sentinel';

/**
 * Find the nearest `.sentinel/` directory by walking parents of `start`.
 */
export function findSentinelDir(start: string): string | undefined {
  let cur = isAbsolute(start) ? start : resolve(process.cwd(), start);
  if (statSync(cur, { throwIfNoEntry: false })?.isFile()) {
    cur = dirname(cur);
  }
  // Bound the search to ~10 levels to avoid pathological climbs
  for (let i = 0; i < 10; i++) {
    const candidate = resolve(cur, SENTINEL_DIR);
    if (existsSync(candidate) && statSync(candidate).isDirectory()) {
      return candidate;
    }
    const parent = dirname(cur);
    if (parent === cur) return undefined;
    cur = parent;
  }
  return undefined;
}

function pickProbeFile(sentinelDir: string): string | undefined {
  for (const name of PROBE_FILES) {
    const p = resolve(sentinelDir, name);
    if (existsSync(p)) return p;
  }
  return undefined;
}

/**
 * Load probes from disk.
 * Resolution order:
 *   1. explicitPath (when --probes <file> is given)
 *   2. <projectRoot>/.sentinel/probes.{ts,mjs,js}  via parent walk
 *   3. fallback to default-probes
 */
export async function loadProbes(opts: {
  explicitPath?: string;
  cwd?: string;
} = {}): Promise<DiscoveryResult> {
  const cwd = opts.cwd ?? process.cwd();

  if (opts.explicitPath) {
    const abs = isAbsolute(opts.explicitPath)
      ? opts.explicitPath
      : resolve(cwd, opts.explicitPath);
    if (!existsSync(abs)) {
      throw new Error(`--probes file not found: ${abs}`);
    }
    return importProbes(abs);
  }

  const dir = findSentinelDir(cwd);
  if (!dir) {
    return { probes: defaultProbes() };
  }
  const file = pickProbeFile(dir);
  if (!file) {
    console.warn(`[sentinel] found ${dir} but no probes.{ts,mjs,js} inside; using defaults`);
    return { probes: defaultProbes(), projectRoot: dirname(dir) };
  }
  const result = await importProbes(file);
  return { ...result, projectRoot: dirname(dir) };
}

async function importProbes(file: string): Promise<DiscoveryResult> {
  // ESM dynamic import; works in both Bun (ts) and Node (mjs/js)
  const url = pathToFileURL(file).href;
  const mod = await import(url);
  const exported = (mod as { default?: unknown }).default ?? (mod as { probes?: unknown }).probes;
  if (!Array.isArray(exported)) {
    throw new Error(
      `[sentinel] ${file} must export default an array of Probe objects (got ${typeof exported})`,
    );
  }
  // Light validation
  for (const [i, p] of exported.entries()) {
    if (!p || typeof p !== 'object' || typeof (p as Probe).id !== 'string'
        || typeof (p as Probe).run !== 'function') {
      throw new Error(`[sentinel] ${file} entry #${i} is not a valid Probe (missing id/run)`);
    }
  }
  return { probes: exported as Probe[], source: file };
}
