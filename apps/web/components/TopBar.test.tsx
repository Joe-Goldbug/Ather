import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('./web3/BaseWalletButton', () => ({
  BaseWalletButton: () => <div data-testid="base-wallet-button" />,
}));

vi.mock('./GlobalLanguageSwitcher', () => ({
  GlobalLanguageSwitcher: () => <div data-testid="global-lang-switcher" />,
}));

vi.mock('@/app/providers-impl', () => ({
  useLocale: () => ({
    locale: 'zh-CN',
    t: (key: string) => (key === 'common.brand_name' ? 'EVA' : key),
  }),
}));

import { TopBar } from './TopBar';

describe('TopBar', () => {
  it('keeps the White Paper link in the top-right navigation', () => {
    const markup = renderToStaticMarkup(<TopBar />);

    expect(markup).toContain('href="/"');
    expect(markup).toContain('href="/whitepaper"');
    expect(markup).toContain('>White Paper</span>');
    expect(markup).not.toContain('href="/login"');
    expect(markup).not.toContain('href="/play"');
  });
});
