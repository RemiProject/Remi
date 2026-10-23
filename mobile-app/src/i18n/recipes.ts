export const recipeMessages = {
  en: {
    title: 'Recipes', intro: 'Simple kitchen inspiration, one recipe at a time.', sample: 'Illustrative sample recipes · Not AI recommendations',
    search: 'Search recipe names or ingredients', all: 'Any time', quick: '10 min or less', twenty: '20 min or less', minutes: 'min',
    empty: 'No matching recipes', emptyBody: 'Try another ingredient or change the time filter.', clear: 'Clear search and filters',
    back: 'Back', browse: 'Browse recipes', missing: 'Recipe not found', missingBody: 'This sample recipe is not available.',
    ingredients: 'Ingredients', quantities: 'Ingredient quantities and servings are not specified in these samples. Adjust to your needs.',
    matchNote: 'Matches use saved food names only. Required quantities, freshness and suitability are not assessed.',
    matched: 'Matching saved food', notMatched: 'No matching saved food', loading: 'Loading saved inventory…',
    readError: 'Saved inventory is unavailable. Ingredient matches cannot be checked.', retry: 'Retry inventory',
    steps: 'Preparation steps', stepNote: 'Illustrative instructions. Step completion lasts only while this screen is open.',
    complete: 'Mark completed', undo: 'Mark remaining', completed: 'Completed', remaining: 'Remaining', progress: 'steps completed',
    photo: 'Illustrative recipe photo', open: 'Open recipe', viewAll: 'View all recipes', time: 'Estimated time',
  },
  ar: {
    title: 'الوصفات', intro: 'أفكار بسيطة للمطبخ، وصفة تلو الأخرى.', sample: 'وصفات توضيحية تجريبية · ليست توصيات ذكاء اصطناعي',
    search: 'ابحث باسم الوصفة أو المكونات', all: 'أي مدة', quick: '10 دقائق أو أقل', twenty: '20 دقيقة أو أقل', minutes: 'دقيقة',
    empty: 'لا توجد وصفات مطابقة', emptyBody: 'جرّب مكوناً آخر أو غيّر فلتر المدة.', clear: 'مسح البحث والفلاتر',
    back: 'رجوع', browse: 'تصفح الوصفات', missing: 'الوصفة غير موجودة', missingBody: 'هذه الوصفة التجريبية غير متاحة.',
    ingredients: 'المكونات', quantities: 'كميات المكونات وعدد الحصص غير محددين في هذه الأمثلة. عدّل حسب احتياجاتك.',
    matchNote: 'المطابقة حسب أسماء الطعام المحفوظة فقط. لا تُقيّم الكمية المطلوبة أو الطزاجة أو الملاءمة.',
    matched: 'طعام محفوظ مطابق', notMatched: 'لا يوجد طعام محفوظ مطابق', loading: 'جارٍ تحميل المخزون المحفوظ…',
    readError: 'المخزون المحفوظ غير متاح. لا يمكن التحقق من مطابقة المكونات.', retry: 'إعادة تحميل المخزون',
    steps: 'خطوات التحضير', stepNote: 'تعليمات توضيحية. تُحفظ حالة الخطوات أثناء فتح هذه الشاشة فقط.',
    complete: 'تحديد كمكتملة', undo: 'تحديد كمتبقية', completed: 'مكتملة', remaining: 'متبقية', progress: 'خطوات مكتملة',
    photo: 'صورة توضيحية للوصفة', open: 'فتح الوصفة', viewAll: 'عرض كل الوصفات', time: 'المدة التقديرية',
  },
} as const;

// Authored example instructions supplement the existing sample ideas, not an AI service.
export const sampleSteps = {
  en: {
    bowl: ['Prepare the rice following its package instructions.', 'Wash the spinach and drain it.', 'Wilt the spinach in a pan with a little water, stirring as needed.', 'Combine the prepared rice and spinach in a bowl and season to taste.'],
    breakfast: ['Wash the berries and drain them.', 'Spoon yogurt into a bowl.', 'Add oats and berries, then gently stir or layer them.', 'Serve your breakfast bowl.'],
  },
  ar: {
    bowl: ['حضّر الأرز باتباع تعليمات العبوة.', 'اغسل السبانخ وصفّها.', 'ليّن السبانخ في مقلاة مع قليل من الماء مع التقليب حسب الحاجة.', 'اجمع الأرز المحضّر والسبانخ في وعاء وأضف التوابل حسب ذوقك.'],
    breakfast: ['اغسل التوت وصفّه.', 'ضع الزبادي في وعاء.', 'أضف الشوفان والتوت ثم قلّب برفق أو رتّبها في طبقات.', 'قدّم وعاء الإفطار.'],
  },
} as const;
