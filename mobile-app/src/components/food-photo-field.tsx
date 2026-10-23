import { useRef, useState, type ComponentType } from 'react';
import { View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { photoStorage } from '@/services/photo-storage';
import { foodEntryMessages } from '@/i18n/food-entry';
import { useLanguage } from '@/providers/language-provider';
import { useRemyTheme } from '@/theme/provider';
import { spacing } from '@/theme/tokens';
import { AppText, Button, uiStyles } from './ui/core';
import { ManagedFoodPhoto } from './managed-food-photo';

export function FoodPhotoField({ photoRef, disabled, onChange, onBusy, Actions, label, note }: { photoRef?: string; disabled: boolean; onChange: (ref?: string) => void; onBusy: (busy: boolean) => void; label?: string; note?: string; Actions?: ComponentType<{ takePhoto: () => void; choosePhoto: () => void; busy: boolean; photoRef?: string }> }) {
  const { language } = useLanguage();
  const t = foodEntryMessages[language];
  const { colors } = useRemyTheme();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<'permission' | 'photo' | 'large' | 'unreadable' | 'unsupported' | 'storage' | 'picker' | null>(null);
  const guard = useRef(false);
  const select = async (camera: boolean) => {
    if (disabled || guard.current) return;
    guard.current = true; setBusy(true); onBusy(true); setError(null);
    let stage: 'picker' | 'storage' = 'picker';
    try {
      if (camera && !(await ImagePicker.requestCameraPermissionsAsync()).granted) { setError('permission'); return; }
      const options: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 0.75, base64: false, exif: false, allowsMultipleSelection: false };
      const result = camera ? await ImagePicker.launchCameraAsync(options) : await ImagePicker.launchImageLibraryAsync(options);
      if (result.canceled) return;
      const asset = result.assets?.[0];
      // Android metadata can describe the original, not the compressed cache file.
      // Storage adapters validate the actual file/blob that will be persisted.
      if (!asset?.uri) { setError('unreadable'); return; }
      stage = 'storage';
      const ref = await photoStorage.save(asset.uri);
      onChange(ref);
    } catch (failure) {
      const message = failure instanceof Error ? failure.message : '';
      setError(message === 'Photo too large' ? 'large' : message === 'Photo unreadable' ? 'unreadable' : message === 'Unsupported photo' ? 'unsupported' : stage);
    }
    finally { guard.current = false; setBusy(false); onBusy(false); }
  };
  const errorText = { permission: t.photoPermission, photo: t.photoError, large: t.photoTooLarge, unreadable: t.photoUnreadable, unsupported: t.photoUnsupported, storage: t.photoStorageError, picker: t.photoPickerError };
  return <View style={{ gap: spacing.sm }}>
    <AppText variant="label">{label ?? t.photo}</AppText>
    {photoRef && <ManagedFoodPhoto photoRef={photoRef} />}
    {Actions ? <Actions takePhoto={() => { void select(true); }} choosePhoto={() => { void select(false); }} busy={disabled || busy} photoRef={photoRef} /> : <View style={uiStyles.wrap}>
      <Button label={t.takePhoto} icon="camera" variant="secondary" disabled={disabled || busy} onPress={() => { void select(true); }} />
      <Button label={photoRef ? t.replacePhoto : t.choosePhoto} icon="photo" variant="secondary" disabled={disabled || busy} onPress={() => { void select(false); }} />
      {photoRef && <Button label={t.removePhoto} variant="dangerText" disabled={disabled || busy} onPress={() => { setError(null); onChange(undefined); }} />}
    </View>}
    {busy && <AppText accessibilityLiveRegion="polite" variant="caption">{t.photoBusy}</AppText>}
    {error && <AppText accessibilityRole="alert" variant="caption" style={{ color: colors.errorText }}>{errorText[error]}</AppText>}
    <AppText variant="caption" muted>{note ?? t.photoNote}</AppText>
  </View>;
}
