#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const targets = [
  ['assessment archetype producer', 'packages/core/src/assessment/script-engine.ts', /ARCHETYPES|archetype_id|share_card/g],
  ['assessment archetype definitions', 'packages/core/src/assessment/script-schema.ts', /ARCHETYPES|score_rules/g],
  ['legacy report contract', 'packages/core/src/report/report-types.ts', /archetypeName|rtScore|evidenceHighlights/g],
  ['legacy report persistence', 'apps/api/src/queue/worker.ts', /archetype_name|report_data|ReportSchema/g],
  ['legacy profile adapter', 'apps/api/src/modules/profile/profile.service.ts', /memory_state|legacy|modelStatus/g],
  ['legacy agent context', 'apps/api/src/modules/agent-context/agent-context.service.ts', /legacy|memory_state|formal_evidence/g],
];

const entries = targets.map(([kind, relativePath, pattern]) => {
  const path = join(root, relativePath);
  if (!existsSync(path)) {
    return { kind, path: relativePath, status: 'missing', matches: 0, checksum: null };
  }
  const content = readFileSync(path, 'utf8');
  return {
    kind,
    path: relativePath,
    status: 'scanned',
    matches: [...content.matchAll(pattern)].length,
    checksum: createHash('sha256').update(content).digest('hex'),
  };
});

process.stdout.write(`${JSON.stringify({
  mode: 'inventory_only',
  generated_at: new Date().toISOString(),
  scanned: entries.length,
  entries,
}, null, 2)}\n`);
