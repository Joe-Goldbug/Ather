// apps/web/app/error.tsx — Custom error boundary page
// Prevents Next.js default _error page from being statically pre-rendered

'use client';

import Link from 'next/link';
import { useEffect } from 'react';
import { useLocale } from './providers-impl';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const { t } = useLocale();

  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="error-page">
      <h1>{t('error.title')}</h1>
      <p>{t('error.body')}</p>
      <div className="error-actions">
        <button onClick={reset}>{t('error.btn_retry')}</button>
        <Link href="/">{t('error.link_home')}</Link>
      </div>
    </main>
  );
}
