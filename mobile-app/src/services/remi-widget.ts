import type { RemiRingsProps } from '@/widgets/remi-rings';

/**
 * Sends today's rings to the home screen widget. The widget module loads lazily and only on iOS builds that include
 * the widget extension (it needs the App Group, see docs/release.md); anywhere else this does nothing.
 */
export function syncRemiWidget(props: RemiRingsProps) {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { Platform } = require('react-native') as typeof import('react-native');
    if (Platform.OS !== 'ios') return;
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const widget = (require('@/widgets/remi-rings') as typeof import('@/widgets/remi-rings')).default;
    widget.updateSnapshot(props);
  } catch { /* no widget extension in this build: the app itself is unaffected */ }
}
