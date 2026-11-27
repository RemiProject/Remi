/**
 * The privacy policy and terms the app shows. docs/privacy-policy.md and docs/terms.md carry the same English text
 * for the App Store listing; scripts/test-legal.cjs fails when the two drift apart.
 */
export type LegalDoc = 'privacy' | 'terms';
export interface LegalText { title: string; updated: string; sections: { heading: string; body: string[] }[] }

export const LEGAL_UPDATED = '2026-11-08';

export const legal: Record<LegalDoc, Record<'en' | 'ar', LegalText>> = {
  privacy: {
    en: {
      title: 'Privacy policy',
      updated: 'Last updated 8 November 2026',
      sections: [
        { heading: 'In short', body: [
          'Remi keeps what you tell it about your kitchen so it can plan meals, track food and suggest recipes. It does not show ads, sell data, or track you across other apps and websites, and it has no third-party analytics.',
        ] },
        { heading: 'What Remi stores', body: [
          'Your account: name, email address, username, mobile number, country, language and timezone. Your password is stored only as a one-way hash.',
          'Your kitchen: the foods you add, their amounts, dates and storage places, shopping lists, meal plans, recipes you save, and the households you belong to.',
          'Food and health details, only when you enter them: allergies, health conditions, diets, foods you dislike, goals, weight entries and daily nutrition totals. Remi uses them only to filter and rank recipes and to warn you about allergens.',
          'Photos you choose to save, such as food or receipt photos. A receipt is read on your phone; only the recognised text lines are sent to match foods, and the photo is uploaded only if you tap Save receipt image.',
          'Recipe links you import: the server fetches that public page once to read the recipe, and keeps the link with the saved recipe.',
          'Feedback you send, and a notification token for your device if you allow notifications.',
        ] },
        { heading: 'Who sees it', body: [
          'Members of a household you belong to see that household’s kitchen, lists, plans and saved recipes, and your name. Your food and health details stay yours.',
          'Remi uses a small number of service providers to run: the server and photo storage host, the email service that sends password reset messages, and Apple and Google push services to deliver notifications. They process data only to provide that service.',
        ] },
        { heading: 'How long it is kept', body: [
          'Your data is kept while your account exists. Sign-in sessions expire on their own. Server backups are kept for no longer than 30 days, so deleted data leaves them within that time.',
        ] },
        { heading: 'Deleting your account', body: [
          'Open More, then Your account, then Delete account, and confirm with your password. Remi removes your profile, food and health details, goals, devices, notifications, feedback and sign-ins at once. A household you share passes to the next member; a household only you use is closed. Food you added to a shared household stays with that household, credited to a deleted user.',
        ] },
        { heading: 'Your choices and rights', body: [
          'You can change or remove most details in the app. To get a copy of your data, correct it, or ask any question about it, write to the support address in Feedback & support. Depending on where you live you may also have the right to object to processing or to complain to your data protection authority.',
        ] },
        { heading: 'Children', body: [
          'Remi is not meant for children under 13, and does not knowingly collect their data.',
        ] },
        { heading: 'Changes', body: [
          'If this policy changes, the date above changes with it, and the app tells you about important changes before they apply.',
        ] },
      ],
    },
    ar: {
      title: 'سياسة الخصوصية',
      updated: 'آخر تحديث ٨ نوفمبر ٢٠٢٦',
      sections: [
        { heading: 'باختصار', body: [
          'يحفظ ريمي ما تخبره به عن مطبخك ليخطط وجباتك ويتابع طعامك ويقترح الوصفات. لا يعرض إعلانات ولا يبيع البيانات ولا يتتبعك عبر التطبيقات والمواقع الأخرى، ولا يستخدم أدوات تحليل من أطراف أخرى.',
        ] },
        { heading: 'ما يحفظه ريمي', body: [
          'حسابك: الاسم والبريد الإلكتروني واسم المستخدم ورقم الهاتف والدولة واللغة والمنطقة الزمنية. تُحفظ كلمة المرور على شكل تجزئة لا يمكن عكسها فقط.',
          'مطبخك: الأطعمة التي تضيفها وكمياتها وتواريخها وأماكن حفظها، وقوائم التسوق، وخطط الوجبات، والوصفات التي تحفظها، والأسر التي تنتمي إليها.',
          'تفاصيل الطعام والصحة، عند إدخالها فقط: الحساسيات والحالات الصحية والأنظمة الغذائية والأطعمة التي لا تحبها والأهداف والوزن والتغذية اليومية. يستخدمها ريمي فقط لتصفية الوصفات وترتيبها وتنبيهك إلى مسببات الحساسية.',
          'الصور التي تختار حفظها، مثل صور الطعام أو الإيصالات. يُقرأ الإيصال على هاتفك، ولا يُرسل إلا نص السطور لمطابقة الأطعمة، ولا تُرفع الصورة إلا إذا ضغطت حفظ صورة الإيصال.',
          'روابط الوصفات التي تستوردها: يجلب الخادم تلك الصفحة العامة مرة واحدة لقراءة الوصفة، ويحفظ الرابط مع الوصفة.',
          'الملاحظات التي ترسلها، ورمز الإشعارات لجهازك إذا سمحت بالإشعارات.',
        ] },
        { heading: 'من يراها', body: [
          'يرى أعضاء الأسرة التي تنتمي إليها مطبخها وقوائمها وخططها ووصفاتها المحفوظة واسمك. أما تفاصيل طعامك وصحتك فتبقى لك.',
          'يستعين ريمي بعدد قليل من مزودي الخدمات: مستضيف الخادم وتخزين الصور، وخدمة البريد التي ترسل رسائل إعادة تعيين كلمة المرور، وخدمتي الإشعارات من Apple وGoogle. يعالجون البيانات لتقديم تلك الخدمة فقط.',
        ] },
        { heading: 'مدة الحفظ', body: [
          'تُحفظ بياناتك ما دام حسابك موجودًا. تنتهي جلسات الدخول تلقائيًا. لا تُحفظ النسخ الاحتياطية للخادم أكثر من ٣٠ يومًا، فتخرج البيانات المحذوفة منها خلال تلك المدة.',
        ] },
        { heading: 'حذف حسابك', body: [
          'افتح المزيد ثم حسابك ثم حذف الحساب، وأكّد بكلمة المرور. يحذف ريمي فورًا ملفك الشخصي وتفاصيل طعامك وصحتك وأهدافك وأجهزتك وإشعاراتك وملاحظاتك وجلساتك. تنتقل الأسرة المشتركة إلى العضو التالي، وتُغلق الأسرة التي تستخدمها وحدك. يبقى الطعام الذي أضفته إلى أسرة مشتركة لدى تلك الأسرة منسوبًا إلى مستخدم محذوف.',
        ] },
        { heading: 'خياراتك وحقوقك', body: [
          'يمكنك تعديل معظم التفاصيل أو حذفها من التطبيق. للحصول على نسخة من بياناتك أو تصحيحها أو لأي سؤال عنها، راسل عنوان الدعم في الملاحظات والدعم. وقد يحق لك بحسب مكان إقامتك الاعتراض على المعالجة أو تقديم شكوى إلى جهة حماية البيانات.',
        ] },
        { heading: 'الأطفال', body: [
          'ريمي غير موجّه للأطفال دون ١٣ عامًا، ولا يجمع بياناتهم عن علم.',
        ] },
        { heading: 'التغييرات', body: [
          'إذا تغيرت هذه السياسة يتغير التاريخ أعلاه معها، ويخبرك التطبيق بالتغييرات المهمة قبل سريانها.',
        ] },
      ],
    },
  },
  terms: {
    en: {
      title: 'Terms of use',
      updated: 'Last updated 8 November 2026',
      sections: [
        { heading: 'Using Remi', body: [
          'Remi helps you keep track of the food in your kitchen, plan meals and cook. You need to be at least 13 to use it, and you are responsible for keeping your password safe.',
        ] },
        { heading: 'Food safety and health', body: [
          'Expiry estimates, allergen warnings, nutrition figures and suggestions are estimates from averages and from the details you enter. They are not medical or dietary advice. Always check the food itself and its label, and ask a professional about allergies and health conditions.',
        ] },
        { heading: 'Your content', body: [
          'What you add to Remi stays yours. You let Remi store and process it only to run the service for you and your household.',
          'When you import a recipe from a website, Remi saves it for your household’s own cooking. The recipe and its photo still belong to their author; respect the site’s terms and do not republish it.',
        ] },
        { heading: 'Fair use', body: [
          'Do not misuse Remi: no attempts to reach other people’s data, overload the service, or use it for anything unlawful. Remi may limit or suspend an account that does.',
        ] },
        { heading: 'The service', body: [
          'Remi is provided as it is, and may change or have interruptions. To the extent the law allows, Remi is not liable for indirect losses, or for food that spoils or causes harm. Nothing here limits rights you have by law.',
        ] },
        { heading: 'Ending', body: [
          'You can stop using Remi and delete your account at any time from Your account. If these terms change, the date above changes with them.',
        ] },
      ],
    },
    ar: {
      title: 'شروط الاستخدام',
      updated: 'آخر تحديث ٨ نوفمبر ٢٠٢٦',
      sections: [
        { heading: 'استخدام ريمي', body: [
          'يساعدك ريمي على متابعة الطعام في مطبخك وتخطيط الوجبات والطهي. يجب ألا يقل عمرك عن ١٣ عامًا، وأنت مسؤول عن الحفاظ على كلمة المرور.',
        ] },
        { heading: 'سلامة الطعام والصحة', body: [
          'تقديرات الصلاحية وتنبيهات الحساسية وأرقام التغذية والاقتراحات مبنية على متوسطات وعلى ما تدخله، وليست نصيحة طبية أو غذائية. افحص الطعام وملصقه دائمًا، واستشر مختصًا بشأن الحساسية والحالات الصحية.',
        ] },
        { heading: 'محتواك', body: [
          'ما تضيفه إلى ريمي يبقى ملكك. وتسمح لريمي بحفظه ومعالجته فقط لتشغيل الخدمة لك ولأسرتك.',
          'عند استيراد وصفة من موقع، يحفظها ريمي لطبخ أسرتك. تبقى الوصفة وصورتها ملكًا لصاحبها؛ احترم شروط الموقع ولا تعِد نشرها.',
        ] },
        { heading: 'الاستخدام العادل', body: [
          'لا تسئ استخدام ريمي: لا محاولات للوصول إلى بيانات الآخرين أو إثقال الخدمة أو استخدامها لأي غرض غير قانوني. قد يقيّد ريمي الحساب الذي يفعل ذلك أو يوقفه.',
        ] },
        { heading: 'الخدمة', body: [
          'يُقدَّم ريمي كما هو، وقد يتغير أو يتوقف أحيانًا. في الحدود التي يسمح بها القانون، لا يتحمل ريمي الخسائر غير المباشرة أو ضرر الطعام الفاسد. لا شيء هنا يقيّد حقوقك القانونية.',
        ] },
        { heading: 'الإنهاء', body: [
          'يمكنك التوقف عن استخدام ريمي وحذف حسابك في أي وقت من حسابك. إذا تغيرت هذه الشروط يتغير التاريخ أعلاه معها.',
        ] },
      ],
    },
  },
};
