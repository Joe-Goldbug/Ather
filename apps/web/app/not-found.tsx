// apps/web/app/not-found.tsx — Custom 404 page
// No styled-jsx to avoid monorepo React/styled-jsx conflict

'use client';

import Link from 'next/link';
import { useLocale } from './providers-impl';

export default function NotFound() {
  const { t } = useLocale();

  return (
    <main className="error-page">
      <h1>{t('notFound.title')}</h1>
      <p>{t('notFound.body')}</p>
      <Link href="/">{t('notFound.link_home')}</Link>
    </main>
  );
}
