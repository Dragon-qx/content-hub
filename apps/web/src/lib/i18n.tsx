'use client';

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  useCallback,
  ReactNode,
} from 'react';
import { zhCn, ZhCnKey } from './locales/zhCn';
import { en } from './locales/en';

export type Locale = 'zhCn' | 'en';

const LOCALE_KEY = 'content-hub.locale';
const DICTIONARIES: Record<Locale, Record<ZhCnKey, string>> = { zhCn, en };

// Translation helper. Keyspace mirrors zhCn. Supports {placeholders}.
// The key is typed as `string` (not the strict ZhCnKey union) so that dynamic
// lookups from label maps (e.g. STATUS_LABELS[x], `media.${type}`) compile
// without a cast. Missing keys fall back to the key itself, surfacing typos.
export function translate(
  dict: Record<ZhCnKey, string>,
  key: string,
  vars?: Record<string, string | number>,
): string {
  let value = (dict as Record<string, string>)[key] ?? zhCn[key as ZhCnKey] ?? key;
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      value = value.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v));
    }
  }
  return value;
}

interface I18nValue {
  locale: Locale;
  setLocale: (l: Locale) => void;
  // Key is `string`, not the strict ZhCnKey union, so dynamic lookups from
  // label maps (e.g. STATUS_LABELS[x], `media.${type}`) compile without casts.
  t: (key: string, vars?: Record<string, string | number>) => string;
}

const I18nContext = createContext<I18nValue | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>('zhCn');

  // Restore the saved locale on mount (client-only). Default is zhCn.
  useEffect(() => {
    const saved =
      typeof window !== 'undefined' ? (localStorage.getItem(LOCALE_KEY) as Locale | null) : null;
    if (saved && DICTIONARIES[saved]) setLocaleState(saved);
  }, []);

  // Keep <html lang> in sync for accessibility + SEO.
  useEffect(() => {
    if (typeof document !== 'undefined') {
      document.documentElement.lang = locale === 'zhCn' ? 'zh-CN' : 'en';
    }
  }, [locale]);

  const setLocale = useCallback((l: Locale) => {
    setLocaleState(l);
    if (typeof window !== 'undefined') localStorage.setItem(LOCALE_KEY, l);
  }, []);

  const value = useMemo<I18nValue>(() => {
    const dict = DICTIONARIES[locale];
    const t = (key: string, vars?: Record<string, string | number>) =>
      translate(dict, key, vars);
    return { locale, setLocale, t };
  }, [locale, setLocale]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useT(): I18nValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useT must be used within I18nProvider');
  return ctx;
}

// Convenience export so callers can switch language directly.
export function useLocale(): [Locale, (l: Locale) => void] {
  const { locale, setLocale } = useT();
  return [locale, setLocale];
}
