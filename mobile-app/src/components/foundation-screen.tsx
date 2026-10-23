import { useLanguage } from '@/providers/language-provider';
import { appMessages } from '@/i18n/app';
import type { PropsWithChildren } from 'react';
import { AppText, PageHeader, Screen } from './ui/core';

export function FoundationScreen({ title, description, children }: PropsWithChildren<{ title: string; description: string }>) {
  const { language } = useLanguage();
  return <Screen rtl={language === 'ar'}><PageHeader title={title} /><AppText muted>{description}</AppText>
    <AppText variant="caption" muted>{appMessages[language].notImplemented}</AppText>{children}</Screen>;
}