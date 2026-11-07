import { useEffect, useRef, useState } from 'react';
import { Linking, Share } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { AppText, Button, Card, PageHeader, Screen } from '@/components/ui/core';
import { FormField } from '@/components/ui/form-field';
import { useLanguage } from '@/providers/language-provider';
import { useRemyTheme } from '@/theme/provider';
import { useAuth } from '@/providers/auth-provider';
import { intakeRequest, newIntakeId } from '@/services/intake-api';
import { intakeError } from './intake-shell';
export default function ContactScreen() {
  const { user } = useAuth();
  return <ContactBody key={user?.id ?? 'signed-out'} />;
}
interface Feedback { id: string; subject: string; message: string; createdAt: string }
function ContactBody() {
  const { language } = useLanguage(); const ar = language === 'ar';
  const { colors } = useRemyTheme();
  const { user } = useAuth();
  const [id, setId] = useState(newIntakeId);
  const [saved, setSaved] = useState(false);
  const [feedback, setFeedback] = useState<Feedback[]>([]);
  const guard = useRef(false);
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let active = true;
    if (user) intakeRequest<{ myCookbookFeedback: Feedback[] }>('query MyFeedback { myCookbookFeedback { id subject message createdAt } }').then(data => { if (active) setFeedback(data.myCookbookFeedback); }).catch(failure => { if (active) setError(intakeError(failure)); });
    return () => { active = false; };
  }, [user]);
  const save = async () => {
    if (guard.current || !user) return;
    guard.current = true; setBusy(true); setError('');
    try {
      const data = await intakeRequest<{ submitCookbookFeedback: Feedback }>('mutation SaveFeedback($input: SubmitCookbookFeedbackInput!) { submitCookbookFeedback(input: $input) { id subject message createdAt } }', { input: { id, subject: subject.trim() || 'Remi feedback', message: message.trim() } });
      setFeedback(values => [data.submitCookbookFeedback, ...values.filter(item => item.id !== id)].slice(0, 20)); setSaved(true);
    } catch (failure) { setError(intakeError(failure)); }
    finally { guard.current = false; setBusy(false); }
  };
  const address = process.env.EXPO_PUBLIC_SUPPORT_EMAIL?.trim();
  const validAddress = address && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address) ? address : null;
  const body = `${subject.trim()}\n\n${message.trim()}\n\nRemi Living Cookbook`;
  const send = async () => {
    if (busy) return;
    setBusy(true); setError('');
    try {
      if (validAddress) await Linking.openURL(`mailto:${encodeURIComponent(validAddress)}?subject=${encodeURIComponent(subject.trim() || 'Remi feedback')}&body=${encodeURIComponent(message.trim())}`);
      else await Share.share({ title: subject.trim() || 'Remi feedback', message: body });
    } catch (failure) { setError(intakeError(failure)); }
    finally { setBusy(false); }
  };
  return <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}><Screen rtl={ar}>
    <PageHeader title={ar ? 'التواصل والملاحظات' : 'Contact & feedback'} back={<Button label={ar ? 'رجوع' : 'Back'} icon="back" rtl={language === 'ar'} variant="text" onPress={() => router.canGoBack() ? router.back() : router.replace('/more')} />} />
    <AppText muted>{validAddress ? (ar ? 'افتح تطبيق البريد لمراجعة رسالتك وإرسالها بنفسك.' : 'Open your email app to review and send your message yourself.') : (ar ? 'لم يُضبط عنوان دعم لهذا الإصدار المستقل. اكتب ملاحظتك وصدّرها عبر قائمة المشاركة إلى الجهة التي تختارها.' : 'A support address has not been configured for this independent build. Write your feedback and export it through the share sheet to a recipient you choose.')}</AppText>
    <Card><FormField label={ar ? 'الموضوع' : 'Subject'} value={subject} editable={!busy} onChangeText={value => { setSubject(value); setSaved(false); setId(newIntakeId()); }} maxLength={120} /><FormField label={ar ? 'رسالتك' : 'Message'} value={message} editable={!busy} onChangeText={value => { setMessage(value); setSaved(false); setId(newIntakeId()); }} multiline maxLength={5000} />
      {error !== '' && <AppText accessibilityRole="alert">{error}</AppText>}
      {user ? <Button label={saved ? (ar ? 'حُفظت الملاحظة' : 'Feedback saved') : (ar ? 'حفظ ملاحظة للمشروع' : 'Save project feedback')} disabled={!message.trim() || busy || saved} onPress={() => { void save(); }} /> : <Button label={ar ? 'تسجيل الدخول لحفظ الملاحظة' : 'Sign in to save feedback'} onPress={() => router.push('/login')} />}
      {saved && <AppText accessibilityLiveRegion="polite">{ar ? 'حُفظت الملاحظة في قاعدة بيانات المشروع. لم يُرسل بريد إلكتروني.' : 'Saved in this project’s feedback inbox. No email was sent.'}</AppText>}
      <Button variant="secondary" label={validAddress ? (ar ? 'فتح البريد' : 'Open email') : (ar ? 'تصدير الملاحظة' : 'Export feedback')} disabled={!message.trim() || busy} onPress={() => { void send(); }} />
      <AppText variant="caption" muted>{ar ? 'لن نضيف بيانات حسابك أو مخزونك تلقائياً إلى الرسالة.' : 'Account and inventory data are not automatically included.'}</AppText>
    </Card>
    {feedback.length > 0 && <AppText variant="heading">{ar ? 'ملاحظاتك المحفوظة' : 'Your saved feedback'}</AppText>}
    {feedback.map(item => <Card key={item.id}><AppText variant="label">{item.subject}</AppText><AppText>{item.message}</AppText><AppText variant="caption" muted>{new Date(item.createdAt).toLocaleDateString(language)}</AppText></Card>)}
  </Screen></SafeAreaView>;
}
