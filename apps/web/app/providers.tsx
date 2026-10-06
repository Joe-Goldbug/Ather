// apps/web/app/providers.tsx
// Server component — reads eva_locale cookie and provides SSR-accurate initial locale.

import { cookies } from 'next/headers';
import { Providers } from './providers-impl';
import { LOCALE_COOKIE_NAME, parseLocaleCookie, type Locale } from '../lib/i18n';
import type { ReactNode } from 'react';

export default async function RootProviders({ children }: { children: ReactNode }) {
  const cookieStore = await cookies();
  const initialLocale: Locale = parseLocaleCookie(cookieStore.get(LOCALE_COOKIE_NAME)?.value);

  return <Providers initialLocale={initialLocale}>{children}</Providers>;
}
