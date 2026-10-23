export const receiptMessages = {
  en: {
    title: 'Scan a receipt', intro: 'Choose a clear receipt photo, then review the extracted text.', photo: 'Receipt photo',
    scan: 'Extract text', scanning: 'Reading receipt…', text: 'Receipt text — review and correct',
    success: 'Text extracted. Check every line; confidence scores are not available.', empty: 'No text found. Try a clearer photo or enter food manually.',
    error: 'Could not read this receipt. Retry or choose another photo.',
    unavailable: 'OCR requires a native build with the receipt module. It is unavailable in Expo Go and web preview. You can still enter text manually.',
    limits: 'Android OCR supports Latin text only. Arabic recognition is not verified on iOS. No products or quantities are inferred.',
    name: 'Food name to add', hint: 'Copy or type one food name from the reviewed receipt. Enter quantity and storage on the next screen. The receipt photo is not attached to the food.',
    continue: 'Review food details', manual: 'Enter food manually', cancel: 'Cancel', required: 'Enter a food name of 1–100 characters.',
  },
  ar: {
    title: 'مسح إيصال', intro: 'اختر صورة واضحة للإيصال ثم راجع النص المستخرج.', photo: 'صورة الإيصال',
    scan: 'استخراج النص', scanning: 'جارٍ قراءة الإيصال…', text: 'نص الإيصال — راجعه وصححه',
    success: 'تم استخراج النص. تحقق من كل سطر؛ درجات الثقة غير متاحة.', empty: 'لم يُعثر على نص. جرّب صورة أوضح أو أدخل الطعام يدوياً.',
    error: 'تعذرت قراءة الإيصال. أعد المحاولة أو اختر صورة أخرى.',
    unavailable: 'يتطلب التعرف على النص بناءً أصلياً يتضمن وحدة الإيصالات. لا يتوفر في Expo Go أو معاينة الويب. يمكنك إدخال النص يدوياً.',
    limits: 'يدعم التعرف على أندرويد النص اللاتيني فقط. لم يُتحقق من التعرف على العربية في iOS. لا نستنتج منتجات أو كميات.',
    name: 'اسم الطعام المراد إضافته', hint: 'انسخ أو اكتب اسم طعام واحد من الإيصال بعد مراجعته. أدخل الكمية والتخزين في الشاشة التالية. لن تُرفق صورة الإيصال بالطعام.',
    continue: 'مراجعة تفاصيل الطعام', manual: 'إدخال الطعام يدوياً', cancel: 'إلغاء', required: 'أدخل اسم طعام من 1 إلى 100 حرف.',
  },
} as const;
