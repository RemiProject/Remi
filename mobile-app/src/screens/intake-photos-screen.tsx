import { useCallback, useEffect, useState } from 'react';
import { router } from 'expo-router';
import { Image } from 'expo-image';
import { View } from 'react-native';
import { AppText, Button, Card, SectionHeader, uiStyles } from '@/components/ui/core';
import { FoodPhotoField } from '@/components/food-photo-field';
import { useAuth } from '@/providers/auth-provider';
import { useLanguage } from '@/providers/language-provider';
import { intakeRequest } from '@/services/intake-api';
import { uploadKitchenImage } from '@/services/intake-media';
import { IntakeShell, intakeError } from './intake-shell';
interface ArchivedImage { id: string; type: string; url: string; createdAt: string }
export default function IntakePhotosScreen() {
  const { user } = useAuth();
  const { language } = useLanguage();
  return <IntakeShell title={language === 'ar' ? 'صور المطبخ' : 'Kitchen photos'}><PhotosBody key={user?.id} /></IntakeShell>;
}
function PhotosBody() {
  const { language } = useLanguage(); const ar = language === 'ar';
  const [ref, setRef] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [picking, setPicking] = useState(false);
  const [images, setImages] = useState<ArchivedImage[]>([]);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const load = useCallback(async () => {
    const data = await intakeRequest<{ cookbookImages: ArchivedImage[] }>('query KitchenPhotos { cookbookImages { id type url createdAt } }');
    setImages(data.cookbookImages);
  }, []);
  useEffect(() => { let active = true; intakeRequest<{ cookbookImages: ArchivedImage[] }>('query KitchenPhotos { cookbookImages { id type url createdAt } }').then(data => { if (active) setImages(data.cookbookImages); }).catch(failure => { if (active) setError(intakeError(failure)); }); return () => { active = false; }; }, []);
  const upload = async () => {
    if (!ref || busy) return;
    setBusy(true); setError('');
    try { await uploadKitchenImage(ref, 'FOOD'); setSaved(true); await load(); }
    catch (failure) { setError(intakeError(failure)); }
    finally { setBusy(false); }
  };
  return <>
    <AppText muted>{ar ? 'التقط صورة أو اخترها لحفظها في أرشيف الأسرة. لا نتعرف تلقائياً على الطعام أو كميته من الصور.' : 'Take or choose a photo for your household archive. Photos do not automatically identify food or quantities.'}</AppText>
    <FoodPhotoField photoRef={ref} disabled={busy} onBusy={setPicking} onChange={value => { setRef(value); setSaved(false); }} />
    <Button label={saved ? (ar ? 'حُفظت الصورة' : 'Photo saved') : busy ? (ar ? 'جارٍ الرفع…' : 'Uploading…') : (ar ? 'حفظ صورة الطعام' : 'Save food photo')} disabled={!ref || busy || picking || saved} onPress={() => { void upload(); }} />
    <View style={uiStyles.wrap}><Button label={ar ? 'إضافة طعام يدوياً' : 'Add food manually'} variant="secondary" onPress={() => router.push('/food/manual')} /><Button label={ar ? 'مراجعة إيصال' : 'Review a receipt'} variant="text" onPress={() => router.push('/receipt')} /></View>
    {error !== '' && <AppText accessibilityRole="alert">{error}</AppText>}
    <SectionHeader title={ar ? 'أرشيف الأسرة' : 'Household archive'} action={ar ? 'تحديث' : 'Refresh'} onPress={() => { void load().catch(failure => setError(intakeError(failure))); }} />
    {!images.length && <AppText muted>{ar ? 'لا توجد صور محفوظة بعد.' : 'No saved photos yet.'}</AppText>}
    {images.map(image => <Card key={image.id}><Image source={{ uri: image.url }} style={{ width: '100%', height: 220, borderRadius: 12 }} contentFit="cover" accessibilityLabel={image.type === 'RECEIPT' ? (ar ? 'إيصال محفوظ' : 'Saved receipt') : (ar ? 'صورة طعام محفوظة' : 'Saved food photo')} /><AppText variant="caption" muted>{image.type === 'RECEIPT' ? (ar ? 'إيصال' : 'Receipt') : (ar ? 'صورة طعام' : 'Food photo')} · {new Date(image.createdAt).toLocaleDateString(language)}</AppText></Card>)}
  </>;
}
