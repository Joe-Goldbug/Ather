// apps/web/app/page.tsx
// Public landing page.
//
// The hero preserves the clean Eva brand first impression.
// the original. The single assessment entry point is appended inside the hero
// using .hero-cta / .cta-group, which already exist in globals.css for exactly
// this purpose.
//
// The whitepaper is intentionally NOT repeated here — the top bar already
// carries a White Paper link.

'use client';

import Link from 'next/link';
import { useLocale } from './providers-impl';

export default function LandingPage() {
  const { t } = useLocale();

  return (
    <main className="container">
      <section className="hero">
        <h1 className="hero-brand">{t('common.brand_name')}</h1>
        <p className="hero-coming-soon">{t('common.coming_soon')}</p>
        <div className="cta-group">
          <Link href="/play" className="hero-cta">
            {t('landing.cta_start')}
          </Link>
        </div>
      </section>
    </main>
  );
}
