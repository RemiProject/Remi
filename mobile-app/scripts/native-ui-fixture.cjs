// Native rendering boundaries only; business logic remains real in callers.
const layoutBuilder = () => { const chain = new Proxy({}, { get: () => () => chain }); return chain; };
exports.fixtureModule = function fixtureModule(id, native) {
  if (id === '@/domain/nutrition' || id === '../domain/nutrition') return require('../src/domain/nutrition.ts');
  if (id === '@/i18n/recipe-names') return require('../src/i18n/recipe-names.ts');
  if (id === '@/i18n/recipe-content') return require('../src/i18n/recipe-content.ts');
  if (id === '@/i18n/catalog-labels') return require('../src/i18n/catalog-labels.ts');
  if (id === '@/i18n/catalog-food-names') return require('../src/i18n/catalog-food-names.ts');
  if (id === 'expo-image') return { Image: 'Image' };
  if (id === 'react-native-reanimated') return {
    __esModule: true,
    default: { createAnimatedComponent: component => component },
    useSharedValue: initial => { let value = initial; return { get: () => value, set: next => { value = next; } }; },
    useAnimatedStyle: style => new Proxy({}, { ownKeys: () => Reflect.ownKeys(style()), getOwnPropertyDescriptor: () => ({ enumerable: true, configurable: true }), get: (_, key) => style()[key] }),
    useReducedMotion: () => false, withTiming: value => value,
    Easing: { bezier: () => value => value },
    cubicBezier: () => 'ease-out', Extrapolation: { CLAMP: 'clamp' }, interpolate: () => 0,
    useAnimatedScrollHandler: () => () => {},
    // Layout animation builders are chainable and do nothing in tests.
    FadeIn: layoutBuilder(), FadeInDown: layoutBuilder(),
  };
  return undefined;
};
