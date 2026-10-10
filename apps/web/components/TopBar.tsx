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
  const { isAuthed, refresh } = useSession();

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

  return (
    <header className={`top-bar ${isAuthed ? 'top-bar--authed' : ''}`}>
      <div className="top-bar__row">
        <div className="top-bar__left">
          <AvatarMenu />

          {isAuthed && (
            <nav className="top-bar__nav top-bar__nav--desktop" aria-label="Main navigation">
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
          <Link
            href="/whitepaper"
            className={`top-bar__whitepaper-link ${pathname === '/whitepaper' ? 'active' : ''}`}
          >
            {t('nav.whitepaper')}
          </Link>
          <GlobalLanguageSwitcher />
        </div>
      </div>

      {isAuthed && (
        <nav className="top-bar__nav top-bar__nav--mobile" aria-label="Mobile navigation">
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
    </header>
  );
}
