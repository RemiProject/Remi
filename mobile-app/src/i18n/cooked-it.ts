export const cookedItMessages = {
  en: {
    cooked: 'I cooked this', prompt: 'Remove ingredients from my kitchen?', yes: 'Yes', notNow: 'Not now', title: 'Remove ingredients',
    servings: 'How many servings did you make?', mealType: 'Meal type', amount: 'Amount', confirm: 'Confirm removal', saving: 'Removing…', cancel: 'Cancel',
    HAVE: 'Have', SHORT: 'Short', UNKNOWN: 'Quantity not checked', optional: 'Optional',
    unknownHint: 'Enter the amount in this kitchen unit, or uncheck this ingredient.',
    quantity: 'Enter a positive amount with up to 3 decimal places.', items: 'Select at least one ingredient.',
    available: 'You have {amount}', conversion: "This item can't be recorded here. Uncheck it and use 'Used' in Kitchen.",
    error: 'Could not record this meal. Your entries are kept. Please retry.', stale: 'Your account or household changed. Reopen this recipe.',
    refreshError: 'Ingredients were removed. Retry to refresh your kitchen; they will not be removed again.',
    removed: 'Removed from your kitchen', BREAKFAST: 'Breakfast', LUNCH: 'Lunch', DINNER: 'Dinner', SNACK: 'Snack', OTHER: 'Other',
  },
  ar: {
    cooked: 'طهيت هذه الوصفة', prompt: 'هل تريد إزالة المكونات من مطبخك؟', yes: 'نعم', notNow: 'ليس الآن', title: 'إزالة المكونات',
    servings: 'كم حصة أعددت؟', mealType: 'نوع الوجبة', amount: 'الكمية', confirm: 'تأكيد الإزالة', saving: 'جارٍ الإزالة…', cancel: 'إلغاء',
    HAVE: 'متوفر', SHORT: 'الكمية غير كافية', UNKNOWN: 'لم يتم التحقّق من الكمية', optional: 'اختياري',
    unknownHint: 'أدخل الكمية بوحدة التخزين المعروضة، أو ألغِ اختيار هذا المكوّن.',
    quantity: 'أدخل كمية موجبة لا تتجاوز 3 منازل عشرية.', items: 'اختر مكوّناً واحداً على الأقل.',
    available: 'لديك {amount}', conversion: 'لا يمكن تسجيل هذا المكوّن هنا. ألغِ اختياره واستخدم «استخدمت» في المطبخ.',
    error: 'تعذّر تسجيل الوجبة. احتُفظ بإدخالاتك. أعد المحاولة.', stale: 'تغيّر حسابك أو منزلك. أعد فتح هذه الوصفة.',
    refreshError: 'أُزيلت المكونات. أعد المحاولة لتحديث مطبخك؛ لن تُزال المكونات مرة أخرى.',
    removed: 'تمت إزالتها من مطبخك', BREAKFAST: 'الفطور', LUNCH: 'الغداء', DINNER: 'العشاء', SNACK: 'وجبة خفيفة', OTHER: 'أخرى',
  },
} as const;
