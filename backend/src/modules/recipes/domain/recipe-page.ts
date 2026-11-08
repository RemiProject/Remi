/**
 * Reads a recipe out of a web page. Recipe sites publish schema.org "Recipe" data as JSON-LD so search engines can
 * show it; that is the structured, reliable source, so it is the only one used. A page without it is reported as
 * "no recipe found" rather than guessed from the visible text.
 */
import { Unit } from '@/shared/food-unit.js';

export interface PageRecipe {
  name: string;
  description: string | null;
  servings: number | null;
  prepTimeMin: number | null;
  cookTimeMin: number | null;
  totalTimeMin: number | null;
  imageUrl: string | null;
  author: string | null;
  siteName: string | null;
  ingredients: string[];
  steps: string[];
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', frac12: '½', frac14: '¼', frac34: '¾', deg: '°', ndash: '–', mdash: '—', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“', hellip: '…' };
/** Plain text from a string that may hold HTML tags and entities. */
export function plainText(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value
    .replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]+>/g, ' ')
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec: string) => String.fromCodePoint(Number(dec)))
    .replace(/&([a-z]+\d*);/gi, (all, name: string) => ENTITIES[name.toLowerCase()] ?? all)
    .replace(/\s+/g, ' ').trim();
}

const isType = (node: Record<string, unknown>, type: string) => {
  const t = node['@type'];
  return Array.isArray(t) ? t.includes(type) : t === type;
};

/** Every object inside parsed JSON-LD: arrays, @graph lists and nested values. */
function* nodes(value: unknown, depth = 0): Generator<Record<string, unknown>> {
  if (depth > 6 || value === null || typeof value !== 'object') return;
  if (Array.isArray(value)) { for (const item of value) yield* nodes(item, depth + 1); return; }
  const node = value as Record<string, unknown>;
  yield node;
  for (const key of ['@graph', 'mainEntity', 'mainEntityOfPage', 'itemListElement']) if (key in node) yield* nodes(node[key], depth + 1);
}

/** ISO 8601 duration ("PT1H30M", "P0DT0H45M") to minutes. */
export function isoMinutes(value: unknown): number | null {
  if (typeof value !== 'string') return null;
  const m = /^P(?:(\d+)D)?(?:T(?:(\d+(?:\.\d+)?)H)?(?:(\d+(?:\.\d+)?)M)?(?:\d+(?:\.\d+)?S)?)?$/i.exec(value.trim());
  if (!m || (!m[1] && !m[2] && !m[3])) return null;
  const minutes = Number(m[1] ?? 0) * 1440 + Number(m[2] ?? 0) * 60 + Number(m[3] ?? 0);
  return minutes > 0 && minutes <= 10_080 ? Math.round(minutes) : null;
}

/** "4", "4 servings", ["4", "4 servings"], "Serves 6-8" -> the first whole number between 1 and 100. */
export function servingsOf(value: unknown): number | null {
  const values = Array.isArray(value) ? value : [value];
  for (const v of values) {
    const n = typeof v === 'number' ? v : Number(/\d+/.exec(String(v ?? ''))?.[0]);
    if (Number.isInteger(n) && n >= 1 && n <= 100) return n;
  }
  return null;
}

function imageOf(value: unknown): string | null {
  const first = Array.isArray(value) ? value[0] : value;
  const url = typeof first === 'string' ? first : first && typeof first === 'object' ? (first as Record<string, unknown>).url : null;
  return typeof url === 'string' && /^https?:\/\//.test(url) ? url : null;
}

function nameOf(value: unknown): string | null {
  const first = Array.isArray(value) ? value[0] : value;
  if (typeof first === 'string') return plainText(first) || null;
  if (first && typeof first === 'object') return plainText((first as Record<string, unknown>).name) || null;
  return null;
}

/** Steps from strings, HowToStep objects or HowToSection groups, in order. */
function stepsOf(value: unknown, depth = 0): string[] {
  if (depth > 4 || value === null || value === undefined) return [];
  if (typeof value === 'string') {
    // Some sites put every step in one string separated by line breaks or numbers.
    return value.split(/\n+|(?:^|\s)(?=\d{1,2}\.\s)/).map(plainText).map(s => s.replace(/^\d{1,2}\.\s*/, '')).filter(Boolean);
  }
  if (Array.isArray(value)) return value.flatMap(item => stepsOf(item, depth + 1));
  if (typeof value === 'object') {
    const node = value as Record<string, unknown>;
    if (isType(node, 'HowToSection') || 'itemListElement' in node) return stepsOf(node.itemListElement, depth + 1);
    const text = plainText(node.text) || plainText(node.name);
    return text ? [text] : [];
  }
  return [];
}

