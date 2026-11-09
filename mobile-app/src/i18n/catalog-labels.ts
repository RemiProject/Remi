import type { Unit } from '../services/kitchen-api';

const labels: Readonly<Record<string, string>> = {
  Egyptian: 'مصري', Asian: 'آسيوي', Italian: 'إيطالي', Indian: 'هندي', American: 'أمريكي', Lebanese: 'لبناني', Mexican: 'مكسيكي', Turkish: 'تركي', Greek: 'يوناني', French: 'فرنسي', Mediterranean: 'متوسطي', Moroccan: 'مغربي', Gulf: 'خليجي', Chinese: 'صيني', Japanese: 'ياباني', Thai: 'تايلاندي', Korean: 'كوري', Spanish: 'إسباني', British: 'بريطاني',
  'Type 2 Diabetes': 'السكري من النوع الثاني', Hypertension: 'ارتفاع ضغط الدم', 'Chronic Kidney Disease': 'مرض الكلى المزمن', 'Celiac Disease': 'الداء البطني',
  BREAKFAST: 'الإفطار', LUNCH: 'الغداء', DINNER: 'العشاء', SNACK: 'وجبة خفيفة', OTHER: 'أخرى',
  MAINTAIN: 'الحفاظ على الوزن', LOSE_WEIGHT: 'خسارة الوزن', GAIN_MUSCLE: 'بناء العضلات', CUSTOM: 'مخصص',
  VEGETARIAN: 'نباتي', VEGAN: 'نباتي صرف', HALAL: 'حلال', GLUTEN_FREE: 'خالٍ من الجلوتين', DAIRY_FREE: 'خالٍ من الألبان', KETO: 'كيتو', LOW_CARB: 'قليل الكربوهيدرات',
  MILD: 'خفيفة', MODERATE: 'متوسطة', SEVERE: 'شديدة', LIFE_THREATENING: 'مهددة للحياة',
  ACTIVE: 'نشط', RESOLVED: 'انتهت', INACTIVE: 'غير نشط', OWNER: 'مالك', MEMBER: 'عضو',
  'Kitchen shopping': 'مشتريات المطبخ',
  Grains: 'الحبوب', 'Oils & Fats': 'الزيوت والدهون', 'Spices, Herbs & Seasonings': 'التوابل والأعشاب', Vegetables: 'الخضروات', Fruits: 'الفاكهة', Dairy: 'منتجات الألبان', Meat: 'اللحوم', Poultry: 'الدواجن', Seafood: 'المأكولات البحرية', Legumes: 'البقوليات', 'Nuts & Seeds': 'المكسرات والبذور', 'Bakery & Bread': 'الخبز والمخبوزات', 'Eggs & Egg Products': 'البيض ومنتجاته', 'Dairy & Alternatives': 'الألبان وبدائلها', 'Fish & Seafood': 'الأسماك والمأكولات البحرية', 'Meat & Poultry': 'اللحوم والدواجن', 'Sugars & Sweets': 'السكريات والحلويات', Beverages: 'المشروبات', 'Sauces & Condiments': 'الصلصات والإضافات',
};
export function catalogLabel(value: string, language: 'en' | 'ar'): string {
  return language === 'ar' ? labels[value] ?? value : value;
}
export function localizedUnit(unit: Unit, language: 'en' | 'ar'): string {
  const units = language === 'ar'
    ? { GRAM: 'غ', KILOGRAM: 'كغ', MILLILITER: 'مل', LITER: 'لتر', PIECE: 'قطعة', CUP: 'كوب', TABLESPOON: 'ملعقة كبيرة', TEASPOON: 'ملعقة صغيرة' }
    : { GRAM: 'g', KILOGRAM: 'kg', MILLILITER: 'ml', LITER: 'l', PIECE: 'pcs', CUP: 'cups', TABLESPOON: 'tbsp', TEASPOON: 'tsp' };
  return units[unit];
}
