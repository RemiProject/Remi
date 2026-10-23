import { expirationStatus, type InventoryItem } from '../domain/inventory';
import type { HomeLanguage } from './home';

export const inventoryMessages = {
  en: {
    title: 'Kitchen', saved: 'foods saved on this device', add: 'Add food', search: 'Search your food',
    storage: 'Storage', category: 'Category', all: 'All', sort: 'Sort within storage groups', name: 'Name', expiry: 'Expiration date',
    priority: 'Use First only', results: 'results', reset: 'Reset', empty: 'Start your kitchen',
    emptyBody: 'Add one food to track its quantity, storage and any dates you know.', first: 'Add your first food',
    none: 'No matching food', noneBody: 'Try a different name or reset your filters.', retry: 'Retry reading inventory',
    loading: 'Loading inventory…', unavailable: 'Inventory unavailable', notSaved: 'Inventory was not saved',
    readError: 'Saved inventory could not be read. Nothing has been replaced. Restore valid data or check storage access, then retry.',
    writeError: 'Your saved inventory has not changed. Check storage access and retry the original action.', saving: 'Saving inventory…',
    unknown: 'No expiration date', expired: 'Past entered expiration date', today: 'Expires today', soon: 'Expiring soon',
    expires: 'Expires', days: 'days', view: 'View saved food details', illustration: 'Category illustration',
    safety: 'Use First shows past dates and dates within 3 days. Dates are entered by you, not a food-safety assessment.',
    other: 'Other', produce: 'Produce', dairy: 'Dairy', protein: 'Protein', grains: 'Grains',
    refrigerator: 'Refrigerator', freezer: 'Freezer', pantry: 'Pantry', language: 'Language',
    preferenceLoading: 'Loading language preference…', preferenceError: 'Language preference could not be saved or loaded. Retry without changing saved inventory.',
    preferenceRetry: 'Retry language preference',
    filters: 'Filters', apply: 'Apply', clearFilters: 'Clear filters', clearSearch: 'Clear search', close: 'Close',
    noResultsHint: 'Try changing your search or filters.', settings: 'Settings', backMore: 'Back to More',
    settingsNote: 'Language updates supported screens. Appearance is saved on this device.',
  },
  ar: {
    title: 'المطبخ', saved: 'أطعمة محفوظة على هذا الجهاز', add: 'أضف طعاماً', search: 'ابحث عن طعامك',
    storage: 'مكان التخزين', category: 'الفئة', all: 'الكل', sort: 'الترتيب داخل كل مكان تخزين', name: 'الاسم', expiry: 'تاريخ الانتهاء',
    priority: 'أولوية الاستخدام فقط', results: 'نتائج', reset: 'إعادة الضبط', empty: 'ابدأ مطبخك',
    emptyBody: 'أضف طعاماً لمتابعة كميته ومكانه والتواريخ التي تعرفها.', first: 'أضف أول طعام',
    none: 'لا يوجد طعام مطابق', noneBody: 'جرّب اسماً مختلفاً أو أعد ضبط الفلاتر.', retry: 'أعد قراءة الطعام المحفوظ',
    loading: 'جارٍ تحميل الطعام…', unavailable: 'الطعام المحفوظ غير متاح', notSaved: 'لم يتم حفظ الطعام',
    readError: 'تعذّرت قراءة الطعام المحفوظ. لم يتم استبدال أي بيانات. استعد بيانات سليمة أو تحقق من التخزين ثم أعد المحاولة.',
    writeError: 'لم تتغير بياناتك المحفوظة. تحقق من التخزين وأعد تنفيذ العملية.', saving: 'جارٍ حفظ الطعام…',
    unknown: 'لا يوجد تاريخ انتهاء', expired: 'تجاوز تاريخ الانتهاء المدخل', today: 'ينتهي اليوم', soon: 'ينتهي قريباً',
    expires: 'ينتهي', days: 'أيام', view: 'عرض تفاصيل الطعام المحفوظ', illustration: 'رسم توضيحي للفئة',
    safety: 'تظهر التواريخ الماضية والتواريخ خلال ٣ أيام. التواريخ من إدخالك وليست تقييماً لسلامة الطعام.',
    other: 'أخرى', produce: 'خضروات وفاكهة', dairy: 'ألبان', protein: 'بروتين', grains: 'حبوب',
    refrigerator: 'الثلاجة', freezer: 'المجمّد', pantry: 'خزانة الطعام', language: 'اللغة',
    preferenceLoading: 'جارٍ تحميل تفضيل اللغة…', preferenceError: 'تعذّر تحميل أو حفظ اللغة. أعد المحاولة دون تغيير الطعام المحفوظ.',
    preferenceRetry: 'أعد تحميل تفضيل اللغة',
    filters: 'الفلاتر', apply: 'تطبيق', clearFilters: 'مسح الفلاتر', clearSearch: 'مسح البحث', close: 'إغلاق',
    noResultsHint: 'جرّب تغيير البحث أو الفلاتر.', settings: 'الإعدادات', backMore: 'العودة إلى المزيد',
    settingsNote: 'تتغير لغة الصفحات المدعومة. يُحفظ المظهر على هذا الجهاز.',
  },
} as const;
export function inventoryExpirationLabel(item: InventoryItem, today: string, language: HomeLanguage) {
  const state = expirationStatus(item, today);
  const t = inventoryMessages[language];
  if (state.kind === 'unknown') return t.unknown;
  if (state.kind === 'expired') return t.expired;
  if (state.kind === 'due') return t.today;
  if (state.days! <= 3) return `${t.soon} · ${state.days!.toLocaleString(language)} ${t.days}`;
  return `${t.expires} ${item.expirationDate}`;
}
