import { useRef, useState } from 'react';
import { Keyboard, KeyboardAvoidingView, Platform, Pressable, View } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppText, Button, Card, PageHeader, Screen, uiStyles } from '@/components/ui/core';
import { FormField } from '@/components/ui/form-field';
import { Icon } from '@/components/ui/icon';
import { shoppingLines } from '@/domain/shopping';
import { useShopping } from '@/providers/shopping-provider';
import { useLanguage } from '@/providers/language-provider';
import { useRemyTheme } from '@/theme/provider';

export default function QuickShoppingScreen() {
  const shopping = useShopping(); const { language } = useLanguage(); const ar = language === 'ar'; const { colors } = useRemyTheme();
  const [text, setText] = useState(''); const [message, setMessage] = useState(''); const lock = useRef(false);
  const perform = async (work: () => Promise<void>, saving = false) => {
    if (lock.current) return; lock.current = true; setMessage('');
    try { await work(); if (saving) { setText(''); Keyboard.dismiss(); setMessage(ar ? 'حُفظت قائمتك.' : 'Your list is saved.'); } }
    catch { setMessage(ar ? 'تعذر الحفظ. احتفظنا بما كتبته؛ حاول مجددًا.' : 'Could not save. Your entries are kept; please retry.'); }
    finally { lock.current = false; }
  };
  const save = () => {
    try { shoppingLines(text); }
    catch { setMessage(ar ? 'اكتب عنصرًا في كل سطر، حتى ٥٠ عنصرًا و١٠٠ حرف لكل عنصر.' : 'Use one item per line, up to 50 items and 100 characters each.'); return; }
    void perform(() => shopping.addLines(text), true);
  };
  const ready = shopping.status === 'ready';
  return <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}><KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}><Screen rtl={ar}>
    <PageHeader title={ar ? 'قائمة سريعة' : 'Quick list'} action={<Button label={ar ? 'رجوع' : 'Back'} icon="back" rtl={ar} variant="text" onPress={() => router.canGoBack() ? router.back() : router.replace('/')} />} />
    <AppText muted>{ar ? 'تُحفظ على هذا الجهاز. استخدم قائمة الأسرة لمشاركة العناصر.' : 'Saved on this device. Use the household list to share items.'}</AppText>
    <FormField label={ar ? 'ما الذي تحتاجه؟' : 'What do you need?'} hint={ar ? 'عنصر في كل سطر، حتى ٥٠ عنصرًا و١٠٠ حرف لكل عنصر.' : 'One item per line, up to 50 items and 100 characters each.'} placeholder={ar ? 'حليب\nبيض\nطماطم' : 'Milk\nEggs\nTomatoes'} multiline value={text} onChangeText={setText} editable={ready && !shopping.pending} maxLength={5100} />
    <Button label={ar ? 'حفظ القائمة' : 'Save list'} icon="check" disabled={!ready || shopping.pending || !text.trim()} onPress={save} />
    {!!message && <AppText accessibilityLiveRegion="polite">{message}</AppText>}
    {!ready && <Card><AppText accessibilityLiveRegion="polite">{shopping.status === 'error' ? (ar ? 'تعذر تحميل قائمتك.' : 'Could not load your list.') : (ar ? 'جارٍ التحميل…' : 'Loading…')}</AppText>{shopping.status === 'error' && <Button label={ar ? 'حاول مجددًا' : 'Try again'} onPress={() => { void shopping.retry(); }} />}</Card>}
    {shopping.items.map(item => <View key={item.id} style={[uiStyles.row, { gap: 8 }]}>
      <Pressable accessibilityRole="checkbox" accessibilityLabel={item.name} accessibilityState={{ checked: item.purchased, disabled: shopping.pending }} disabled={shopping.pending} onPress={() => { void perform(() => shopping.toggle(item.id)); }} style={{ flex: 1, minHeight: 52, flexDirection: ar ? 'row-reverse' : 'row', alignItems: 'center', gap: 12 }}>
        <View style={{ width: 26, height: 26, borderRadius: 6, borderWidth: 1, borderColor: colors.primary, alignItems: 'center', justifyContent: 'center' }}>{item.purchased && <Icon name="check" size={18} />}</View>
        <AppText style={{ flex: 1, textDecorationLine: item.purchased ? 'line-through' : 'none' }} muted={item.purchased}>{item.name}{item.quantity !== undefined ? ` · ${item.quantity} ${item.unit ?? ''}` : ''}</AppText>
      </Pressable>
      <Button label={ar ? 'إزالة' : 'Remove'} variant="text" disabled={shopping.pending} onPress={() => { void perform(() => shopping.remove(item.id)); }} />
    </View>)}
  </Screen></KeyboardAvoidingView></SafeAreaView>;
}
