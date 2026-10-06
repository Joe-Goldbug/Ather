import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('retired interactive narrative API', () => {
  it('does not keep a provider key or a psychological-analysis prompt in the web process', () => {
    const source = readFileSync(resolve(__dirname, 'route.ts'), 'utf8');
    expect(source).toContain('interactive_narrative_retired');
    expect(source).not.toMatch(/sk-[A-Za-z0-9]{16,}/);
    expect(source).not.toContain('polyvagal');
    expect(source).not.toContain('DEEPSEEK_API_KEY');
  });
});
