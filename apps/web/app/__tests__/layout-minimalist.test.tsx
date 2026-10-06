import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('RootLayout SVG Filters & Fonts', () => {
  const layoutPath = resolve(__dirname, '../layout.tsx');
  const layoutContent = readFileSync(layoutPath, 'utf-8');

  it('renders the sketch-wobble SVG filter used by hand-drawn cards', () => {
    expect(layoutContent).toContain('sketch-wobble');
  });

  it('maintains font variables in layout className', () => {
    expect(layoutContent).toContain('inter.variable');
    expect(layoutContent).toContain('caveat.variable');
  });
});
