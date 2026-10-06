'use client';

import Link from 'next/link';
import { GlobalLanguageSwitcher } from './GlobalLanguageSwitcher';
import { useLocale } from '@/app/providers-impl';

export function TopBar() {
  const { t } = useLocale();

  return (
    <header className="top-bar">
      <Link href="/" className="top-bar__logo" aria-label={t('common.brand_name')}>
        {t('common.brand_name')}
      </Link>
      <div className="top-bar__right">
        <Link href="/whitepaper" className="top-bar__btn" aria-label="White Paper">
          <span>White Paper</span>
        </Link>
        <GlobalLanguageSwitcher />
      </div>
    </header>
  );
}
