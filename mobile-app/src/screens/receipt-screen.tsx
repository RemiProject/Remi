import { useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { FoodPhotoField } from '@/components/food-photo-field';
import { AppText, Button, PageHeader, Screen } from '@/components/ui/core';
import { FormField } from '@/components/ui/form-field';
import { useLanguage } from '@/providers/language-provider';
import { useRemyTheme } from '@/theme/provider';
import { receiptMessages } from '@/i18n/receipt';
import { scanReceipt } from '@/services/receipt-ocr';
import type { ReceiptResult } from '@/services/receipt-ocr-core';
import { MAX_NAME_LENGTH } from '@/domain/inventory';

export default function ReceiptScreen() {
  const { language } = useLanguage(); const t = receiptMessages[language]; const { colors } = useRemyTheme();
  const [photoRef, setPhotoRef] = useState<string>();
  const [busy, setBusy] = useState(false); const [picking, setPicking] = useState(false);
  const [status, setStatus] = useState<ReceiptResult['status']>();
  const [text, setText] = useState(''); const [name, setName] = useState(''); const [invalid, setInvalid] = useState(false);
  const guard = useRef(false); const leaving = useRef(false);
  const process = async () => {
    if (!photoRef || guard.current || picking) return;
    guard.current = true; setBusy(true);
    try { const result = await scanReceipt(photoRef); setStatus(result.status); if (result.status === 'success' || result.status === 'empty') setText(result.text); }
    finally { guard.current = false; setBusy(false); }
  };
  const continueManual = (withName: boolean) => {
    if (guard.current || picking || leaving.current) return;
    const foodName = name.trim();
    if (withName && (!foodName || foodName.length > MAX_NAME_LENGTH)) { setInvalid(true); return; }
    leaving.current = true;
    router.replace(withName ? { pathname: '/food/manual', params: { initialName: foodName } } : '/food/manual');
  };
  return <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <Screen rtl={language === 'ar'} contentGap={16}>
        <PageHeader title={t.title} subtitle={t.intro} />
        <FoodPhotoField label={t.photo} note={t.limits} photoRef={photoRef} disabled={busy}
          onBusy={setPicking} onChange={(ref) => { setPhotoRef(ref); setStatus(undefined); setText(''); setName(''); setInvalid(false); }} />
        <Button label={busy ? t.scanning : t.scan} disabled={!photoRef || busy || picking} onPress={() => { void process(); }} />
        {busy && <AppText accessibilityLiveRegion="polite">{t.scanning}</AppText>}
        {status && <AppText accessibilityLiveRegion="polite" accessibilityRole={status === 'error' ? 'alert' : undefined}>{t[status]}</AppText>}
        {status && <>
          <FormField label={t.text} value={text} onChangeText={setText} multiline editable={!busy && !picking} />
          <FormField label={t.name} hint={t.hint} error={invalid ? t.required : undefined} value={name}
            onChangeText={(value) => { setName(value); setInvalid(false); }} editable={!busy && !picking} maxLength={MAX_NAME_LENGTH} />
          <Button label={t.continue} disabled={busy || picking} onPress={() => continueManual(true)} />
        </>}
        <Button label={t.manual} variant="secondary" disabled={busy || picking} onPress={() => continueManual(false)} />
        <Button label={t.cancel} variant="text" disabled={busy || picking} onPress={() => { if (!guard.current && !picking) { if (router.canGoBack()) router.back(); else router.replace('/food-entry'); } }} />
      </Screen>
    </KeyboardAvoidingView>
  </SafeAreaView>;
}
