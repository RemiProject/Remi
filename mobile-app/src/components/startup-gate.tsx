import { useState, type PropsWithChildren } from 'react';
import { useAuth } from '@/providers/auth-provider';
import { useLanguage } from '@/providers/language-provider';
import { useRemyTheme } from '@/theme/provider';
import { useRemyFonts } from '@/theme/fonts';
import { AppSkeleton } from './app-skeleton';

export function StartupGate({ children }: PropsWithChildren) {
  const auth = useAuth(), language = useLanguage(), theme = useRemyTheme(), fonts = useRemyFonts();
  const ready = auth.ready && (language.ready || language.error) && theme.ready && fonts.ready;
  const [opened, setOpened] = useState(false);
  if (ready && !opened) setOpened(true);
  // Later preference retries and session refreshes must not unmount navigation.
  return opened || ready ? children : <AppSkeleton />;
}
