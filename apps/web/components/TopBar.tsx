'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { GlobalLanguageSwitcher } from './GlobalLanguageSwitcher';
import { AvatarMenu } from './AvatarMenu';
import { useLocale } from '@/app/providers-impl';
import { useSession } from '@/hooks/useSession';

export function TopBar() {
  const { t } = useLocale();
  const { user, isAuthed, refresh } = useSession();

  let pathname = '';
  try {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    pathname = usePathname() || '';
  } catch {
    pathname = '';
  }

  useEffect(() => {
    void refresh();
  }, [pathname, refresh]);

  const displayName =
    user?.name?.trim() ||
    user?.username?.trim() ||
    user?.display_name?.trim() ||
    'EVA';

  // Logo 下拉（White Paper）：桌面端悬停展开，触屏端点击展开。
  // hover 通过 onMouseEnter/Leave 处理（触屏不触发）；click 在两种端都可用。
  const [logoMenuOpen, setLogoMenuOpen] = useState(false);
  const logoMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!logoMenuOpen) return;
    function onDocClick(event: MouseEvent) {
      if (
        logoMenuRef.current &&
        !logoMenuRef.current.contains(event.target as Node)
      ) {
        setLogoMenuOpen(false);
      }
    }
    document.addEventListener('click', onDocClick);
    return () => document.removeEventListener('click', onDocClick);
  }, [logoMenuOpen]);

  return (
    <header className="top-bar">
      <div className="top-bar__left">
        <div
          ref={logoMenuRef}
          className="topbar-logo-menu"
          onMouseEnter={() => setLogoMenuOpen(true)}
          onMouseLeave={() => setLogoMenuOpen(false)}
          data-testid="logo-menu"
        >
          <Link href="/" className="top-bar__logo" aria-label={displayName}>
            {displayName}
          </Link>
          <div
            className="topbar-logo-menu__dropdown"
            role="menu"
            aria-label="More"
            data-open={logoMenuOpen ? 'true' : 'false'}
          >
            <Link
              href="/whitepaper"
              className="topbar-logo-menu__item"
              role="menuitem"
              onClick={() => setLogoMenuOpen(false)}
            >
              {t('nav.whitepaper')}
            </Link>
          </div>
        </div>

        {isAuthed && (
          <nav className="top-bar__nav" aria-label="Main navigation">
            <Link
              href="/profile"
              className={`top-bar__nav-link ${pathname === '/profile' ? 'active' : ''}`}
            >
              {t('nav.dashboard')}
            </Link>
            <Link
              href="/theme-assessment"
              className={`top-bar__nav-link ${pathname.startsWith('/theme-assessment') ? 'active' : ''}`}
            >
              {t('nav.assessment')}
            </Link>
            <Link
              href="/daily-mirror"
              className={`top-bar__nav-link ${pathname.startsWith('/daily-mirror') ? 'active' : ''}`}
            >
              {t('nav.diary')}
            </Link>
          </nav>
        )}
      </div>

      <div className="top-bar__right">
        <GlobalLanguageSwitcher />
        <AvatarMenu />
      </div>
    </header>
  );
}
