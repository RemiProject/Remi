import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { photoStorage } from '@/services/photo-storage';
import { useLanguage } from '@/providers/language-provider';
import { foodEntryMessages } from '@/i18n/food-entry';
import { FoodImage } from './food-image';
import { AppText } from './ui/core';

export function ManagedFoodPhoto({ photoRef, height = 150 }: { photoRef: string; height?: number }) {
  const { language } = useLanguage();
  const t = foodEntryMessages[language];
  const [image, setImage] = useState<{ ref: string; uri: string | null } | null>(null);
  useEffect(() => {
    let active = true;
    let resolved: string | null = null;
    void photoStorage.resolve(photoRef).then((uri) => {
      if (!active) { if (uri) photoStorage.release(uri); return; }
      resolved = uri;
      setImage({ ref: photoRef, uri });
    }).catch(() => { if (active) setImage({ ref: photoRef, uri: null }); });
    return () => { active = false; if (resolved) photoStorage.release(resolved); };
  }, [photoRef]);
  const current = image?.ref === photoRef ? image : null;
  return <View><FoodImage uri={current?.uri ?? undefined} height={height} label={current && !current.uri ? t.photoUnavailable : t.photoPreview} />
    {current && !current.uri && height > 80 && <AppText variant="caption" muted>{t.photoUnavailable}</AppText>}
  </View>;
}
