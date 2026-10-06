import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { Providers } from '../providers-impl';
import WhitepaperPage from './page';

describe('WhitepaperPage', () => {
  it('renders the long-form Chinese project whitepaper without audience framing', () => {
    const markup = renderToStaticMarkup(
      <Providers initialLocale="zh-CN">
        <WhitepaperPage />
      </Providers>,
    );

    expect(markup).toContain('<h1>EVA 白皮书</h1>');
    expect(markup).toContain('EVA 的概念架构');
    expect(markup).toContain('终极目标：从自我探索到智能增强');
    expect(markup).not.toContain('给合作伙伴与投资者');
    expect(markup).not.toContain('面向用户、合作伙伴和投资者');
    expect(markup.match(/<h2>/g)).toHaveLength(18);
  });

  it.each([
    ['en', 'EVA Whitepaper', 'EVA’s Conceptual Architecture', 'Ultimate Goal: From Self-Exploration to Intelligence Amplification'],
    ['es', 'Whitepaper de EVA', 'La arquitectura conceptual de EVA', 'Objetivo final: de la autoexploración a la ampliación de la inteligencia'],
    ['ja', 'EVA ホワイトペーパー', 'EVA の概念アーキテクチャ', '最終目標：自己探索から知性の拡張へ'],
  ] as const)('renders the 18-section whitepaper in %s', (locale, title, architectureHeading, finalHeading) => {
    const markup = renderToStaticMarkup(
      <Providers initialLocale={locale}>
        <WhitepaperPage />
      </Providers>,
    );

    expect(markup).toContain(`<h1>${title}</h1>`);
    expect(markup).toContain(architectureHeading);
    expect(markup).toContain(finalHeading);
    expect(markup).not.toMatch(/partners and investors|パートナーと投資家|socios e inversores/i);
    expect(markup.match(/<h2>/g)).toHaveLength(18);
  });
});
