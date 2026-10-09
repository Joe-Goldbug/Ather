'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect } from 'react';
import { GlobalLanguageSwitcher } from './GlobalLanguageSwitcher';
import { BaseWalletButton } from './web3/BaseWalletButton';
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

  return (
    <header className="top-bar">
      <div className="top-bar__left">
        <Link href="/" className="top-bar__logo" aria-label={displayName}>
          {displayName}
        </Link>

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

      <div className="top-bar__right" style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <Link href="/whitepaper" className="top-bar__btn" aria-label="White Paper">
          <span>White Paper</span>
        </Link>
        <BaseWalletButton />
        <GlobalLanguageSwitcher />
      </div>
    </header>
  );
}
