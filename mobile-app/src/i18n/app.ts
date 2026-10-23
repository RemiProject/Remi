import { menuItems } from '../data/feature-menu';

export const appMessages = {
  en: {
    home: 'Home', kitchen: 'Kitchen', add: 'Add', health: 'Health', more: 'More', addAction: 'Add food. Open entry chooser',
    moreSubtitle: 'Tools and preferences for your kitchen.', appearance: 'Appearance', system: 'System', light: 'Light', dark: 'Dark', session: 'Applies for this session.',
    previews: 'Browse your kitchen tools. Unavailable features are clearly marked.', unavailable: 'Currently unavailable', preview: 'Preview only', recipesAction: 'Browse sample recipes',
    settingsAction: 'Open settings', shoppingAction: 'Open shopping list', plannerAction: 'Open manual meal planner', notImplemented: 'Not implemented yet', missing: 'Feature not found', missingBody: 'This destination is not part of the current preview.',
    notice: 'This screen is an availability notice, not a working service.', backMore: 'Back to More', local: 'Remy 0.4.0 · Local inventory',
    healthBody: 'Nutrition features are planned. No health analysis or personalized recommendations are available.',
  },
  ar: {
    home: 'الرئيسية', kitchen: 'المطبخ', add: 'إضافة', health: 'الصحة', more: 'المزيد', addAction: 'إضافة طعام. فتح طرق الإضافة',
    moreSubtitle: 'أدوات وتفضيلات لمطبخك.', appearance: 'المظهر', system: 'النظام', light: 'فاتح', dark: 'داكن', session: 'يُطبق خلال هذه الجلسة.',
    previews: 'تصفح أدوات مطبخك. الميزات غير المتاحة موضحة بوضوح.', unavailable: 'غير متاح حالياً', preview: 'معاينة فقط', recipesAction: 'تصفح الوصفات التجريبية',
    settingsAction: 'فتح الإعدادات', shoppingAction: 'فتح قائمة التسوق', plannerAction: 'فتح مخطط الوجبات اليدوي', notImplemented: 'غير مطبق بعد', missing: 'الميزة غير موجودة', missingBody: 'هذه الوجهة ليست ضمن المعاينة الحالية.',
    notice: 'هذه الشاشة توضح حالة الإتاحة ولا تقدم خدمة عاملة.', backMore: 'الرجوع إلى المزيد', local: 'ريمي 0.4.0 · مخزون محلي',
    healthBody: 'ميزات التغذية مخطط لها. لا يتوفر تحليل صحي أو توصيات شخصية.',
  },
} as const;

export const menuGroupLabels = {
  en: { 'Plan & cook': 'Plan & cook', 'Stay connected': 'Stay connected', 'You & Remy': 'You & Remy' },
  ar: { 'Plan & cook': 'التخطيط والطهي', 'Stay connected': 'ابقَ على تواصل', 'You & Remy': 'أنت وريمي' },
};
export const featureMessages: Record<'en' | 'ar', Record<string, { title: string; description: string }>> = {
  en: Object.fromEntries(menuItems.map(({ id, title, description }) => [id, { title, description }])),
  ar: {
    chat: { title: 'محادثة ريمي', description: 'اطلب المساعدة في المطبخ. محادثة الذكاء الاصطناعي غير متصلة.' },
    recipes: { title: 'الوصفات', description: 'تصفح وصفات توضيحية واتبع خطوات تحضير تجريبية.' },
    planner: { title: 'مخطط الوجبات', description: 'خطط للوجبات يدوياً باستخدام الوصفات التجريبية المتاحة.' },
    cooking: { title: 'الطهي', description: 'اختر وصفة تجريبية وتابع خطواتها في وضع الطهي.' },
    leftovers: { title: 'بقايا الطعام', description: 'تتبع بقايا الطعام وأفكار استخدامها مخطط لهما.' },
    shopping: { title: 'قائمة التسوق', description: 'أدر قائمة تسوق يدوية محفوظة على هذا الجهاز.' },
    notifications: { title: 'الإشعارات', description: 'الإشعارات والتذكيرات غير مفعلة.' },
    community: { title: 'المجتمع', description: 'المجتمع غير متاح حالياً. المشاركة والمنشورات والتفاعلات الاجتماعية غير مطبقة.' },
    profile: { title: 'الملف الشخصي', description: 'الملفات الشخصية وتسجيل الدخول غير مطبقين.' },
    settings: { title: 'الإعدادات', description: 'اختر اللغة والمظهر المشتركين المحفوظين على هذا الجهاز.' },
    contact: { title: 'اتصل بنا', description: 'اتصل بنا غير متاح حالياً. لا يوجد نموذج دعم أو خدمة لإرسال الرسائل.' },
  },
};
