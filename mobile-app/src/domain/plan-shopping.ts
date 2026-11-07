// Turns planned meals into shopping lines (Mob-style "smart list"): scale each recipe to the planned servings,
// merge the same food across recipes, subtract what Kitchen already holds and skip what the list already needs.
// Quantities are exact 3-decimal strings (backend Decimal), handled as integer thousandths.

export interface PlanMeal { recipeId: string; servings: string }
export interface PlanRecipe { id: string; name: string; servings: number; ingredients: { foodId: string; foodName: string; quantity: string; unit: string; optional: boolean }[] }
export interface StockLine { foodId: string; quantity: string; unit: string }
export interface ListLine { foodId: string; unit: string; status: string }
export interface ShoppingLine { foodId: string; foodName: string; unit: string; quantity: string; recipeNames: string[] }

const DECIMAL = /^\d+(?:\.\d{1,3})?$/;
/** Required ingredients worth buying: optional ones and tap water are left out. */
export const isShoppable = (ingredient: { foodName: string; optional: boolean }) => !ingredient.optional && ingredient.foodName.trim().toLowerCase() !== 'water';
export function toMilli(value: string): bigint {
  if (!DECIMAL.test(value)) throw new Error(`Invalid quantity: ${value}`);
  const [whole, fraction = ''] = value.split('.');
  return BigInt(whole) * 1000n + BigInt(fraction.padEnd(3, '0'));
}
export function fromMilli(value: bigint): string {
  const text = `${value / 1000n}.${String(value % 1000n).padStart(3, '0')}`;
  return text.replace(/\.?0+$/, '') || '0';
}

export function planShoppingLines({ meals, recipes, stock, list }: { meals: readonly PlanMeal[]; recipes: ReadonlyMap<string, PlanRecipe>; stock: readonly StockLine[]; list: readonly ListLine[] }): ShoppingLine[] {
  const lines = new Map<string, { foodId: string; foodName: string; unit: string; milli: bigint; recipeNames: string[] }>();
  for (const meal of meals) {
    const recipe = recipes.get(meal.recipeId);
    if (!recipe || recipe.servings < 1) continue;
    const servings = toMilli(meal.servings);
    for (const ingredient of recipe.ingredients) {
      if (!isShoppable(ingredient)) continue;
      const divisor = BigInt(recipe.servings) * 1000n;
      const scaled = (toMilli(ingredient.quantity) * servings + divisor / 2n) / divisor; // round half up to 0.001
      const key = `${ingredient.foodId}|${ingredient.unit}`;
      const line = lines.get(key) ?? { foodId: ingredient.foodId, foodName: ingredient.foodName, unit: ingredient.unit, milli: 0n, recipeNames: [] };
      line.milli += scaled;
      if (!line.recipeNames.includes(recipe.name)) line.recipeNames.push(recipe.name);
      lines.set(key, line);
    }
  }
  // Anything already on the active list — still needed, bought or skipped — is left alone, so ticking an item off never brings it back.
  const onList = new Set(list.map((item) => `${item.foodId}|${item.unit}`));
  // shortcut: stock in a different unit (e.g. kg vs g) is not converted, so that food is still listed in full; convert via food density/gramsPerPiece if this proves noisy.
  const held = new Map<string, bigint>();
  for (const item of stock) if (DECIMAL.test(item.quantity)) held.set(`${item.foodId}|${item.unit}`, (held.get(`${item.foodId}|${item.unit}`) ?? 0n) + toMilli(item.quantity));
  return [...lines.entries()]
    .filter(([key]) => !onList.has(key))
    .map(([key, line]) => ({ ...line, milli: line.milli - (held.get(key) ?? 0n) }))
    .filter((line) => line.milli > 0n)
    .sort((a, b) => a.foodName.localeCompare(b.foodName))
    .map(({ milli, ...line }) => ({ ...line, quantity: fromMilli(milli) }));
}
