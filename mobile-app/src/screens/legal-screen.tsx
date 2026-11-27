import { router, useLocalSearchParams } from 'expo-router';
import { View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppText, Button, PageHeader, Screen } from '@/components/ui/core';
import { legal, type LegalDoc } from '@/data/legal';
import { useLanguage } from '@/providers/language-provider';
import { useRemyTheme } from '@/theme/provider';

/** The privacy policy or terms, bundled so they read offline and before sign-in. */
export default function LegalScreen() {
  const { doc } = useLocalSearchParams<{ doc?: string }>();
  const { language } = useLanguage(); const ar = language === 'ar';
  const { colors } = useRemyTheme();
  const text = legal[(doc === 'terms' ? 'terms' : 'privacy') satisfies LegalDoc][language];
  return <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}><Screen rtl={ar}>
    <Button label={ar ? 'رجوع' : 'Back'} icon="back" rtl={ar} variant="text" onPress={() => router.canGoBack() ? router.back() : router.replace('/')} />
    <PageHeader title={text.title} subtitle={text.updated} />
    {text.sections.map(section => <View key={section.heading} style={{ gap: 8 }}>
      <AppText variant="heading" accessibilityRole="header">{section.heading}</AppText>
      {section.body.map(paragraph => <AppText key={paragraph}>{paragraph}</AppText>)}
    </View>)}
  </Screen></SafeAreaView>;
}
