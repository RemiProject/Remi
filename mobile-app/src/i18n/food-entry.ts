import { isCalendarDate, MAX_NAME_LENGTH, MAX_NOTES_LENGTH, type FieldErrors, type FoodDraft } from '../domain/inventory';
import type { HomeLanguage } from './home';

export const foodEntryMessages = {
  en: {
    intakeNote: 'Take or choose a photo, review it, then enter the food details yourself. No food recognition is connected.', retake: 'Retake photo', usePhoto: 'Use photo and enter details',
    photoTooLarge: 'This prepared photo exceeds 20 MB. Choose a smaller image. Your previous photo is unchanged.',
    photoUnreadable: 'This photo could not be read. Choose another image. Your previous photo is unchanged.',
    photoUnsupported: 'Choose a JPEG, PNG, WebP, HEIC or AVIF image. Your previous photo is unchanged.',
    photoStorageError: 'Could not save the photo on this device. Check available storage and retry. Your previous photo is unchanged.',
    photoPickerError: 'Could not open or complete photo selection. Retry the camera or gallery. Your previous photo is unchanged.',
    photo: 'Food photo (optional)', takePhoto: 'Take photo', choosePhoto: 'Choose from gallery', replacePhoto: 'Replace photo', removePhoto: 'Remove photo',
    photoPreview: 'Saved food photo', photoUnavailable: 'Photo unavailable', photoBusy: 'Preparing photo…',
    photoNote: 'Optional. Photos stay on this device; they do not identify food automatically.',
    photoPermission: 'Camera permission is needed. Allow access in device settings or choose a gallery photo.',
    photoError: 'Could not prepare this photo. Choose a readable image under 20 MB and try again. Your previous photo is unchanged.',
    required: 'Required', requiredHint: 'Fields marked * are required.', optionalDetails: 'Optional details',
    optionalSummary: 'Purchase date, expiration date and notes', showDetails: 'Show details', hideDetails: 'Hide details',
    chooseUnit: 'Choose unit', changeUnit: 'Change unit', hideUnits: 'Hide unit choices',
    add: 'Add food', edit: 'Edit food', close: 'Close', back: 'Back', cancel: 'Cancel',
    start: 'Start with the details you know', intro: 'Enter a name, quantity and storage location. Dates and notes are optional.',
    manual: 'Add Manually', local: 'Saved only on this device.', localNote: 'Saved only on this device. No cloud sync.',
    methods: 'Other methods', unavailableNote: 'These methods are not available yet.', unavailable: 'Unavailable',
    camera: 'Take a Photo', gallery: 'Upload a Photo', receipt: 'Scan a Receipt',
    missing: 'Food not found', missingBody: 'This item may have been deleted or the link is invalid.', browse: 'Browse kitchen',
    name: 'Food name', nameExample: 'e.g. Baby spinach', category: 'Category', quantity: 'Quantity', quantityExample: 'e.g. 150',
    numericHint: 'Use digits 0–9 and a dot for decimals, such as 0.5.', unit: 'Unit', storage: 'Storage location',
    dates: 'Dates & notes', datesHint: 'Optional. Use YYYY-MM-DD with digits 0–9, or leave blank. Historical dates are accepted.',
    purchase: 'Purchase date (optional)', expiration: 'Expiration date (optional)', dateOrder: 'Expiration must be on or after the purchase date.',
    notesOptional: 'Notes (optional)', notes: 'Notes', notesHint: `Up to ${MAX_NOTES_LENGTH} characters. Only inventory-related notes.`,
    correct: 'Please correct the highlighted fields above.', announce: 'Review the form errors before saving.',
    saving: 'Saving…', save: 'Save food', saveChanges: 'Save changes',
    nameError: `Enter a food name (1–${MAX_NAME_LENGTH} characters).`, quantityError: 'Enter a positive quantity using digits 0–9 and a dot, such as 1 or 0.5. Arabic digits and decimal separators are not accepted.',
    categoryError: 'Choose a category.', unitError: 'Choose a unit.', storageError: 'Choose a storage location.',
    dateError: 'Enter a real calendar date as YYYY-MM-DD using digits 0–9, or leave blank.', notesError: `Keep notes within ${MAX_NOTES_LENGTH} characters.`,
    saveError: 'Could not save inventory. Your current data has not changed. Check device storage and retry.',
    invalidError: 'The food details are invalid. Review the form before saving.', missingError: 'This item no longer exists. Return to Kitchen.',
    loadingError: 'Inventory must finish loading successfully before changes can be saved.',
    purchased: 'Purchased', expires: 'Expiration', notEntered: 'Not entered',
    safety: 'Check the food and label before use. Dates are entered by you, not assessed by Remy.',
    delete: 'Delete food', deleting: 'Deleting…', deleteTitle: 'Delete this food?',
    deleteBody: 'It will be removed from your saved inventory. This cannot be undone.', keep: 'Keep food', thisFood: 'This food',
  },
  ar: {
    intakeNote: 'التقط صورة أو اخترها ثم راجعها وأدخل تفاصيل الطعام بنفسك. التعرف على الطعام غير متصل.', retake: 'إعادة التقاط الصورة', usePhoto: 'استخدام الصورة وإدخال التفاصيل',
    photoTooLarge: 'حجم الصورة المجهزة أكبر من 20 ميغابايت. اختر صورة أصغر. لم تتغير صورتك السابقة.',
    photoUnreadable: 'تعذرت قراءة الصورة. اختر صورة أخرى. لم تتغير صورتك السابقة.',
    photoUnsupported: 'اختر صورة بصيغة JPEG أو PNG أو WebP أو HEIC أو AVIF. لم تتغير صورتك السابقة.',
    photoStorageError: 'تعذر حفظ الصورة على هذا الجهاز. تحقق من مساحة التخزين وأعد المحاولة. لم تتغير صورتك السابقة.',
    photoPickerError: 'تعذر فتح اختيار الصورة أو إكماله. أعد المحاولة بالكاميرا أو المعرض. لم تتغير صورتك السابقة.',
    photo: 'صورة الطعام (اختياري)', takePhoto: 'التقاط صورة', choosePhoto: 'اختيار من المعرض', replacePhoto: 'استبدال الصورة', removePhoto: 'إزالة الصورة',
    photoPreview: 'صورة الطعام المحفوظة', photoUnavailable: 'الصورة غير متاحة', photoBusy: 'جارٍ تجهيز الصورة…',
    photoNote: 'اختياري. تبقى الصور على هذا الجهاز ولا تتعرف على الطعام تلقائياً.',
    photoPermission: 'يلزم السماح باستخدام الكاميرا. اسمح بالوصول من إعدادات الجهاز أو اختر صورة من المعرض.',
    photoError: 'تعذر تجهيز الصورة. اختر صورة قابلة للقراءة بحجم أقل من 20 ميغابايت وأعد المحاولة. لم تتغير صورتك السابقة.',
    required: 'مطلوب', requiredHint: 'الحقول المميزة بعلامة * مطلوبة.', optionalDetails: 'تفاصيل اختيارية',
    optionalSummary: 'تاريخ الشراء وتاريخ الانتهاء والملاحظات', showDetails: 'إظهار التفاصيل', hideDetails: 'إخفاء التفاصيل',
    chooseUnit: 'اختر وحدة', changeUnit: 'تغيير الوحدة', hideUnits: 'إخفاء خيارات الوحدة',
    add: 'إضافة طعام', edit: 'تعديل الطعام', close: 'إغلاق', back: 'رجوع', cancel: 'إلغاء',
    start: 'ابدأ بالتفاصيل التي تعرفها', intro: 'أدخل الاسم والكمية ومكان التخزين. التواريخ والملاحظات اختيارية.',
    manual: 'إضافة يدوية', local: 'يُحفظ على هذا الجهاز فقط.', localNote: 'يُحفظ على هذا الجهاز فقط. لا توجد مزامنة سحابية.',
    methods: 'طرق أخرى', unavailableNote: 'هذه الطرق غير متاحة حالياً.', unavailable: 'غير متاح',
    camera: 'التقاط صورة', gallery: 'اختيار صورة', receipt: 'مسح إيصال',
    missing: 'الطعام غير موجود', missingBody: 'ربما حُذف هذا الطعام أو أن الرابط غير صالح.', browse: 'تصفح المطبخ',
    name: 'اسم الطعام', nameExample: 'مثال: سبانخ', category: 'الفئة', quantity: 'الكمية', quantityExample: 'مثال: 150',
    numericHint: 'استخدم الأرقام 0–9 والنقطة للكسور، مثل 0.5.', unit: 'الوحدة', storage: 'مكان التخزين',
    dates: 'التواريخ والملاحظات', datesHint: 'اختياري. استخدم YYYY-MM-DD بالأرقام 0–9 أو اتركه فارغاً. تُقبل التواريخ السابقة.',
    purchase: 'تاريخ الشراء (اختياري)', expiration: 'تاريخ الانتهاء (اختياري)', dateOrder: 'يجب ألا يسبق تاريخ الانتهاء تاريخ الشراء.',
    notesOptional: 'ملاحظات (اختياري)', notes: 'ملاحظات', notesHint: `حتى ${MAX_NOTES_LENGTH} حرف. ملاحظات متعلقة بالمخزون فقط.`,
    correct: 'يرجى تصحيح الحقول الموضحة أعلاه.', announce: 'راجع أخطاء النموذج قبل الحفظ.',
    saving: 'جارٍ الحفظ…', save: 'حفظ الطعام', saveChanges: 'حفظ التغييرات',
    nameError: `أدخل اسم الطعام من 1 إلى ${MAX_NAME_LENGTH} حرف.`, quantityError: 'أدخل كمية موجبة بالأرقام 0–9 والنقطة، مثل 1 أو 0.5. لا تُقبل الأرقام العربية أو الفواصل العشرية العربية.',
    categoryError: 'اختر فئة.', unitError: 'اختر وحدة.', storageError: 'اختر مكان التخزين.',
    dateError: 'أدخل تاريخاً صحيحاً بصيغة YYYY-MM-DD بالأرقام 0–9 أو اتركه فارغاً.', notesError: `يجب ألا تتجاوز الملاحظات ${MAX_NOTES_LENGTH} حرف.`,
    saveError: 'تعذر حفظ المخزون. لم تتغير بياناتك الحالية. تحقق من مساحة تخزين الجهاز وأعد المحاولة.',
    invalidError: 'تفاصيل الطعام غير صالحة. راجع النموذج قبل الحفظ.', missingError: 'هذا الطعام لم يعد موجوداً. ارجع إلى المطبخ.',
    loadingError: 'يجب اكتمال تحميل المخزون بنجاح قبل حفظ التغييرات.',
    purchased: 'تاريخ الشراء', expires: 'تاريخ الانتهاء', notEntered: 'لم يُدخل',
    safety: 'تحقق من الطعام والملصق قبل الاستخدام. التواريخ أدخلتها أنت ولم يقيّمها ريمي.',
    delete: 'حذف الطعام', deleting: 'جارٍ الحذف…', deleteTitle: 'هل تريد حذف هذا الطعام؟',
    deleteBody: 'سيُحذف من مخزونك المحفوظ. لا يمكن التراجع عن ذلك.', keep: 'الاحتفاظ بالطعام', thisFood: 'هذا الطعام',
  },
} as const;

// Translate presentation only: domain validation and accepted input remain unchanged.
export function localizedFoodErrors(errors: FieldErrors, draft: FoodDraft, language: HomeLanguage): FieldErrors {
  const t = foodEntryMessages[language];
  const messages: Record<keyof FoodDraft, string> = {
    name: t.nameError, quantity: t.quantityError, categoryId: t.categoryError, unitId: t.unitError,
    storageId: t.storageError, purchaseDate: t.dateError, expirationDate: t.dateError, notes: t.notesError,
  };
  if (isCalendarDate(draft.purchaseDate) && isCalendarDate(draft.expirationDate) && draft.expirationDate < draft.purchaseDate) messages.expirationDate = t.dateOrder;
  return Object.fromEntries(Object.keys(errors).filter((key) => errors[key as keyof FoodDraft]).map((key) => [key, messages[key as keyof FoodDraft]]));
}

export function localizedInventoryError(message: string, language: HomeLanguage) {
  const t = foodEntryMessages[language];
  if (message === 'This item no longer exists. Return to Kitchen.') return t.missingError;
  if (message === 'The food details are invalid. Review the form before saving.') return t.invalidError;
  if (message === 'Inventory must finish loading successfully before changes can be saved.') return t.loadingError;
  return t.saveError;
}
