import { SymbolView } from 'expo-symbols';
import { I18nManager, View } from 'react-native';
import { useRemyTheme } from '@/theme/provider';

const symbols = {
  filter: { ios: 'slider.horizontal.3', android: 'tune', web: 'tune' },
  check: { ios: 'checkmark', android: 'check', web: 'check' },
  home: { ios: 'house', android: 'home', web: 'home' },
  kitchen: { ios: 'refrigerator', android: 'kitchen', web: 'kitchen' },
  add: { ios: 'plus', android: 'add', web: 'add' },
  health: { ios: 'heart', android: 'favorite', web: 'favorite' },
  more: { ios: 'square.grid.2x2', android: 'grid_view', web: 'grid_view' },
  food: { ios: 'leaf', android: 'eco', web: 'eco' },
  recipe: { ios: 'fork.knife', android: 'restaurant', web: 'restaurant' },
  search: { ios: 'magnifyingglass', android: 'search', web: 'search' },
  chevron: { ios: 'chevron.right', android: 'chevron_right', web: 'chevron_right' },
  back: { ios: 'arrow.left', android: 'arrow_back', web: 'arrow_back' },
  camera: { ios: 'camera', android: 'photo_camera', web: 'photo_camera' },
  photo: { ios: 'photo', android: 'image', web: 'image' },
  receipt: { ios: 'doc.text', android: 'receipt_long', web: 'receipt_long' },
  manual: { ios: 'square.and.pencil', android: 'edit', web: 'edit' },
  clock: { ios: 'clock', android: 'schedule', web: 'schedule' },
  freezer: { ios: 'snowflake', android: 'ac_unit', web: 'ac_unit' },
  pantry: { ios: 'cabinet', android: 'inventory_2', web: 'inventory_2' },
  chat: { ios: 'bubble.left', android: 'chat_bubble', web: 'chat_bubble' },
  calendar: { ios: 'calendar', android: 'calendar_month', web: 'calendar_month' },
  shopping: { ios: 'basket', android: 'shopping_basket', web: 'shopping_basket' },
  bell: { ios: 'bell', android: 'notifications', web: 'notifications' },
  community: { ios: 'person.2', android: 'group', web: 'group' },
  profile: { ios: 'person.crop.circle', android: 'account_circle', web: 'account_circle' },
  settings: { ios: 'gearshape', android: 'settings', web: 'settings' },
  contact: { ios: 'envelope', android: 'mail', web: 'mail' },
  info: { ios: 'info.circle', android: 'info', web: 'info' },
} as const;
export type IconName = keyof typeof symbols;

export function Icon({ name, size = 22, color, rtl }: { name: IconName; size?: number; color?: string; rtl?: boolean }) {
  const { colors } = useRemyTheme();
  const directional = name === 'back' || name === 'chevron';
  return <View accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants"
    style={directional && (rtl ?? I18nManager.isRTL) ? { transform: [{ scaleX: -1 }] } : undefined}>
    <SymbolView name={symbols[name]} size={size} tintColor={color ?? colors.primary} />
  </View>;
}
