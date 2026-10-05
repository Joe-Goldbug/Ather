// apps/web/messages/index.ts
// Task 1: i18n — locale message bundles
// All 4 locale bundles are imported and wired into the messages lookup table.

import { zhCN } from './zh-CN';
import { en } from './en';
import { ja } from './ja';
import { es } from './es';

// Infer the type from zh-CN as the canonical shape; minor field differences across
// locales are handled via loose Record<locale, object> reva than strict typing.
export const messages = {
  'zh-CN': zhCN,
  en,
  ja,
  es,
} as const;
