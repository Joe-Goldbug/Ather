import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const appRoot = resolve(__dirname, '..');

describe('continuous theme assessment is the single writable authority', () => {
  it('keeps the retired routes as redirect-only pages without legacy question code', () => {
    for (const route of ['assessment', 'micro-sandbox', 'interactive-narrative']) {
      const source = readFileSync(resolve(appRoot, route, 'page.tsx'), 'utf8');
      expect(source).toContain("redirect('/theme-assessment')");
      expect(source).not.toContain('SCENARIO_SCHEMAS');
      expect(source).not.toContain('assessmentApi.microComplete');
      expect(source).not.toContain('LegacyAssessmentPage');
    }
  });

  it('does not leave active navigation links to the retired assessment route', () => {
    const sources = ['page.tsx', 'profile/page.tsx', 'login/page.tsx'].map((file) =>
      readFileSync(resolve(appRoot, file), 'utf8')
    );
    expect(sources.join('\n')).not.toMatch(/href=["']\/assessment["']/);
  });
});
