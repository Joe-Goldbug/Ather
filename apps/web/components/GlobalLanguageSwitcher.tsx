'use client';

import { useState, useRef, useEffect, useId } from 'react';
import { getLocaleLabel, type Locale } from '@/lib/i18n';
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
  const toggleRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const firstFocusRef = useRef(0);
  const menuId = useId();

  useEffect(() => {
    if (open) menuRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')[firstFocusRef.current]?.focus();
  }, [open]);

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
    <div ref={wrapperRef} className="global-lang"
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOpen(false);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Escape' && open) {
          e.preventDefault();
          e.stopPropagation();
          setOpen(false);
          toggleRef.current?.focus();
        }
      }}>
      <button
        ref={toggleRef}
        type="button"
        className="global-lang__toggle"
        aria-label={t('locale.select')}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => { firstFocusRef.current = 0; setOpen((v) => !v); }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            e.preventDefault();
            firstFocusRef.current = e.key === 'ArrowUp' ? MENU_LOCALES.length - 1 : 0;
            setOpen(true);
          }
        }}
      >
        <Globe size={18} />
        <span className="global-lang__code">{LOCALE_CODE[locale] ?? 'ZH'}</span>
      </button>

      {open && (
        <div ref={menuRef} id={menuId} className="global-lang__menu" role="menu" aria-label={t('locale.select')}
          onKeyDown={(e) => {
            const items = Array.from(e.currentTarget.querySelectorAll<HTMLButtonElement>('[role="menuitem"]'));
            const index = items.indexOf(document.activeElement as HTMLButtonElement);
            const next = e.key === 'Home' ? 0 : e.key === 'End' ? items.length - 1
              : e.key === 'ArrowDown' ? (index + 1) % items.length
              : e.key === 'ArrowUp' ? (index - 1 + items.length) % items.length : null;
            if (next !== null) { e.preventDefault(); items[next]?.focus(); }
          }}>
          {MENU_LOCALES.map((l) => (
            <button
              key={l}
              type="button"
              role="menuitem"
              tabIndex={-1}
              className={`global-lang__item${l === locale ? ' is-active' : ''}`}
              onClick={() => {
                setLocale(l);
                setOpen(false);
                toggleRef.current?.focus();
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
