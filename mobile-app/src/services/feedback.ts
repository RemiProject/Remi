/**
 * Haptics and sounds for things a person did: one cue per action, at the moment it lands, never on scroll or on
 * entrances nobody caused. Every cue has a visual twin elsewhere, so turning either off (Settings) loses nothing.
 *
 * Native modules load lazily and fail quietly, so the service is a no-op on web and in the Node test harnesses.
 * Sounds follow the ring/silent switch and mix with whatever else is playing.
 */
type Storage = { getItem(key: string): Promise<string | null>; setItem(key: string, value: string): Promise<void> };
type SoundName = 'tick' | 'pop' | 'success' | 'remove' | 'error';
export interface FeedbackSettings { sounds: boolean; haptics: boolean }

const KEY = 'remi.feedback.v1';
let settings: FeedbackSettings = { sounds: true, haptics: true };
const listeners = new Set<() => void>();
const players: Partial<Record<SoundName, any>> = {};
let audioReady: Promise<unknown> | null = null;

/** Literal requires (Metro bundles only those), each tried once. */
function lazy<T>(get: () => T): () => T | null {
  let value: T | null | undefined;
  return () => { if (value === undefined) { try { value = get(); } catch { value = null; } } return value; };
}
/* eslint-disable @typescript-eslint/no-require-imports */
const nativePlatform = lazy(() => (require('react-native') as typeof import('react-native')).Platform.OS);
const hapticsModule = lazy(() => require('expo-haptics') as typeof import('expo-haptics'));
const audioModule = lazy(() => require('expo-audio') as typeof import('expo-audio'));
const storage = lazy(() => (require('@react-native-async-storage/async-storage') as { default: Storage }).default);
/* eslint-enable @typescript-eslint/no-require-imports */
const isWeb = () => nativePlatform() !== 'ios' && nativePlatform() !== 'android';
const sources: Record<SoundName, () => number> = {
  tick: () => require('../../assets/sounds/tick.wav'),
  pop: () => require('../../assets/sounds/pop.wav'),
  success: () => require('../../assets/sounds/success.wav'),
  remove: () => require('../../assets/sounds/remove.wav'),
  error: () => require('../../assets/sounds/error.wav'),
};

type HapticsModule = typeof import('expo-haptics');
function haptic(run: (h: HapticsModule) => Promise<void>) {
  if (!settings.haptics || isWeb()) return;
  const haptics = hapticsModule();
  if (haptics) void run(haptics).catch(() => undefined);
}
function sound(name: SoundName) {
  if (!settings.sounds || isWeb()) return;
  const audio = audioModule();
  if (!audio) return;
  try {
    audioReady ??= audio.setAudioModeAsync({ playsInSilentMode: false, interruptionMode: 'mixWithOthers', allowsRecording: false, shouldPlayInBackground: false }).catch(() => undefined);
    const player = players[name] ??= audio.createAudioPlayer(sources[name]());
    player.volume = 0.6;
    void player.seekTo(0).then(() => player.play()).catch(() => undefined);
  } catch { /* no audio output: the haptic and the screen still confirm */ }
}

export const feedback = {
  /** A value ticked to another step: a tab, a chip, a stepper. Haptic only. */
  select: () => haptic(h => h.selectionAsync()),
  /** An item checked off or toggled on. */
  tick: () => { haptic(h => h.impactAsync(h.ImpactFeedbackStyle.Light)); sound('tick'); },
  /** Something added to a list or the kitchen. */
  pop: () => { haptic(h => h.impactAsync(h.ImpactFeedbackStyle.Light)); sound('pop'); },
  /** A save or a finished task. */
  success: () => { haptic(h => h.notificationAsync(h.NotificationFeedbackType.Success)); sound('success'); },
  /** Something removed or deleted. */
  remove: () => { haptic(h => h.impactAsync(h.ImpactFeedbackStyle.Medium)); sound('remove'); },
  /** It didn't work. */
  error: () => { haptic(h => h.notificationAsync(h.NotificationFeedbackType.Error)); sound('error'); },
};


export const feedbackSettings = {
  get: () => settings,
  subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
  async restore() {
    try { const raw = await storage()?.getItem(KEY); if (raw) { settings = { ...settings, ...JSON.parse(raw) as Partial<FeedbackSettings> }; listeners.forEach(l => l()); } }
    catch { /* defaults stay */ }
  },
  set(next: Partial<FeedbackSettings>) {
    settings = { ...settings, ...next }; listeners.forEach(l => l());
    void storage()?.setItem(KEY, JSON.stringify(settings)).catch(() => undefined);
  },
};
