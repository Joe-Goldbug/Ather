import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';

describe('legacy personality inventory', () => {
  it('is read-only and emits checksummed source dispositions', () => {
    const output = execFileSync('node', ['scripts/inventory-legacy-personality.mjs'], {
      cwd: resolve(import.meta.dirname, '..'),
      encoding: 'utf8',
    });
    const report = JSON.parse(output) as { mode: string; entries: Array<{ status: string; checksum: string | null }> };

    expect(report.mode).toBe('inventory_only');
    expect(report.entries.length).toBeGreaterThan(0);
    expect(report.entries.every((entry) => entry.status === 'scanned' && entry.checksum)).toBe(true);
  });
});