/** The Recipe described by the page's JSON-LD, or null when the page has none. */
export function recipeFromHtml(html: string): PageRecipe | null {
  const blocks = html.matchAll(/<script[^>]*type\s*=\s*["']?application\/ld\+json["']?[^>]*>([\s\S]*?)<\/script>/gi);
  let site: string | null = null;
  for (const [, raw] of blocks) {
    let data: unknown;
    try { data = JSON.parse(raw.trim().replace(/^<!--|-->$/g, '')); } catch { continue; }
    for (const node of nodes(data)) {
      if (isType(node, 'WebSite') || isType(node, 'Organization')) site ??= plainText(node.name) || null;
      if (!isType(node, 'Recipe')) continue;
      const ingredients = (Array.isArray(node.recipeIngredient) ? node.recipeIngredient : Array.isArray(node.ingredients) ? node.ingredients : [])
        .map(plainText).filter(Boolean).slice(0, 100);
      const name = plainText(node.name);
      if (!name || !ingredients.length) continue;
      return {
        name: name.slice(0, 200),
        description: plainText(node.description).slice(0, 1000) || null,
        servings: servingsOf(node.recipeYield),
        prepTimeMin: isoMinutes(node.prepTime), cookTimeMin: isoMinutes(node.cookTime), totalTimeMin: isoMinutes(node.totalTime),
        imageUrl: imageOf(node.image),
        author: nameOf(node.author),
        siteName: nameOf(node.publisher) ?? site,
        ingredients,
        steps: stepsOf(node.recipeInstructions).map(step => step.slice(0, 2000)).slice(0, 100),
      };
    }
  }
  return null;
}

// ---------------------------------------------------------------------------------------------
// Ingredient lines

export interface IngredientLine {
  text: string;
  /** Amount in `unit`, or null when the line gives none ("salt to taste"). */
  quantity: number | null;
  unit: Unit | null;
  /** The food part, cleaned for the catalogue search. */
  name: string;
  optional: boolean;
}

const FRACTIONS: Record<string, number> = { '½': 0.5, '⅓': 1 / 3, '⅔': 2 / 3, '¼': 0.25, '¾': 0.75, '⅕': 0.2, '⅛': 0.125, '⅜': 0.375, '⅝': 0.625, '⅞': 0.875 };
const ARABIC_DIGITS = /[٠-٩]/g;
// [pattern, unit, factor to that unit]
const UNITS: Array<[RegExp, Unit, number]> = [
  [/^(?:cups?|c\.|كوب|أكواب|اكواب|كوبان|كوبين)$/i, Unit.CUP, 1],
  [/^(?:tablespoons?|tbsps?|tbs|tbl|T|ملعقة كبيرة|ملاعق كبيرة|م\.ك)$/, Unit.TABLESPOON, 1],
  [/^(?:teaspoons?|tsps?|t|ملعقة صغيرة|ملاعق صغيرة|م\.ص)$/, Unit.TEASPOON, 1],
  [/^(?:grams?|g|gr|grs|جرام|جم|غرام|غ)$/i, Unit.GRAM, 1],
  [/^(?:kilograms?|kgs?|kilos?|كيلو|كيلوجرام|كجم|كغ)$/i, Unit.KILOGRAM, 1],
  [/^(?:millilit(?:er|re)s?|mls?|مل|ملل|ملليلتر)$/i, Unit.MILLILITER, 1],
  [/^(?:lit(?:er|re)s?|l|لتر|لترات)$/i, Unit.LITER, 1],
  [/^(?:ounces?|oz)$/i, Unit.GRAM, 28.35],
  [/^(?:pounds?|lbs?)$/i, Unit.GRAM, 453.6],
  [/^(?:cans?|tins?|jars?|packages?|packets?|pkgs?|boxes|box|bags?|sticks?|bottles?|pieces?|pcs?|cloves?|whole|large|medium|small|heads?|bunch(?:es)?|stalks?|sprigs?|slices?|fillets?|breasts?|thighs?|eggs?|حبة|حبات|فص|فصوص|قطعة|قطع|حزمة|شريحة|شرائح)$/i, Unit.PIECE, 1],
];
// \b does not work next to Arabic letters, so the end of the unit is a space or the end of the line.
const TWO_WORD_UNITS = /^(?:ملعقة كبيرة|ملاعق كبيرة|ملعقة صغيرة|ملاعق صغيرة|fl\.? oz)(?=\s|$)/i;
const OPTIONAL = /\b(?:optional|to taste|for serving|for garnish|to serve|as needed)\b|اختياري|حسب الرغبة|حسب الذوق|للتزيين|للتقديم/i;
const PREP = /(?<![-\w])(?:fresh|finely|roughly|coarsely|thinly|freshly|chopped|diced|minced|sliced|grated|crushed|peeled|seeded|halved|quartered|cubed|shredded|melted|softened|beaten|rinsed|drained|divided|packed|sifted|toasted|cooked|uncooked|boneless|skinless|large|medium|small|about|approximately|plus more|or more|room temperature|at room temperature)(?![-\w])|مفروم|مقطع|مبشور|مقشر|ناعم|كبيرة|صغيرة|متوسطة|حوالي/gi;

/** Amount at the start of a line: "1 1/2", "1½", "½", "3/4", "1.5", "2-3" (the first), "١". */
function leadingAmount(input: string): { value: number; rest: string } | null {
  const t = input.replace(ARABIC_DIGITS, d => String(d.charCodeAt(0) - 0x660));
  const cases: Array<[RegExp, (m: RegExpExecArray) => number]> = [
    [/^(\d+)\s+(\d+)\s*\/\s*(\d+)/, m => Number(m[1]) + Number(m[2]) / Number(m[3])],
    [/^(\d+)\s*\/\s*(\d+)/, m => Number(m[1]) / Number(m[2])],
    [/^(\d+(?:[.,]\d+)?)?\s*([½⅓⅔¼¾⅕⅛⅜⅝⅞])/, m => Number((m[1] ?? '0').replace(',', '.')) + FRACTIONS[m[2]]],
    [/^(\d+(?:[.,]\d+)?)/, m => Number(m[1].replace(',', '.'))],
  ];
  for (const [pattern, read] of cases) {
    const m = pattern.exec(t);
    if (!m) continue;
    const value = read(m);
    if (!(value > 0) || !Number.isFinite(value)) return null;
    // A range keeps its first number: "2-3 cloves", "2 to 3 cups".
    const rest = t.slice(m[0].length).replace(/^\s*(?:-|–|to|إلى)\s*\d+(?:[.,]\d+)?(?:\s*\/\s*\d+)?/i, '');
    return { value: Math.round(value * 1000) / 1000, rest };
  }
  return null;
}

/** Splits "2 cups (250 g) plain flour, sifted" into 2 CUP and "plain flour". */
export function parseIngredientLine(line: string): IngredientLine {
  const text = plainText(line).slice(0, 500);
  const optional = OPTIONAL.test(text);
  let rest = text.replace(/\([^)]*\)/g, ' ').replace(/\s+/g, ' ').trim();
  let quantity: number | null = null; let unit: Unit | null = null;
  const amount = leadingAmount(rest);
  if (amount) {
    quantity = amount.value; rest = amount.rest.trim();
    const two = TWO_WORD_UNITS.exec(rest);
    const word = two ? two[0] : rest.split(/\s+/)[0]?.replace(/[.,]$/, '') ?? '';
    const match = UNITS.find(([pattern]) => pattern.test(word));
    if (match) {
      const [, u, factor] = match; unit = u; quantity = Math.round(quantity * factor * 1000) / 1000;
      // A count noun ("2 eggs", "3 cloves garlic") keeps the word when it is the food itself.
      const isFood = /^(?:eggs?|breasts?|thighs?|fillets?)$/i.test(word);
      if (!isFood) rest = rest.slice(word.length).trim();
    } else {
      unit = Unit.PIECE; // "3 tomatoes", "2 onions"
    }
    rest = rest.replace(/^of\s+/i, '');
  }
  const name = rest.replace(new RegExp(OPTIONAL.source, 'gi'), ' ').replace(/\b\d+(?:[.,]\d+)?\s*-?\s*(?:oz|ounces?|g|grams?|ml|lb)\b/gi, ' ').split(/,|;|\bor\b| أو /)[0]
    .replace(PREP, ' ').replace(/[^\p{L}\p{N}\s'-]/gu, ' ').replace(/\s+/g, ' ').trim().toLowerCase();
  return { text, quantity, unit, name, optional };
}
