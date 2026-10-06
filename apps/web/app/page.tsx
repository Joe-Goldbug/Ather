'use client';

import Link from 'next/link';
import { useLocale } from './providers-impl';

export default function LandingPage() {
  const { t } = useLocale();

  return (
    <main className="container">
      <section className="hero">
        <h1 className="hero-brand">{t('common.brand_name')}</h1>
        <Link href="/theme-assessment" className="hero-cta">
          {t('landing.cta_assessment')}
        </Link>
      </section>
    </main>
  );
}
