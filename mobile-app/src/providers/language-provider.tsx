import { createContext, useCallback, useContext, useEffect, useRef, useState, type PropsWithChildren } from 'react';
import { I18nManager } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { HomeLanguage } from '@/i18n/home';

export const LANGUAGE_KEY = 'remy.preferences.language';
const LanguageContext = createContext<{
  language: HomeLanguage; ready: boolean; saving: boolean; error: boolean;
  setLanguage: (language: HomeLanguage) => Promise<void>; retry: () => Promise<void>;
} | null>(null);
export function LanguageProvider({ children }: PropsWithChildren) {
  const [language, updateLanguage] = useState<HomeLanguage>(() => I18nManager.isRTL || Intl.DateTimeFormat().resolvedOptions().locale.startsWith('ar') ? 'ar' : 'en');
  const [ready, setReady] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(false);
  const queue = useRef<Promise<void>>(Promise.resolve());
  const reading = useRef<Promise<void> | null>(null);
  const busy = useRef(false);
  const retry = useCallback(() => {
    if (reading.current) return reading.current;
    setReady(false);
    setError(false);
    reading.current = AsyncStorage.getItem(LANGUAGE_KEY).then((value) => {
      if (value !== null && value !== 'en' && value !== 'ar') throw new Error('Invalid language preference');
      if (value) updateLanguage(value);
      setReady(true);
    }).catch(() => { setError(true); }).finally(() => { reading.current = null; });
    return reading.current;
  }, []);
  useEffect(() => { void retry(); }, [retry]);
  const setLanguage = async (next: HomeLanguage) => {
    if (!ready || busy.current || (next !== 'en' && next !== 'ar')) return;
    busy.current = true;
    setSaving(true);
    const operation = queue.current.then(async () => {
      try { await AsyncStorage.setItem(LANGUAGE_KEY, next); updateLanguage(next); setError(false); }
      catch { setError(true); }
      finally { busy.current = false; setSaving(false); }
    });
    queue.current = operation;
    await operation;
  };
  return <LanguageContext.Provider value={{ language, ready, saving, error, setLanguage, retry }}>{children}</LanguageContext.Provider>;
}
export function useLanguage() {
  const value = useContext(LanguageContext);
  if (!value) throw new Error('useLanguage requires LanguageProvider');
  return value;
}
