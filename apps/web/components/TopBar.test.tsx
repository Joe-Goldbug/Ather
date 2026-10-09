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
  it('未登录：logo 可达、白皮书在下拉中、头像与两种登录入口在、内部导航隐藏', () => {
    mockSession = {
      user: null,
      isAuthed: false,
      refresh: vi.fn(),
      logout: vi.fn(),
    };

    const markup = renderToStaticMarkup(<TopBar />);

    expect(markup).toContain('href="/"');
    expect(markup).toContain('>EVA<');
    // 白皮书移入 logo 下拉，不再是独立按钮
    expect(markup).toContain('href="/whitepaper"');
    expect(markup).toContain('nav.whitepaper');
    expect(markup).not.toContain('top-bar__btn');
    // 头像菜单：两种登录方式
    expect(markup).toContain('data-testid="avatar-button"');
    expect(markup).toContain('data-testid="email-login"');
    expect(markup).toContain('data-testid="wallet-login"');
    // 未登录不显示内部导航
    expect(markup).not.toContain('href="/profile"');
    expect(markup).not.toContain('href="/theme-assessment"');
    expect(markup).not.toContain('href="/daily-mirror"');
    // 游客测试仍不允许出现在 TopBar
    expect(markup).not.toContain('href="/play"');
  });

  it('登录后：显示持久导航 [我的记录, 进去情景, 我的笔记] 与头像首字母', () => {
    mockSession = {
      user: { id: 'u1', email: 'user@example.com' },
      isAuthed: true,
      refresh: vi.fn(),
      logout: vi.fn(),
    };

    const markup = renderToStaticMarkup(<TopBar />);

    expect(markup).toContain('>EVA<');
    expect(markup).toContain('href="/profile"');
    expect(markup).toContain('nav.dashboard');
    expect(markup).toContain('href="/theme-assessment"');
    expect(markup).toContain('nav.assessment');
    expect(markup).toContain('href="/daily-mirror"');
    expect(markup).toContain('nav.diary');
    // 登录态头像：首字母 + 退出入口；游戏登录项消失
    expect(markup).toContain('avatar-button__glyph');
    expect(markup).toContain('data-testid="logout"');
    expect(markup).not.toContain('data-testid="email-login"');
    // 白皮书仍在下拉中
    expect(markup).toContain('href="/whitepaper"');
  });

  it('自定义用户名显示在 logo 与头像首字母', () => {
    mockSession = {
      user: { id: 'u2', email: 'alice@example.com', username: 'Alice' },
      isAuthed: true,
      refresh: vi.fn(),
      logout: vi.fn(),
    };

    const markup = renderToStaticMarkup(<TopBar />);

    expect(markup).toContain('>Alice<');
    expect(markup).toContain('href="/profile"');
    expect(markup).toContain('>A<');
  });
});
