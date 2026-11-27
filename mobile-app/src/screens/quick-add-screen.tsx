import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ActionRow, AppText, Button, Card, PageHeader, Screen } from '@/components/ui/core';
import { useLanguage } from '@/providers/language-provider';
import { useRemyTheme } from '@/theme/provider';

export default function QuickAddScreen() {
  const { language } = useLanguage(); const ar = language === 'ar'; const { colors } = useRemyTheme();
  return <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}><Screen rtl={ar}>
    <PageHeader title={ar ? 'إضافة سريعة' : 'Quick add'} action={<Button label={ar ? 'إغلاق' : 'Close'} variant="text" onPress={() => router.canGoBack() ? router.back() : router.replace('/')} />} />
    <AppText muted>{ar ? 'اشتريت طعامًا أم تخطط للتسوق؟' : 'Just shopped, or planning your next trip?'}</AppText>
    <Card style={{ padding: 0, gap: 0 }}>
      <ActionRow title={ar ? 'مسح إيصال' : 'Scan a receipt'} subtitle={ar ? 'صوّر مشترياتك وراجعها قبل إضافتها للمطبخ.' : 'Capture purchased items and review them before adding to Kitchen.'} icon="receipt" rtl={ar} onPress={() => router.replace('/receipt')} />
      <ActionRow title={ar ? 'إضافة عنصر تحتاجه' : 'Add a needed item'} subtitle={ar ? 'اختر الطعام والكمية لقائمة الأسرة.' : 'Choose food and quantity for your household shopping list.'} icon="shopping" rtl={ar} divider onPress={() => router.replace({ pathname: '/feature', params: { feature: 'shopping', add: '1' } })} />
      <ActionRow title={ar ? 'كتابة قائمة سريعة' : 'Write a quick list'} subtitle={ar ? 'عنصر في كل سطر. تُحفظ على هذا الجهاز.' : 'One item per line. Saved on this device.'} icon="manual" rtl={ar} divider onPress={() => router.replace('/quick-shopping')} />
    </Card>
    <Card style={{ padding: 0, gap: 0 }}>
      <ActionRow title={ar ? 'حفظ وصفة من رابط' : 'Save a recipe from a link'} subtitle={ar ? 'الصق رابط وصفة، ويحفظها ريمي في وصفاتي.' : 'Paste a recipe link and Remi keeps it in My recipes.'} icon="recipe" rtl={ar} onPress={() => router.replace('/import-recipe')} />
    </Card>
  </Screen></SafeAreaView>;
}
