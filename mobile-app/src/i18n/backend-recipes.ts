export const recipeCountUnitLabels = {
  en: {
    PIECE: { one: 'piece', other: 'pieces' },
    CUP: { one: 'cup', other: 'cups' },
  },
  ar: {
    PIECE: { zero: 'قطع', one: 'قطعة', two: 'قطعتان', few: 'قطع', many: 'قطعة', other: 'قطعة' },
    CUP: { zero: 'أكواب', one: 'كوب', two: 'كوبان', few: 'أكواب', many: 'كوب', other: 'كوب' },
  },
} as const;

export const backendRecipeMessages = {
  en: {
    cookingSignIn: 'Sign in to start cooking', cookingDone: 'Done',
    homeSignIn: 'Sign in for recipe ideas from your kitchen', homeEmpty: 'Add food to get recipe ideas', foodSearch: 'Search your food', foodNone: 'No food found. Try another name.',
    title: 'Recipes', intro: 'Ideas from the food in your kitchen.', back: 'Back', signIn: 'Sign in',
    signInTitle: 'Sign in to see recipes from your kitchen', signInBody: 'Suggestions use your household’s kitchen and your safety preferences.',
    loading: 'Loading recipes…', empty: 'Add food to your kitchen to get suggestions', emptyBody: 'Your household’s ingredients help us find recipes for you.', add: 'Add food',
    error: 'Could not load recipes. Check your connection and try again.', retry: 'Retry', more: 'Load more', refresh: 'Refresh',
    moreError: 'Could not load more recipes. Try again.', placeholder: 'Recipe image placeholder',
    have: 'You have {have} of {required}', missing: 'Missing: {foods}', expired: 'Expired: {foods}', uses: 'Uses your {food}, expires {when}',
    today: 'today', tomorrow: 'tomorrow', inDays: 'in {days} days', minutes: 'min', timeUnknown: 'Time not specified', servings: 'Servings: {count}',
    EASY: 'Easy', MEDIUM: 'Medium', HARD: 'Hard', warnings: 'Safety warnings', warningBody: 'Review these warnings before choosing this recipe.',
    ingredients: 'Ingredients', steps: 'Preparation steps', description: 'About this recipe',
    ENOUGH: 'Have', SHORT: 'Short by {amount}', MISSING: 'Missing', EXPIRED: 'Expired', UNKNOWN: 'Quantity not checked', ASSUMED: 'Assumed staple', optional: 'Optional',
    matchingLoading: 'Checking ingredients against your kitchen…', matchingUnavailable: 'Kitchen ingredient statuses are unavailable for this recipe.',
    matchingError: 'Could not check ingredient statuses. Your recipe is shown without them.', noSteps: 'No preparation steps provided.',
    ALLERGY_FOOD: 'Food allergy warning', ALLERGY_CATEGORY: 'Ingredient category allergy warning', HEALTH_AVOID: 'Health restriction warning',
    HEALTH_LIMIT: 'Health limit warning', HEALTH_PREFER: 'Health preference', DISLIKE_FOOD: 'Contains a food you dislike',
    DISLIKE_CATEGORY: 'Contains an ingredient category you dislike', DIETARY: 'Dietary preference warning', otherWarning: 'Review recipe suitability',
  },
  ar: {
    cookingSignIn: 'سجّل الدخول لبدء الطهي', cookingDone: 'تم',
    homeSignIn: 'سجّل الدخول للحصول على أفكار وصفات من مطبخك', homeEmpty: 'أضف طعاماً للحصول على أفكار وصفات', foodSearch: 'ابحث عن طعامك', foodNone: 'لم نجد طعاماً. جرّب اسماً آخر.',
    title: 'الوصفات', intro: 'أفكار من الطعام الموجود في مطبخك.', back: 'رجوع', signIn: 'تسجيل الدخول',
    signInTitle: 'سجّل الدخول لعرض وصفات من مطبخك', signInBody: 'تستند الاقتراحات إلى مطبخ منزلك وتفضيلات السلامة لديك.',
    loading: 'جارٍ تحميل الوصفات…', empty: 'أضف طعاماً إلى مطبخك للحصول على اقتراحات', emptyBody: 'تساعدنا مكونات مطبخك على اقتراح وصفات لك.', add: 'إضافة طعام',
    error: 'تعذّر تحميل الوصفات. تحقّق من الاتصال وحاول مرة أخرى.', retry: 'أعد المحاولة', more: 'عرض المزيد', refresh: 'تحديث',
    moreError: 'تعذّر تحميل المزيد من الوصفات. حاول مرة أخرى.', placeholder: 'صورة افتراضية للوصفة',
    have: 'لديك {have} من {required}', missing: 'المكونات الناقصة: {foods}', expired: 'منتهي الصلاحية: {foods}', uses: 'تستخدم {food} من مطبخك، وينتهي {when}',
    today: 'اليوم', tomorrow: 'غداً', inDays: 'خلال {days} أيام', minutes: 'دقيقة', timeUnknown: 'المدة غير محددة', servings: 'الحصص: {count}',
    EASY: 'سهلة', MEDIUM: 'متوسطة', HARD: 'صعبة', warnings: 'تنبيهات السلامة', warningBody: 'راجع هذه التنبيهات قبل اختيار الوصفة.',
    ingredients: 'المكونات', steps: 'خطوات التحضير', description: 'عن الوصفة',
    ENOUGH: 'متوفر', SHORT: 'ينقصك {amount}', MISSING: 'غير متوفر', EXPIRED: 'منتهي الصلاحية', UNKNOWN: 'لم يتم التحقّق من الكمية', ASSUMED: 'مكوّن أساسي يُفترض توفره', optional: 'اختياري',
    matchingLoading: 'جارٍ التحقّق من المكونات الموجودة في مطبخك…', matchingUnavailable: 'حالات المكونات في مطبخك غير متاحة لهذه الوصفة.',
    matchingError: 'تعذّر التحقّق من حالات المكونات. تُعرض الوصفة دونها.', noSteps: 'لا توجد خطوات تحضير مسجلة.',
    ALLERGY_FOOD: 'تنبيه بشأن حساسية طعام', ALLERGY_CATEGORY: 'تنبيه بشأن حساسية فئة مكونات', HEALTH_AVOID: 'تنبيه بشأن قيد صحي',
    HEALTH_LIMIT: 'تنبيه بشأن حد صحي', HEALTH_PREFER: 'تفضيل صحي', DISLIKE_FOOD: 'تحتوي على طعام لا تفضّله',
    DISLIKE_CATEGORY: 'تحتوي على فئة مكونات لا تفضّلها', DIETARY: 'تنبيه بشأن تفضيلاتك الغذائية', otherWarning: 'راجع ملاءمة الوصفة',
  },
} as const;
export function recipeText(template: string, values: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => values[key] ?? '');
}
