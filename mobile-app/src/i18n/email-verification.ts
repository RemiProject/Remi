const clock = (seconds: number) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;

/** `invalidCode`, `rateLimited`, `network` and `error` are the failure reasons of services/email-verification.ts. */
export const emailVerificationMessages = {
  en: {
    title: 'Check your email.', intro: 'Enter the 6-digit code we sent to your email.', sentTo: (email: string) => `Code for ${email}`,
    introSend: 'Enter the 6-digit code from your verification email, or request a new one.',
    email: 'Email', emailHint: 'Enter the email address you signed up with.', emailInvalid: 'Enter a valid email address.',
    code: 'Verification code', codeHint: 'The code is valid for 15 minutes.', codeFormat: 'Enter all 6 digits of the code.',
    verify: 'Verify email', verifying: 'Verifying…', verified: 'Your email is verified. You can log in now.', alreadyVerified: 'Your email is verified.', backToProfile: 'Back to Profile',
    sendCode: 'Send code', resend: 'Resend code', resending: 'Sending…', resendIn: (seconds: number) => `Resend in ${clock(seconds)}`,
    requested: 'If this email still needs verifying, a new code is on its way. Only the newest code works.',
    spam: 'Can’t find it? Check your spam folder.', backToLogin: 'Back to log in',
    invalidCode: 'That code is wrong or expired. Check it or request a new one.',
    rateLimited: 'Too many attempts. Please wait before trying again.',
    network: 'Could not reach Remi. Check your connection and try again.',
    error: 'Something went wrong. Please try again.',
  },
  ar: {
    title: 'راجع بريدك الإلكتروني.', intro: 'أدخل الرمز المكوّن من 6 أرقام الذي أرسلناه إلى بريدك الإلكتروني.', sentTo: (email: string) => `الرمز الخاص بالبريد ${email}`,
    introSend: 'أدخل الرمز المكوّن من 6 أرقام من رسالة التحقق، أو اطلب رمزًا جديدًا.',
    email: 'البريد الإلكتروني', emailHint: 'أدخل البريد الإلكتروني الذي سجّلت به.', emailInvalid: 'أدخل بريدًا إلكترونيًا صالحًا.',
    code: 'رمز التحقق', codeHint: 'الرمز صالح لمدة 15 دقيقة.', codeFormat: 'أدخل أرقام الرمز الستة كاملة.',
    verify: 'تأكيد البريد', verifying: 'جارٍ التحقق…', verified: 'تم تأكيد بريدك الإلكتروني. يمكنك تسجيل الدخول الآن.', alreadyVerified: 'بريدك الإلكتروني مؤكَّد.', backToProfile: 'العودة إلى الملف الشخصي',
    sendCode: 'إرسال الرمز', resend: 'إعادة إرسال الرمز', resending: 'جارٍ الإرسال…', resendIn: (seconds: number) => `إعادة الإرسال بعد ${clock(seconds)}`,
    requested: 'إذا كان هذا البريد لا يزال بحاجة إلى تأكيد، فسيصلك رمز جديد. أحدث رمز فقط هو الصالح.',
    spam: 'لم تجد الرسالة؟ راجع مجلد البريد غير المرغوب فيه.', backToLogin: 'العودة إلى تسجيل الدخول',
    invalidCode: 'الرمز غير صحيح أو انتهت صلاحيته. راجعه أو اطلب رمزًا جديدًا.',
    rateLimited: 'محاولات كثيرة. انتظر قليلًا ثم أعد المحاولة.',
    network: 'تعذر الوصول إلى ريمي. تحقق من اتصالك وأعد المحاولة.',
    error: 'حدث خطأ ما. أعد المحاولة.',
  },
} as const;
