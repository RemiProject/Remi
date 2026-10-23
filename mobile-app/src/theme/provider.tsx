import { createContext, useContext, useEffect, useRef, useState, type PropsWithChildren } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { themes } from './tokens';

type Appearance = 'light' | 'dark' | 'system';
export const APPEARANCE_KEY = 'remy.preferences.appearance';
const validAppearance = (value: unknown): value is Appearance => value === 'light' || value === 'dark' || value === 'system';
const ThemeContext = createContext<{
  colors: (typeof themes)[keyof typeof themes];
  mode: 'light' | 'dark';
  appearance: Appearance;
  setAppearance: (value: Appearance) => void;
  saving: boolean;
  error: 'read' | 'write' | null;
} | null>(null);

export function RemyThemeProvider({ children }: PropsWithChildren) {
  const system = useColorScheme();
  const [appearance, updateAppearance] = useState<Appearance>('system');
  const [ready, setReady] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<'read' | 'write' | null>(null);
  const revision = useRef(0);
  const queue = useRef<Promise<void>>(Promise.resolve());
  useEffect(() => {
    let active = true;
    const initialRevision = revision.current;
    void AsyncStorage.getItem(APPEARANCE_KEY).then(value => {
      if (active && revision.current === initialRevision) updateAppearance(validAppearance(value) ? value : 'system');
    }).catch(() => {
      if (active && revision.current === initialRevision) setError('read');
    }).finally(() => { if (active) setReady(true); });
    return () => { active = false; };
  }, []);
  const setAppearance = (value: Appearance) => {
    if (!validAppearance(value)) return;
    const selection = ++revision.current;
    updateAppearance(value); setReady(true); setSaving(true); setError(null);
    // Serialize writes so rapid changes cannot restore an older selection on disk.
    queue.current = queue.current.then(() => AsyncStorage.setItem(APPEARANCE_KEY, value)).catch(() => {
      if (revision.current === selection) setError('write');
    }).finally(() => { if (revision.current === selection) setSaving(false); });
  };
  const mode = appearance === 'system' ? (system === 'dark' ? 'dark' : 'light') : appearance;
  // Mount themed content only after hydration; do not flash the system theme first.
  return <ThemeContext.Provider value={{ colors: themes[mode], mode, appearance, setAppearance, saving, error }}>{ready ? children : null}</ThemeContext.Provider>;
}

export function useRemyTheme() {
  const value = useContext(ThemeContext);
  if (!value) throw new Error('useRemyTheme requires RemyThemeProvider');
  return value;
}
