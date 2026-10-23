import { useRef, useState } from 'react';
import { FoodPhotoField } from '@/components/food-photo-field';
import { router } from 'expo-router';
import { View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ActionRow, AppText, Button, Card, PageHeader, Screen, SectionHeader } from '@/components/ui/core';
import { useRemyTheme } from '@/theme/provider';
import { useLanguage } from '@/providers/language-provider';
import { foodEntryMessages } from '@/i18n/food-entry';
import { spacing } from '@/theme/tokens';

export default function FoodEntryChooser() {
  const { language } = useLanguage();
  const t = foodEntryMessages[language];
  const rtl = language === 'ar';
  const [photoRef, setPhotoRef] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const { colors } = useRemyTheme();
  return <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}><Screen rtl={rtl}>
    <PageHeader title={t.add} action={<Button label={t.close} variant="text" disabled={busy} onPress={() => { if (!busyRef.current) { if (router.canGoBack()) router.back(); else router.replace('/'); } }} />} />
    <Card><AppText variant="heading">{t.start}</AppText>
      <AppText muted>{t.intro}</AppText>
      <Button label={t.manual} icon="manual" disabled={busy} onPress={() => router.replace('/food/manual')} />
      <AppText variant="caption" muted>{t.local}</AppText>
    </Card>
    <View style={{ gap: spacing.sm }}><SectionHeader title={t.methods} />
      <AppText variant="caption" muted>{t.intakeNote}</AppText>
      <FoodPhotoField photoRef={photoRef} disabled={false} onChange={setPhotoRef} onBusy={(value) => { busyRef.current = value; setBusy(value); }} Actions={IntakeActions} />
      {photoRef && <><Button label={t.usePhoto} disabled={busy} onPress={() => router.replace({ pathname: '/food/manual', params: { photoRef } })} /><Button label={t.removePhoto} variant="text" disabled={busy} onPress={() => setPhotoRef(undefined)} /></>}
      <Card style={{ padding: 0 }}><ActionRow rtl={rtl} title={t.receipt} icon="receipt" disabled={busy} onPress={() => router.push('/receipt')} /></Card>
    </View>
  </Screen></SafeAreaView>;
}
function IntakeActions({ takePhoto, choosePhoto, busy, photoRef }: { takePhoto: () => void; choosePhoto: () => void; busy: boolean; photoRef?: string }) {
 const { language } = useLanguage(); const t = foodEntryMessages[language]; const rtl = language === 'ar';
 return <Card style={{ padding: 0, gap: 0 }}><ActionRow rtl={rtl} title={photoRef ? t.retake : t.camera} icon="camera" disabled={busy} onPress={takePhoto} /><ActionRow rtl={rtl} title={photoRef ? t.replacePhoto : t.gallery} icon="photo" disabled={busy} onPress={choosePhoto} divider /></Card>;
}
