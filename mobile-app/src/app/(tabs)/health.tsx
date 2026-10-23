import { useLanguage } from '@/providers/language-provider';
import { appMessages } from '@/i18n/app';
import { FoundationScreen } from '@/components/foundation-screen';
export default function Health() {
  const { language } = useLanguage();
  const t = appMessages[language];
  return <FoundationScreen title={t.health} description={t.healthBody} />;
}
