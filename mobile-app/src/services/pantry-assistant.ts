export interface AssistantStock { foodId: string; foodName: string; quantity: string; unit: string; estimatedExpiryAt: string | null; storageLocation: string }
export interface AssistantRecipe { id: string; name: string; ingredients: { foodId: string; foodName: string; optional: boolean }[] }
export function rankPantryRecipes(stock: readonly AssistantStock[], recipes: readonly AssistantRecipe[], today?: string) {
  const available = new Set(stock.filter(food => Number(food.quantity) > 0 && (!today || !food.estimatedExpiryAt || food.estimatedExpiryAt.slice(0, 10) >= today)).map(food => food.foodId));
  return recipes.map(recipe => {
    const required = recipe.ingredients.filter(ingredient => !ingredient.optional);
    return { recipe, matches: required.filter(ingredient => available.has(ingredient.foodId)).length, total: required.length };
  }).sort((a, b) => b.matches - a.matches || (a.total - a.matches) - (b.total - b.matches) || a.recipe.name.localeCompare(b.recipe.name));
}
export function pantryAnswer(question: string, stock: readonly AssistantStock[], recipes: readonly AssistantRecipe[], language: 'en' | 'ar', today: string) {
  const ar = language === 'ar';
  const term = question.trim().toLocaleLowerCase();
  const ranked = rankPantryRecipes(stock, recipes, today);
  const recipeText = ar ? 'هذه اقتراحات حسب وجود المكونات فقط؛ راجع الكميات والحساسية والتواريخ قبل الطهي.' : 'These suggestions compare ingredient availability only. Review amounts, allergies and dates before cooking.';
  if (/expir|use first|soon|تاريخ|أول|قريب/.test(term)) {
    const due = stock.filter(food => food.estimatedExpiryAt && food.estimatedExpiryAt.slice(0, 10) >= today).sort((a, b) => (a.estimatedExpiryAt ?? '').localeCompare(b.estimatedExpiryAt ?? '')).slice(0, 5);
    const expired = stock.filter(food => food.estimatedExpiryAt && food.estimatedExpiryAt.slice(0, 10) < today);
    return { text: [ar ? 'حسب التواريخ التي أدخلتها:' : 'Based on the dates you entered:', ...due.map(food => `${food.foodName} · ${food.estimatedExpiryAt?.slice(0, 10)}`), ...(expired.length ? [ar ? `${expired.length} أصناف تجاوزت التاريخ المسجل؛ افحصها قبل الاستخدام ولا تعتبرها اقتراحاً للطهي.` : `${expired.length} items are past their recorded date; review them separately rather than treating them as cooking suggestions.`] : []), ar ? 'هذه التواريخ ليست تقييماً لسلامة الطعام.' : 'These dates are not a food-safety assessment.'].join('\n'), recipes: ranked.slice(0, 3) };
  }
  if (/freez|fridge|pantry|ثلاج|مجمد|فريزر|مخزن/.test(term)) {
    const location = /freez|مجمد|فريزر/.test(term) ? 'FREEZER' : /pantry|مخزن/.test(term) ? 'PANTRY' : 'FRIDGE';
    const list = stock.filter(food => food.storageLocation === location);
    return { text: list.length ? list.map(food => `${food.foodName} · ${food.quantity} ${food.unit.toLowerCase()}`).join('\n') : (ar ? 'لا توجد أصناف مسجلة في هذا المكان.' : 'There are no recorded foods in this storage location.'), recipes: [] };
  }
  if (/buy|shop|missing|تسوق|ناقص|أشتري/.test(term)) {
    const available = new Set(stock.filter(food => Number(food.quantity) > 0).map(food => food.foodId));
    const first = ranked[0];
    const missing = first?.recipe.ingredients.filter(food => !food.optional && !available.has(food.foodId)) ?? [];
    return { text: first ? `${ar ? 'لتحضير' : 'For'} ${first.recipe.name}: ${missing.length ? missing.map(food => food.foodName).join(', ') : (ar ? 'كل أسماء المكونات المطلوبة موجودة؛ تأكد من الكميات.' : 'All required ingredient names are present; check the quantities.')}` : (ar ? 'اختر وصفة أولاً لمعرفة المكونات الناقصة.' : 'Choose a recipe first to identify missing ingredients.'), recipes: first ? [first] : [] };
  }
  if (/health|allerg|safe|مرض|حساس|آمن/.test(term)) return { text: ar ? 'لا أستطيع تشخيص حالة صحية أو تأكيد سلامة الطعام. راجع ملصق المنتج وإرشادات السلامة ومختصاً عند الحاجة.' : 'I cannot diagnose health conditions or certify food safety. Check product labels, food-safety guidance and a qualified professional where needed.', recipes: [] };
  if (!recipes.length) return { text: ar ? 'لم تصل وصفات من الخادم بعد. أعد المحاولة بعد إضافة وصفات.' : 'No recipes have loaded from the server yet. Refresh after adding recipes.', recipes: [] };
  return { text: `${ar ? `في مطبخك ${stock.length} دفعات طعام مسجلة.` : `Your kitchen has ${stock.length} recorded food batches.`}\n${recipeText}`, recipes: ranked.slice(0, 3) };
}
