// apps/web/app/layout.tsx
// SSR locale is handled by providers.tsx reading the cookie.
// layout.tsx always renders with the correct lang from the server.

import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { cookies } from 'next/headers';
import { Inter, Space_Grotesk, Share_Tech_Mono, Caveat } from 'next/font/google';
import './globals.css';
import Providers from './providers';

const inter = Inter({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800'],
  display: 'swap',
  variable: '--font-inter',
});

const spaceGrotesk = Space_Grotesk({
  subsets: ['latin'],
  weight: ['500', '700'],
  display: 'swap',
  variable: '--font-space-grotesk',
});

const shareTechMono = Share_Tech_Mono({
  subsets: ['latin'],
  weight: ['400'],
  display: 'swap',
  variable: '--font-share-tech-mono',
});

const caveat = Caveat({
  subsets: ['latin'],
  weight: ['600', '700'],
  display: 'swap',
  variable: '--font-caveat',
});
// import { TimeThemeSync } from '../components/time-theme-sync'; // [disabled 2026-06-24] 全项目固定白底,暗色主题暂不启用
import { messages } from '../messages/index';
import { LOCALE_COOKIE_NAME, parseLocaleCookie, type Locale } from '../lib/i18n';

export async function generateMetadata(): Promise<Metadata> {
  const cookieStore = await cookies();
  const locale = parseLocaleCookie(cookieStore.get(LOCALE_COOKIE_NAME)?.value) as Locale;
  const bundle = (messages as Record<string, Record<string, unknown>>)[locale] ?? messages['zh-CN'] ?? {};

  function lookup(obj: Record<string, unknown>, path: string): string {
    const parts = path.split('.');
    let cur: unknown = obj;
    for (const p of parts) {
      if (typeof cur !== 'object' || cur === null) return path;
      cur = (cur as Record<string, unknown>)[p];
    }
    return typeof cur === 'string' ? cur : path;
  }

  return {
    title: 'Ather',
    description: lookup(bundle, 'landing.tagline') ?? 'Ather',
  };
}

export default async function RootLayout({ children }: { children: ReactNode }) {
  const cookieStore = await cookies();
  const initialLocale: Locale = parseLocaleCookie(cookieStore.get(LOCALE_COOKIE_NAME)?.value);

  return (
    <html
      lang={initialLocale}
      suppressHydrationWarning
      className={`${inter.variable} ${spaceGrotesk.variable} ${shareTechMono.variable} ${caveat.variable}`}
      style={{
        ['--font-sans' as string]: 'var(--font-inter)',
        ['--font-display' as string]: 'var(--font-space-grotesk)',
        ['--font-mono' as string]: 'var(--font-share-tech-mono)',
        ['--font-handwriting' as string]: 'var(--font-caveat)',
      }}
    >
      <body>
        {/* [sketch-ui] 真实手绘边框抖动 SVG 滤镜 */}
        <svg style={{ position: 'absolute', width: 0, height: 0, pointerEvents: 'none' }} aria-hidden="true">
          <defs>
            <filter id="handdrawn-line-filter" x="-5%" y="-5%" width="110%" height="110%">
              <feTurbulence type="fractalNoise" baseFrequency="0.04" numOctaves="2" result="noise" />
              <feDisplacementMap in="SourceGraphic" in2="noise" scale="2" xChannelSelector="R" yChannelSelector="G" />
            </filter>
            <filter id="sketch-wobble" x="-10%" y="-10%" width="120%" height="120%">
              <feTurbulence type="fractalNoise" baseFrequency="0.03" numOctaves="2" result="noise" />
              <feDisplacementMap in="SourceGraphic" in2="noise" scale="3.5" xChannelSelector="R" yChannelSelector="G" />
            </filter>
          </defs>
        </svg>
        {/* <TimeThemeSync /> */} {/* [disabled 2026-06-24] 全项目固定白底 */}
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
