// Native rendering boundaries only; business logic remains real in callers.
exports.fixtureModule = function fixtureModule(id, native) {
  if (id === 'expo-image') return { Image: 'Image' };
  if (id.endsWith('cookbook-paper.png')) return 1;
  if (id === 'react-native-reanimated') return {
    __esModule: true,
    default: { createAnimatedComponent: component => component },
    useSharedValue: initial => { let value = initial; return { get: () => value, set: next => { value = next; } }; },
    useAnimatedStyle: style => new Proxy({}, { ownKeys: () => Reflect.ownKeys(style()), getOwnPropertyDescriptor: () => ({ enumerable: true, configurable: true }), get: (_, key) => style()[key] }),
    useReducedMotion: () => false, withTiming: value => value,
    Easing: { bezier: () => value => value },
  };
  return undefined;
};
