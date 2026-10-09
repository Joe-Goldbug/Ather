'use client';

import Link from 'next/link';
import { useLocale } from './providers-impl';

export default function LandingPage() {
  const { t } = useLocale();

  return (
    <main className="container">
      <section className="hero">
        <h1 className="hero-brand">{t('common.brand_name')}</h1>
        <p className="hero-tagline">{t('landing.hero_description')}</p>
        <Link href="/play" className="hero-cta">
          {t('landing.cta_assessment')}
        </Link>
      </section>
    </main>
  );
}
