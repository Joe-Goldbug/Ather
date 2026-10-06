import { cleanup, render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Providers } from '../app/providers-impl';
import { useLocale } from '../app/providers-impl';
import type { Locale } from '../lib/i18n';

function LocaleProbe() {
  const { locale } = useLocale();
  return <div data-testid="locale-probe">{locale}</div>;
}

describe('GlobalLanguageSwitcher', () => {
  afterEach(cleanup);
  beforeEach(() => {
    localStorage.clear();
    document.cookie = 'eva_locale=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/';
  });

  it.each(['zh-CN', 'en', 'ja', 'es'] as Locale[])('supports keyboard navigation and Escape in %s', (locale) => {
    render(<Providers initialLocale={locale}><LocaleProbe /></Providers>);
    const toggle = screen.getByRole('button', { expanded: false });
    toggle.focus();
    fireEvent.keyDown(toggle, { key: 'ArrowDown' });
    const items = screen.getAllByRole('menuitem');
    expect(items[0]).toHaveFocus();
    fireEvent.keyDown(items[0], { key: 'ArrowUp' });
    expect(items[3]).toHaveFocus();
    fireEvent.keyDown(items[3], { key: 'Home' });
    expect(items[0]).toHaveFocus();
    fireEvent.keyDown(items[0], { key: 'End' });
    expect(items[3]).toHaveFocus();
    fireEvent.keyDown(items[3], { key: 'ArrowDown' });
    expect(items[0]).toHaveFocus();
    fireEvent.keyDown(items[0], { key: 'Escape' });
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(toggle).toHaveFocus();
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
  });

  it('focuses the last item from ArrowUp, restores trigger focus on selection and closes on focus leave', () => {
    render(<Providers initialLocale="en"><button>Outside</button></Providers>);
    const toggle = screen.getByRole('button', { expanded: false });
    fireEvent.keyDown(toggle, { key: 'ArrowUp' });
    expect(screen.getByRole('menuitem', { name: '日本語' })).toHaveFocus();
    fireEvent.click(screen.getByRole('menuitem', { name: 'Español' }));
    expect(toggle).toHaveFocus();
    expect(toggle).toHaveTextContent('ES');
    fireEvent.click(toggle);
    fireEvent.blur(screen.getAllByRole('menuitem')[0], { relatedTarget: screen.getByRole('button', { name: 'Outside' }) });
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('renders current locale label and allows switching locale globally', () => {
    render(
      <Providers initialLocale="zh-CN">
        <LocaleProbe />
      </Providers>
    );

    expect(screen.getByRole('button', { name: '选择语言' })).toHaveTextContent('ZH');
    expect(screen.getByTestId('locale-probe')).toHaveTextContent('zh-CN');

    fireEvent.click(screen.getByRole('button', { name: '选择语言' }));
    expect(screen.getAllByRole('menuitem').map((item) => item.textContent)).toEqual([
      '简体中文',
      'English',
      'Español',
      '日本語',
    ]);
    fireEvent.click(screen.getByRole('menuitem', { name: 'English' }));

    expect(screen.getByTestId('locale-probe')).toHaveTextContent('en');
    expect(document.documentElement.lang).toBe('en');
    expect(localStorage.getItem('eva_locale')).toBe('en');
    expect(document.cookie).toContain('eva_locale=en');
  });
});
