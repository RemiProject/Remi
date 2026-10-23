export const shoppingMessages = {
  en: {
    title: 'Shopping List', back: 'Back', add: 'Add item', edit: 'Edit item', remove: 'Delete item', all: 'All', toBuy: 'To buy', purchased: 'Purchased', search: 'Search shopping items',
    remaining: 'remaining', bought: 'purchased', empty: 'Your next shop starts here', emptyBody: 'Add what you need, one item at a time.', noResults: 'No matching items', noResultsBody: 'Change your search or filter.', reset: 'Clear search and filters',
    loading: 'Loading shopping list…', readError: 'Your shopping list could not be read. Saved data has not been replaced.', writeError: 'Could not save this change. Your saved list is unchanged. Retry the action.', retry: 'Retry',
    name: 'Item name (required)', quantity: 'Quantity (optional)', unit: 'Unit (optional)', category: 'Category (optional)', none: 'No category',
    nameError: 'Enter a name from 1 to 100 characters.', quantityError: 'Enter a positive number using digits 0–9 and a dot, such as 0.5, or leave blank.', unitError: 'Keep the unit within 24 characters.', categoryError: 'Choose a listed category or no category.',
    produce: 'Produce', dairy: 'Dairy', protein: 'Meat & fish', bakery: 'Bakery', pantry: 'Pantry', frozen: 'Frozen', other: 'Other',
    save: 'Save item', saving: 'Saving…', cancel: 'Cancel', clear: 'Clear purchased', confirmClear: 'Clear all purchased items?', confirmDelete: 'Delete this item?', irreversible: 'This removes the selected items from your saved shopping list. This cannot be undone.', confirm: 'Confirm removal',
    added: 'Item added.', updated: 'Item updated.', removed: 'Item removed.', cleared: 'Purchased items cleared.', changed: 'Purchase status updated.', mark: 'Mark purchased', unmark: 'Mark to buy', local: 'Saved on this device. Not synchronized with Kitchen or Meal Planner.',
  },
  ar: {
    title: 'قائمة التسوق', back: 'رجوع', add: 'إضافة عنصر', edit: 'تعديل العنصر', remove: 'حذف العنصر', all: 'الكل', toBuy: 'للشراء', purchased: 'تم الشراء', search: 'ابحث في قائمة التسوق',
    remaining: 'متبقي', bought: 'تم شراؤه', empty: 'تبدأ مشترياتك القادمة هنا', emptyBody: 'أضف ما تحتاج إليه، عنصراً تلو الآخر.', noResults: 'لا توجد عناصر مطابقة', noResultsBody: 'غيّر البحث أو الفلتر.', reset: 'مسح البحث والفلاتر',
    loading: 'جارٍ تحميل قائمة التسوق…', readError: 'تعذرت قراءة قائمة التسوق. لم تُستبدل البيانات المحفوظة.', writeError: 'تعذر حفظ التغيير. لم تتغير قائمتك المحفوظة. أعد المحاولة.', retry: 'إعادة المحاولة',
    name: 'اسم العنصر (مطلوب)', quantity: 'الكمية (اختياري)', unit: 'الوحدة (اختياري)', category: 'الفئة (اختياري)', none: 'بدون فئة',
    nameError: 'أدخل اسماً من 1 إلى 100 حرف.', quantityError: 'أدخل رقماً موجباً بالأرقام 0–9 والنقطة مثل 0.5، أو اتركه فارغاً.', unitError: 'يجب ألا تتجاوز الوحدة 24 حرفاً.', categoryError: 'اختر فئة من القائمة أو بدون فئة.',
    produce: 'خضراوات وفاكهة', dairy: 'ألبان', protein: 'لحوم وأسماك', bakery: 'مخبوزات', pantry: 'مواد جافة', frozen: 'مجمدات', other: 'أخرى',
    save: 'حفظ العنصر', saving: 'جارٍ الحفظ…', cancel: 'إلغاء', clear: 'مسح المشتريات', confirmClear: 'هل تريد مسح كل العناصر المشتراة؟', confirmDelete: 'هل تريد حذف هذا العنصر؟', irreversible: 'ستُحذف العناصر المحددة من قائمة التسوق المحفوظة. لا يمكن التراجع عن ذلك.', confirm: 'تأكيد الحذف',
    added: 'أُضيف العنصر.', updated: 'عُدّل العنصر.', removed: 'حُذف العنصر.', cleared: 'مُسحت العناصر المشتراة.', changed: 'حُدثت حالة الشراء.', mark: 'تحديد كمشترى', unmark: 'تحديد للشراء', local: 'تُحفظ على هذا الجهاز. لا توجد مزامنة مع المطبخ أو مخطط الوجبات.',
  },
} as const;
