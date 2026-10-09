import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('./web3/BaseWalletButton', () => ({
  BaseWalletButton: () => <div data-testid="base-wallet-button" />,
}));

vi.mock('./GlobalLanguageSwitcher', () => ({
  GlobalLanguageSwitcher: () => <div data-testid="global-lang-switcher" />,
}));

const mockLocale = {
  locale: 'zh-CN',
  t: (key: string) => {
    if (key === 'common.brand_name') return 'EVA';
    if (key === 'nav.dashboard') return '我的记录';
    if (key === 'nav.assessment') return '进去情景';
    if (key === 'nav.diary') return '我的笔记';
    return key;
  },
};

vi.mock('@/app/providers-impl', () => ({
  useLocale: () => mockLocale,
}));

let mockSession = {
  user: null as any,
  isAuthed: false,
  refresh: vi.fn(),
  logout: vi.fn(),
};

vi.mock('@/hooks/useSession', () => ({
  useSession: () => mockSession,
}));

import { TopBar } from './TopBar';

describe('TopBar', () => {
  it('keeps the White Paper link and hides internal nav when not logged in', () => {
    mockSession = {
      user: null,
      isAuthed: false,
      refresh: vi.fn(),
      logout: vi.fn(),
    };

    const markup = renderToStaticMarkup(<TopBar />);

    expect(markup).toContain('href="/"');
    expect(markup).toContain('>EVA<');
    expect(markup).toContain('href="/whitepaper"');
    expect(markup).toContain('>White Paper</span>');
    expect(markup).not.toContain('href="/profile"');
    expect(markup).not.toContain('href="/theme-assessment"');
    expect(markup).not.toContain('href="/daily-mirror"');
  });

  it('shows persistent nav [我的记录, 进去情景, 我的笔记] and defaults to EVA when user has no custom name', () => {
    mockSession = {
      user: { id: 'u1', email: 'user@example.com' },
      isAuthed: true,
      refresh: vi.fn(),
      logout: vi.fn(),
    };

    const markup = renderToStaticMarkup(<TopBar />);

    expect(markup).toContain('>EVA<');
    expect(markup).toContain('href="/profile"');
    expect(markup).toContain('我的记录');
    expect(markup).toContain('href="/theme-assessment"');
    expect(markup).toContain('进去情景');
    expect(markup).toContain('href="/daily-mirror"');
    expect(markup).toContain('我的笔记');
    expect(markup).toContain('href="/whitepaper"');
  });

  it('displays the custom username when set by user', () => {
    mockSession = {
      user: { id: 'u2', email: 'alice@example.com', username: 'Alice' },
      isAuthed: true,
      refresh: vi.fn(),
      logout: vi.fn(),
    };

    const markup = renderToStaticMarkup(<TopBar />);

    expect(markup).toContain('>Alice<');
    expect(markup).toContain('href="/profile"');
    expect(markup).toContain('我的记录');
    expect(markup).toContain('href="/whitepaper"');
  });
});
