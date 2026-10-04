// packages/core/src/shared/locales.ts
// Single source of truth for locale configuration

export const SUPPORTED_LOCALES = ['zh-CN', 'en', 'ja', 'es'] as const;
export type Locale = typeof SUPPORTED_LOCALES[number];

export const LOCALE_LABELS: Record<Locale, string> = {
  'zh-CN': '简体中文',
  en: 'English',
  ja: '日本語',
  es: 'Español',
};
