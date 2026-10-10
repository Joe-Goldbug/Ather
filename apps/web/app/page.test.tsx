import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../components/PageShell', () => ({
  PageShell: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock('next/link', () => ({
  default: ({ href, children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => (
    <a href={href} {...props}>{children}</a>
  ),
}));

let mockSession = {
  user: null as any,
  isAuthed: false,
  loading: false,
  refresh: vi.fn(),
  logout: vi.fn(),
};

vi.mock('@/hooks/useSession', () => ({
  useSession: () => mockSession,
}));

import { Providers } from './providers-impl';
import LandingPage from './page';

describe('LandingPage (homepage /)', () => {
  beforeEach(() => {
    mockSession = {
      user: null,
      isAuthed: false,
      loading: false,
      refresh: vi.fn(),
      logout: vi.fn(),
    };
  });

  it.each([
    ['zh-CN', '开始了解自己'],
    ['en', 'Take Test'],
    ['ja', 'テストを受ける'],
    ['es', 'Hacer Test'],
  ] as const)('shows the localized test entry for %s when unauthenticated', (locale, ctaLabel) => {
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

  it('renders authed cognitive hub with entry cards when user is authenticated', () => {
    mockSession = {
      user: { id: 'u1', username: 'Alex', email: 'alex@example.com' },
      isAuthed: true,
      loading: false,
      refresh: vi.fn(),
      logout: vi.fn(),
    };

    const markup = renderToStaticMarkup(
      <Providers initialLocale="zh-CN">
        <LandingPage />
      </Providers>
    );

    // 应该展示用户问候，绝不展示冷启动游客测试按钮
    expect(markup).toContain('Alex');
    expect(markup).not.toContain('class="hero-cta"');
    // 应该展示免费情景测试横幅入口
    expect(markup).toContain('href="/play"');
    expect(markup).toContain('免费情景测试');
  });
});
