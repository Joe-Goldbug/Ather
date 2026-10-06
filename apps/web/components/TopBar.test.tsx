import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('./PageShell', () => ({
  PageShell: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock('next/link', () => ({
  default: ({ href, children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => (
    <a href={href} {...props}>{children}</a>
  ),
}));

import { Providers } from '../app/providers-impl';
import { TopBar } from './TopBar';

describe('TopBar', () => {
  it('keeps the White Paper link in the top-right navigation', () => {
    const markup = renderToStaticMarkup(
      <Providers initialLocale="zh-CN">
        <TopBar />
      </Providers>
    );

    expect(markup).toContain('href="/"');
    expect(markup).toContain('href="/whitepaper"');
    expect(markup).toContain('>White Paper</span>');
    expect(markup).not.toContain('href="/login"');
    expect(markup).not.toContain('href="/play"');
  });
});
