// scripts/patch-styled-jsx.mjs
// Postinstall patch: styled-jsx uses the wrong React instance during SSR.
// Fix: redirect styled-jsx's require('react') (or any non-compiled path) to
// Next.js's compiled production React.
//
// Handles both copies:
//   - monorepo_root/node_modules/styled-jsx/          (hoisted)
//   - monorepo_root/apps/web/node_modules/styled-jsx/ (deduped copy)

import { existsSync, readFileSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(__dirname, '..');

const nextPackagePath = resolve(rootDir, 'node_modules/next/package.json');
if (existsSync(nextPackagePath) && Number(JSON.parse(readFileSync(nextPackagePath, 'utf-8')).version.split('.')[0]) >= 16) {
  console.log('[patch-styled-jsx] Next.js 16+; legacy React-instance patch is not required.');
  process.exit(0);
}

// React instance used by App Router.
const compiledReactPath = resolve(rootDir, 'node_modules/next/dist/compiled/react').replace(/\\/g, '/');
// React instance used by legacy pages router internals.
const rootReactPath = resolve(rootDir, 'node_modules/react').replace(/\\/g, '/');

const targets = [
  {
    path: resolve(rootDir, 'node_modules/styled-jsx/dist/index/index.js'),
    reactPath: compiledReactPath,
  },
  {
    path: resolve(rootDir, 'apps/web/node_modules/styled-jsx/dist/index/index.js'),
    reactPath: compiledReactPath,
  },
  {
    path: resolve(rootDir, 'node_modules/next/node_modules/styled-jsx/dist/index/index.js'),
    reactPath: rootReactPath,
  },
];

let patchedCount = 0;

for (const target of targets) {
  const { path: styledJsxPath, reactPath } = target;
  if (!existsSync(styledJsxPath)) {
    console.warn(`[patch-styled-jsx] Not found: ${styledJsxPath}, skipping`);
    continue;
  }

  let content = readFileSync(styledJsxPath, 'utf-8');

  // Check current first line
  if (content.startsWith("require('client-only');")) {
    const secondLine = content.split('\n')[1];
    // Match: var React = require('...') — any variant
    const reactRequireMatch = secondLine.match(/^var React = require\('([^']+)'\)/);
    if (!reactRequireMatch) {
      console.log(`[patch-styled-jsx] Unexpected format in: ${styledJsxPath}`);
      continue;
    }

    const currentPath = reactRequireMatch[1];

    // Skip only if it already points at the exact compiled React instance we want.
    if (currentPath === reactPath) {
      console.log(`[patch-styled-jsx] Already correct: ${styledJsxPath}`);
      continue;
    }

    // Patch: redirect to compiled React
    const patched = content.replace(
      secondLine,
      `var React = require('${reactPath}')`
    );
    writeFileSync(styledJsxPath, patched, 'utf-8');
    console.log(`[patch-styled-jsx] Patched: ${styledJsxPath} (${currentPath} → ${reactPath})`);
    patchedCount++;
  } else {
    console.log(`[patch-styled-jsx] Already patched or unexpected: ${styledJsxPath}`);
  }
}

if (patchedCount > 0) {
  console.log(`[patch-styled-jsx] Done. Patched ${patchedCount} file(s).`);
} else {
  console.log('[patch-styled-jsx] No action needed.');
}
