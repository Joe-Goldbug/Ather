import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it, expect, vi } from 'vitest';

vi.mock('../components/PageShell', () => ({
  PageShell: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock('next/link', () => ({
  default: ({ href, children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => (
    <a href={href} {...props}>{children}</a>
  ),
}));

import { Providers } from './providers-impl';
import LandingPage from './page';

describe('LandingPage (homepage /)', () => {
  it.each([
    ['zh-CN', '开始了解自己'],
    ['en', 'Take Test'],
    ['ja', 'テストを受ける'],
    ['es', 'Hacer Test'],
  ] as const)('shows the localized test entry for %s', (locale, ctaLabel) => {
    const markup = renderToStaticMarkup(
      <Providers initialLocale={locale}>
        <LandingPage />
      </Providers>
    );

    expect(markup).toContain('<h1 class="hero-brand">EVA</h1>');
    expect(markup).toContain(`<a href="/play" class="hero-cta">${ctaLabel}</a>`);
    expect(markup).not.toContain('coming-soon');
    expect(markup).not.toContain('href="/whitepaper"');
    expect(markup).not.toMatch(/[\u{1F300}-\u{1FAFF}]|[\u{2600}-\u{27BF}]/u);
  });
});
