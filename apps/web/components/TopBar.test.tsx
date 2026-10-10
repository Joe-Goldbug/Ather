import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => '/',
}));

vi.mock('./GlobalLanguageSwitcher', () => ({
  GlobalLanguageSwitcher: () => <div data-testid="global-lang-switcher" />,
}));

const mockLocale = {
  locale: 'zh-CN',
  t: (key: string) => {
    // 返回 key 本身：断言直接匹配 key，避免与真实文案耦合
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
  it('未登录：左侧显示人物登录 icon、右侧仅白皮书与语言切换、内部导航隐藏', () => {
    mockSession = {
      user: null,
      isAuthed: false,
      refresh: vi.fn(),
      logout: vi.fn(),
    };

    const markup = renderToStaticMarkup(<TopBar />);

    // 左侧：人物登录 icon 入口（取代文字 EVA）
    expect(markup).toContain('data-testid="avatar-button"');
    expect(markup).toContain('data-testid="email-login"');
    expect(markup).toContain('data-testid="wallet-login"');
    expect(markup).not.toContain('class="top-bar__logo"');

    // 右侧：白皮书在语言切换左侧，且右侧不再有冗余登录入口
    expect(markup).toContain('href="/whitepaper"');
    expect(markup).toContain('nav.whitepaper');
    expect(markup).toContain('data-testid="global-lang-switcher"');

    // 未登录不显示内部导航
    expect(markup).not.toContain('href="/profile"');
    expect(markup).not.toContain('href="/theme-assessment"');
    expect(markup).not.toContain('href="/daily-mirror"');
    expect(markup).not.toContain('href="/play"');
  });

  it('登录后：左侧保留人物 icon，并显示持久导航 [我的记录, 进去情景, 我的笔记]，右侧保持白皮书与语言切换', () => {
    mockSession = {
      user: { id: 'u1', email: 'user@example.com' },
      isAuthed: true,
      refresh: vi.fn(),
      logout: vi.fn(),
    };

    const markup = renderToStaticMarkup(<TopBar />);

    // 左侧人物 icon 与退出入口
    expect(markup).toContain('data-testid="avatar-button"');
    expect(markup).toContain('data-testid="logout"');
    expect(markup).not.toContain('data-testid="email-login"');

    // 内部持久导航
    expect(markup).toContain('href="/profile"');
    expect(markup).toContain('nav.dashboard');
    expect(markup).toContain('href="/theme-assessment"');
    expect(markup).toContain('nav.assessment');
    expect(markup).toContain('href="/daily-mirror"');
    expect(markup).toContain('nav.diary');

    // 右侧白皮书与语言切换
    expect(markup).toContain('href="/whitepaper"');
    expect(markup).toContain('data-testid="global-lang-switcher"');
  });

  it('自定义用户名显示在 meta 中', () => {
    mockSession = {
      user: { id: 'u2', email: 'alice@example.com', username: 'Alice' },
      isAuthed: true,
      refresh: vi.fn(),
      logout: vi.fn(),
    };

    const markup = renderToStaticMarkup(<TopBar />);

    expect(markup).toContain('href="/profile"');
    expect(markup).toContain('Alice');
  });
});
