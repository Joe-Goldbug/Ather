'use client';

import { useState, useRef, useEffect } from 'react';
import { SUPPORTED_LOCALES, getLocaleLabel, type Locale } from '@/lib/i18n';
import { useLocale } from '@/app/providers-impl';
import { Globe } from 'lucide-react';

const LOCALE_CODE: Record<string, string> = {
  'zh-CN': 'ZH',
  en: 'EN',
  ja: 'JA',
  es: 'ES',
};

const MENU_LOCALES: readonly Locale[] = ['zh-CN', 'en', 'es', 'ja'];

export function GlobalLanguageSwitcher() {
  const { locale, setLocale, t } = useLocale();
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div ref={wrapperRef} className="global-lang">
      <button
        type="button"
        className="global-lang__toggle"
        aria-label={t('locale.select')}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <Globe size={18} />
        <span className="global-lang__code">{LOCALE_CODE[locale] ?? 'ZH'}</span>
      </button>

      {open && (
        <div className="global-lang__menu" role="menu" aria-label={t('locale.select')}>
          {MENU_LOCALES.map((l) => (
            <button
              key={l}
              type="button"
              role="menuitem"
              className={`global-lang__item${l === locale ? ' is-active' : ''}`}
              onClick={() => {
                setLocale(l);
                setOpen(false);
              }}
            >
              {getLocaleLabel(l)}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
