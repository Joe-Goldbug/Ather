// apps/web/app/providers-impl.tsx
// 'use client' — accepts SSR-provided initialLocale so hydration matches server render.

'use client';

import { createContext, useContext, useState, ReactNode } from 'react';
import { setStoredLocale, SUPPORTED_LOCALES, type Locale } from '../lib/i18n';
import { messages } from '../messages/index';
import { PageShell } from '../components/PageShell';

// ── Locale Context ──────────────────────────────────────────────────────────

interface LocaleContextValue {
  locale: Locale;
  setLocale: (l: Locale) => void;
  t: (key: string, vars?: Record<string, string | number>) => string;
}

const LocaleContext = createContext<LocaleContextValue>({
  locale: 'zh-CN',
  setLocale: () => {},
  t: () => '',
});

export function useLocale() {
  return useContext(LocaleContext);
}

// dots-to-object key lookup
function lookup(msg: Record<string, unknown>, path: string): string {
  const parts = path.split('.');
  let current: unknown = msg;
  for (const part of parts) {
    if (typeof current !== 'object' || current === null) return path;
    current = (current as Record<string, unknown>)[part];
  }
  return typeof current === 'string' ? current : path;
}

// Simple {key} template substitution
export function tpl(str: string, vars: Record<string, string | number>): string {
  return str.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? `{${k}}`));
}

// ── Locale Provider ────────────────────────────────────────────────────────

interface LocaleProviderProps {
  children: ReactNode;
  initialLocale: Locale;
}

function LocaleProvider({ children, initialLocale }: LocaleProviderProps) {
  const [locale, setLocaleState] = useState<Locale>(initialLocale);

  // initialLocale from cookie is the canonical source.
  // setLocale already syncs to both localStorage and cookie on write,
  // so the next SSR will pick up the correct value. No need to re-read
  // localStorage post-hydration (which causes tree re-render → RSC abort).

  const setLocale = (l: Locale) => {
    setStoredLocale(l);
    setLocaleState(l);
    document.documentElement.lang = l;
    document.cookie = `eva_locale=${l}; path=/; max-age=${60 * 60 * 24 * 365}; SameSite=Lax`;
  };

  const t = (key: string, vars?: Record<string, string | number>) => {
    const bundle = messages[locale] ?? messages['zh-CN'] ?? {};
    const raw = lookup(bundle as Record<string, unknown>, key);
    if (!vars) return raw;
    return tpl(raw, vars);
  };

  return (
    <LocaleContext.Provider value={{ locale, setLocale, t }}>
      {children}
    </LocaleContext.Provider>
  );
}

// ── Root Provider (exported, used by layout) ─────────────────────────────────

interface Props {
  children: ReactNode;
  initialLocale: Locale;
}

export function Providers({ children, initialLocale }: Props) {
  return (
    <LocaleProvider initialLocale={initialLocale}>
      <PageShell>{children}</PageShell>
    </LocaleProvider>
  );
}
