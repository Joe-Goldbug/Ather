// apps/web/lib/i18n.ts
// Task 1: i18n runtime for Ather web
// Supports: zh-CN, ja, es, en
// Locale is persisted in localStorage and reflected in <html lang>

import { messages } from '../messages/index';
import { SUPPORTED_LOCALES, LOCALE_LABELS, type Locale } from '@ather/core/shared';

// NOTE: Locale and SUPPORTED_LOCALES are imported from @ather/core/shared/locales
export type { Locale };
export { SUPPORTED_LOCALES };

const LOCALE_NAMES: Record<Locale, string> = {
  'zh-CN': 'Chinese',
  en: 'English',
  ja: 'Japanese',
  es: 'Spanish',
};

const LOCALE_STORAGE_KEY = 'ather_locale';
export const LOCALE_COOKIE_NAME = 'ather_locale';
const LOCALE_BROWSER_MAP: Record<string, Locale> = {
  zh: 'zh-CN', 'zh-CN': 'zh-CN', 'zh-TW': 'zh-CN',
  en: 'en',
  ja: 'ja',
  es: 'es',
};

/** Detect the best initial locale from browser settings */
function detectBrowserLocale(): Locale {
  if (typeof navigator === 'undefined') return 'zh-CN';
  const browserLang = navigator.language ?? (navigator as unknown as { userLanguage?: string }).userLanguage ?? 'zh-CN';
  const short = browserLang.split('-')[0] ?? browserLang;
  return LOCALE_BROWSER_MAP[short] ?? 'en';
}

/** Get persisted locale from localStorage */
export function getStoredLocale(): Locale | null {
  if (typeof localStorage === 'undefined') return null;
  const stored = localStorage.getItem(LOCALE_STORAGE_KEY);
  if (stored && SUPPORTED_LOCALES.includes(stored as Locale)) return stored as Locale;
  return null;
}

/** Parse a cookie value into a validated Locale, falling back to 'zh-CN'. */
export function parseLocaleCookie(cookieValue: string | undefined): Locale {
  return SUPPORTED_LOCALES.includes(cookieValue as Locale) ? (cookieValue as Locale) : 'zh-CN';
}

/** Persist locale to localStorage */
export function setStoredLocale(locale: Locale): void {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(LOCALE_STORAGE_KEY, locale);
}

/** Get the effective locale (stored > browser > default) */
export function getEffectiveLocale(): Locale {
  return getStoredLocale() ?? detectBrowserLocale();
}

/** Get a locale label for display */
export function getLocaleLabel(locale: Locale): string {
  return LOCALE_LABELS[locale] ?? locale;
}

export function getLocaleName(locale: Locale): string {
  return LOCALE_NAMES[locale] ?? locale;
}

/** Map an app locale to a BCP 47 locale code for Intl APIs (Intl.DateTimeFormat etc.) */
const INTL_LOCALE_MAP: Record<Locale, string> = {
  'zh-CN': 'zh-CN',
  en: 'en-US',
  ja: 'ja-JP',
  es: 'es-ES',
};

export function getIntlLocale(locale: Locale): string {
  return INTL_LOCALE_MAP[locale] ?? 'zh-CN';
}

// ================================================================
// Translation function
// ================================================================

type MessageKey = string;

interface LocaleMessages {
  [key: string]: string | LocaleMessages;
}

/** Get a translation for a dot-notation key */
export function t(key: MessageKey, locale: Locale = 'zh-CN'): string {
  const msgs = messages[locale] ?? messages['zh-CN'] ?? {};
  const parts = key.split('.');
  let current: LocaleMessages | string = msgs;
  for (const part of parts) {
    if (typeof current !== 'object' || current === null) return key;
    current = current[part] ?? key;
  }
  return typeof current === 'string' ? current : key;
}

/** Expose locale label/names map for UI components */
export { LOCALE_LABELS };
