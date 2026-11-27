# بيانات المشروع (Data Entry)

ملفات CSV في هذا المجلد هي مجموعة بيانات التطوير المستلمة من فريق المشروع. الاستيراد يستخدمها لإضافة أو تحديث الكتالوج والوصفات.

## محتويات المجموعة

| الملف | عدد الصفوف الجاهزة | المحتوى |
|---|---:|---|
| `foods.csv` | 800 | أصناف وأسماؤها العربية والبديلة ووحدات القياس |
| `food-safety-categories.csv` | 129 | ربط الأصناف بفئات الحساسية والأمان |
| `nutrition.csv` | 676 | القيم الغذائية لكل 100 جرام ومصدرها |
| `products.csv` | 79 | منتجات معبأة وباركود ومعلومات الملصق |
| `recipes.csv` | 400 | وصفات ومطبخها وعدد الحصص والأوقات |
| `recipe-ingredients.csv` | 3,523 | مكونات الوصفات وكمياتها |
| `recipe-steps.csv` | 1,384 | خطوات تحضير الوصفات |

أي سطر يبدأ بـ `#` هو تعليق ولا يُستورد. تنسيق الملفات UTF-8. عمود `food` يقبل الاسم الإنجليزي أو اسمًا عربيًا/بديلًا مسجلًا.

تتضمن فئات المرجع `SPICES` و`CONDIMENTS` و`SEEDS` و`SESAME`، والمطابخ `greek` و`mediterranean` و`french` و`spanish` و`turkish` و`moroccan` و`gulf` و`mexican` و`international`. أُضيفت هذه الأكواد إلى `prisma/seed/reference.seed.ts` حتى يقبلها المستورد.

## الفحص والاستيراد

نفّذ الأوامر من مجلد الباك إند وعلى قاعدة تطوير أو اختبار:

```bash
pnpm migrate
pnpm seed
pnpm data:check
pnpm data:import
```

`pnpm data:check` يتحقق من الملفات دون كتابة. الاستيراد كله معاملة واحدة: أي صف غير صالح يمنع كتابة المجموعة كلها. الاستيراد قابل لإعادة التشغيل ويحدّث الصفوف الموجودة حسب مفاتيحها. يستخدم `DATABASE_URL_MIGRATOR`، أو `DATABASE_URL` عند عدم ضبطه.

## ملفات تحتاج importer قبل تحميلها

الملفات الموجودة في `pending-import/` محفوظة للمراجعة، لكنها لا تدخل ضمن أوامر `data:check` و`data:import` الحالية:

- `food-substitutions.csv`
- `product-sources.csv`
- `health-conditions.csv`
- `dietary-rules.csv`
- `health-condition-diet-rules.csv`

تحتاج هذه الجداول إلى مسار استيراد ومراجعة قبل تحميلها. قواعد الصحة في التسليم معلّمة كغير نشطة.

## مراجعة قبل الإنتاج

فحص الاستيراد الآلي نجح للمجموعة، لكن هذا لا يثبت صحة البيانات الغذائية أو الملصقات أو فئات مسببات الحساسية. مصادر التغذية المسجلة هي USDA FoodData Central؛ يجب مراجعة مصادرها ومطابقة أسماء الأصناف ووسوم الحساسية والوصفات بواسطة مختص قبل استخدامها في توصيات إنتاجية. لا نعدّل قيم التغذية بالتخمين.

تأكد من صحة `grams_per_piece` و`density_g_per_ml` للأصناف التي ستُستخدم بوحدات القطعة أو الحجم. تصنيف الحساسية غير الصحيح قد يجعل صنفًا غير آمن يظهر على أنه آمن.


## Nutrition additions (version 3)

`nutrition-usda-additions.csv` lists each food added from USDA SR Legacy with its FDC ID and USDA description. `scripts/usda-nutrition-rows.py` reads the official SR Legacy CSVs and prints the matching `nutrition.csv` rows. It refuses to run if a description doesn't match the ID. A blank `fiber_g` or `sugar_g` means USDA didn't report that nutrient; it's stored as NULL (migration 0030), never as 0.

## Shelf life (version 3)

`foodkeeper-produce.psv` holds USDA FSIS FoodKeeper's fresh fruit and vegetable rows, copied unchanged: 102 rows from data version 128, CC0. The header records the source URL, byte size and SHA-256. `shelf-life.csv` maps 130 catalogue foods to a FoodKeeper row (`food,foodkeeper_id,note`). Only fresh, raw produce is mapped; foods FoodKeeper doesn't cover are left out rather than given a guessed figure.

The importer converts ranges to days (days 1, weeks 7, months 30, years 365), stores them in `FoodShelfLife` (migration 0031), and gives food already in kitchens an estimate when it has none. It never overwrites a date someone entered. How the dates are used is in `docs/shelf-life.md`.

Receipt aliases added to `foods.csv` for receipt matching:
- `full cream milk`, `fresh milk` and `milk` → whole milk.
- `romaine` and `romaine heart` → lettuce.
- `black bean` → black beans.
- The Arabic plurals صدور دجاج, أوراك دجاج and أجنحة دجاج.
