// apps/web/messages/weekly-pattern-keywords.ts
// Locale-specific keywords for the local weekly-review pattern detection
// fallback (apps/web/app/weekly-review/page.tsx -> detectPatterns).
//
// This is separate from the i18n message bundles because:
//   - It is detection logic, not user-facing UI copy
//   - The shapes are arrays, not strings, so they don't fit the
//     t(key, locale) translation table shape
//   - It needs to stay co-located with the regex usage in detectPatterns

import type { Locale } from '@eva/core/shared';

export interface PatternKeywords {
  /** Phrases that signal the user is overloaded / burnt out. */
  stress: string[];
  /** Phrases that signal the user is reaching out / connecting. */
  connection: string[];
  /** Phrases that signal the user made progress / hit a milestone. */
  achievement: string[];
  /** Phrases that signal the user is worried / uneasy. */
  anxiety: string[];
}

export const WEEKLY_PATTERN_KEYWORDS: Record<Locale, PatternKeywords> = {
  'zh-CN': {
    stress: ['累', '压力', '疲惫', '筋疲力尽'],
    connection: ['联系', '连接', '见面', '聊天', '交流'],
    achievement: ['进步', '突破', '做到', '完成', '达成'],
    anxiety: ['焦虑', '担心', '不安', '紧张', '压力'],
  },
  en: {
    stress: ['tired', 'exhausted', 'pressure', 'overwhelmed', 'fatigue'],
    connection: ['contact', 'connect', 'meet', 'chat', 'talked'],
    achievement: ['progress', 'breakthrough', 'achieved', 'completed', 'done'],
    anxiety: ['anxious', 'worried', 'uneasy', 'nervous', 'anxiety'],
  },
  ja: {
    stress: ['疲れ', 'ストレス', '疲労', 'きつい'],
    connection: ['連絡', 'つながり', '会う', '話した', '交流'],
    achievement: ['進歩', '突破', '達成', '完了', 'できた'],
    anxiety: ['不安', '心配', '緊張', 'モヤモヤ'],
  },
  es: {
    stress: ['cansado', 'agotado', 'presión', 'estrés', 'fatiga'],
    connection: ['contacto', 'conexión', 'encontré', 'hablé', 'charlé'],
    achievement: ['progreso', 'avance', 'logré', 'completé', 'conseguí'],
    anxiety: ['ansioso', 'preocupado', 'nervioso', 'inquieto', 'ansiedad'],
  },
};
