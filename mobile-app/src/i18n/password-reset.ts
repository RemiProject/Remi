const clock = (seconds: number) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;

/**
 * Forgot password in three steps: email, code, new password.
 * `invalidCode`, `expired`, `weakPassword`, `rateLimited`, `network` and `error` are the failure reasons of services/password-reset.ts.
 */
export const passwordResetMessages = {
  en: {
    // Step 1: email
    emailTitle: 'Forgot your password?', emailIntro: 'Enter the email of your Remi account. We’ll send you a 6-digit code.',
    email: 'Email', emailInvalid: 'Enter a valid email address.', sendCode: 'Send code', sending: 'Sending…',
    // Step 2: code
    codeTitle: 'Check your email.', codeIntro: 'If an account exists for this email, we sent a 6-digit code to it.',
    sentTo: (email: string) => `Code for ${email}`, changeEmail: 'Change email',
    code: 'Reset code', codeHint: 'The code is valid for 15 minutes.', codeFormat: 'Enter all 6 digits of the code.',
    verifyCode: 'Continue', verifying: 'Checking…',
    resend: 'Resend code', resendIn: (seconds: number) => `Resend in ${clock(seconds)}`,
    requested: 'If this email has an account, a new code is on its way. Only the newest code works.',
    spam: 'Can’t find it? Check your spam folder.',
    // Step 3: new password
    passwordTitle: 'Choose a new password.', passwordIntro: 'Use a password you don’t use anywhere else.',
    newPassword: 'New password', confirmPassword: 'Confirm new password', passwordMismatch: 'Your passwords don’t match. Please try again.',
    savePassword: 'Update password', saving: 'Updating…',
    // Done
    done: 'Your password has been updated.', doneLogin: 'Your password has been updated. Log in with your new password.',
    login: 'Log in', backToLogin: 'Back to log in',
    // Failures
    invalidCode: 'That code is wrong or expired. Check it or request a new one.',
    expired: 'This reset took too long and has expired. Request a new code.',
    weakPassword: 'Use 8–128 characters with an uppercase letter, a number and a special character.',
    rateLimited: 'Too many attempts. Please wait before trying again.',
    network: 'Could not reach Remi. Check your connection and try again.',
    error: 'Something went wrong. Please try again.',
  },
  ar: {
    // الخطوة 1: البريد الإلكتروني
    emailTitle: 'نسيت كلمة المرور؟', emailIntro: 'أدخل البريد الإلكتروني لحسابك في ريمي، وسنرسل إليك رمزًا من 6 أرقام.',
    email: 'البريد الإلكتروني', emailInvalid: 'أدخل بريدًا إلكترونيًا صالحًا.', sendCode: 'إرسال الرمز', sending: 'جارٍ الإرسال…',
    // الخطوة 2: الرمز
    codeTitle: 'راجع بريدك الإلكتروني.', codeIntro: 'إذا كان لهذا البريد حساب، فقد أرسلنا إليه رمزًا من 6 أرقام.',
    sentTo: (email: string) => `الرمز الخاص بالبريد ${email}`, changeEmail: 'تغيير البريد الإلكتروني',
    code: 'رمز إعادة التعيين', codeHint: 'الرمز صالح لمدة 15 دقيقة.', codeFormat: 'أدخل أرقام الرمز الستة كاملة.',
    verifyCode: 'متابعة', verifying: 'جارٍ التحقق…',
    resend: 'إعادة إرسال الرمز', resendIn: (seconds: number) => `إعادة الإرسال بعد ${clock(seconds)}`,
    requested: 'إذا كان لهذا البريد حساب، فسيصلك رمز جديد. أحدث رمز فقط هو الصالح.',
    spam: 'لم تجد الرسالة؟ راجع مجلد البريد غير المرغوب فيه.',
    // الخطوة 3: كلمة المرور الجديدة
    passwordTitle: 'اختر كلمة مرور جديدة.', passwordIntro: 'استخدم كلمة مرور لا تستخدمها في أي مكان آخر.',
    newPassword: 'كلمة المرور الجديدة', confirmPassword: 'تأكيد كلمة المرور الجديدة', passwordMismatch: 'كلمتا المرور غير متطابقتين. أعد المحاولة.',
    savePassword: 'تحديث كلمة المرور', saving: 'جارٍ التحديث…',
    // تم
    done: 'تم تحديث كلمة المرور.', doneLogin: 'تم تحديث كلمة المرور. سجّل الدخول باستخدام كلمة المرور الجديدة.',
    login: 'تسجيل الدخول', backToLogin: 'العودة إلى تسجيل الدخول',
    // الأخطاء
    invalidCode: 'الرمز غير صحيح أو انتهت صلاحيته. راجعه أو اطلب رمزًا جديدًا.',
    expired: 'استغرقت إعادة التعيين وقتًا طويلًا وانتهت صلاحيتها. اطلب رمزًا جديدًا.',
    weakPassword: 'استخدم من 8 إلى 128 حرفًا مع حرف إنجليزي كبير ورقم ورمز خاص.',
    rateLimited: 'محاولات كثيرة. انتظر قليلًا ثم أعد المحاولة.',
    network: 'تعذر الوصول إلى ريمي. تحقق من اتصالك وأعد المحاولة.',
    error: 'حدث خطأ ما. أعد المحاولة.',
  },
} as const;
