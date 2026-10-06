import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('Visual Tokens Architecture', () => {
  // We want to ensure no inline styles for visual layout are used.
  // Dynamic inline styles like `width: x%` or `background: palette.bg` are allowed,
  // but static strings like `marginTop: '30px'` or `fontSize: '13px'` are banned.

  const BANNED_PATTERNS = [
    /style=\{\{[^}]*marginTop\s*:\s*['"]\d+px['"]/g,
    /style=\{\{[^}]*marginBottom\s*:\s*['"][\d.]+rem['"]/g,
    /style=\{\{[^}]*fontSize\s*:\s*['"][\d.]+(px|rem)['"]/g,
    /style=\{\{[^}]*color\s*:\s*['"]var\(--text-(primary|secondary)['"]/g,
    /style=\{\{[^}]*display\s*:\s*['"](grid|flex)['"]/g,
    /style=\{\{[^}]*padding\s*:\s*['"]/g,
  ];

  const EXTRA_BANNED_SNIPPETS = [
    "style={{ flex: 1, margin: 0 }}",
    "style={{ width: '100%', maxWidth: '300px', overflow: 'visible' }}",
    "style={{ color: '#f59e0b' }}",
    "style={{ margin: 0 }}",
  ];

  it('portrait-sections.tsx contains no static layout inline styles', () => {
    const filePath = resolve(__dirname, '../../components/portrait-sections.tsx');
    const content = readFileSync(filePath, 'utf-8');

    for (const pattern of BANNED_PATTERNS) {
      const matches = content.match(pattern);
      expect(matches, `Found banned inline style pattern ${pattern} in portrait-sections.tsx`).toBeNull();
    }

    for (const snippet of EXTRA_BANNED_SNIPPETS) {
      expect(content, `Found banned static inline style snippet ${snippet} in portrait-sections.tsx`).not.toContain(snippet);
    }
  });

  it('profile/page.tsx contains no static layout inline styles', () => {
    const filePath = resolve(__dirname, '../profile/page.tsx');
    const content = readFileSync(filePath, 'utf-8');

    for (const pattern of BANNED_PATTERNS) {
      const matches = content.match(pattern);
      expect(matches, `Found banned inline style pattern ${pattern} in profile/page.tsx`).toBeNull();
    }
  });

  it('assessment/page.tsx contains no static layout inline styles', () => {
    const filePath = resolve(__dirname, '../assessment/page.tsx');
    const content = readFileSync(filePath, 'utf-8');

    for (const pattern of BANNED_PATTERNS) {
      const matches = content.match(pattern);
      expect(matches, `Found banned inline style pattern ${pattern} in assessment/page.tsx`).toBeNull();
    }
  });

  it('icon-demo/page.tsx contains no static layout inline styles', () => {
    const filePath = resolve(__dirname, '../icon-demo/page.tsx');
    const content = readFileSync(filePath, 'utf-8');

    for (const pattern of BANNED_PATTERNS) {
      const matches = content.match(pattern);
      expect(matches, `Found banned inline style pattern ${pattern} in icon-demo/page.tsx`).toBeNull();
    }
  });

  it('login/page.tsx contains no static layout inline styles', () => {
    const filePath = resolve(__dirname, '../login/page.tsx');
    const content = readFileSync(filePath, 'utf-8');

    for (const pattern of BANNED_PATTERNS) {
      const matches = content.match(pattern);
      expect(matches, `Found banned inline style pattern ${pattern} in login/page.tsx`).toBeNull();
    }

    expect(content).not.toContain("style={{ flex: 1, margin: 0 }}");
  });
});
