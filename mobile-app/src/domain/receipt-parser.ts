/**
 * Reads the structure of a shop receipt from OCR output.
 *
 * A receipt has a header (shop, address, phone, date), the item lines, then totals, tax and payment.
 * Only item lines can become food; everything else is kept as an ignored line with its reason, so the
 * review screen can show what was skipped. Matching an item to a catalogue food happens later, on the server.
 */

/** One recognised text line with its box, normalised to 0–1 with the origin at the top left. */
export interface OcrLine { text: string; confidence?: number; x: number; y: number; width: number; height: number; angle?: number }

export type IgnoredReason = 'header' | 'total' | 'tax' | 'payment' | 'footer' | 'meta' | 'no-price' | 'fee' | 'non-food';
export interface IgnoredLine { text: string; reason: IgnoredReason }

export type ReceiptUnit = 'GRAM' | 'KILOGRAM' | 'MILLILITER' | 'LITER' | 'PIECE';
export interface ReceiptAmount { amount: number; unit: ReceiptUnit }

export interface ReceiptItem {
  /** The receipt line(s) this item was read from. */
  raw: string;
  /** Cleaned name for matching: codes, sizes and prices removed, common abbreviations expanded. */
  name: string;
  /** How many were bought (packs or pieces). */
  count: number;
  /** What one pack holds, read from the name ("1L", "500 g", "30 pcs"), or the weighed amount. */
  size: ReceiptAmount | null;
  /** Weighed by the shop, so `size` is the whole amount and `count` is 1. */
  weighed: boolean;
  unitPrice: number | null;
  total: number | null;
  discount: number;
  /** Department heading printed above the line on some receipts ("PRODUCE", "DAIRY"). */
  department: string | null;
}

export interface ReceiptParse {
  store: string | null;
  /** Purchase day as YYYY-MM-DD, only when a plausible date was printed. */
  date: string | null;
  items: ReceiptItem[];
  ignored: IgnoredLine[];
  subtotal: number | null;
  total: number | null;
  /** Whether the item lines add up to the printed subtotal or total. */
  check: { status: 'match' | 'mismatch' | 'unknown'; itemsSum: number; printed: number | null };
}

// ---------------------------------------------------------------------------------------------
// Text helpers

const DIGITS: Record<string, string> = { '٫': '.', '٬': ',', '،': ',' };
for (let i = 0; i < 10; i++) { DIGITS[String.fromCharCode(0x660 + i)] = String(i); DIGITS[String.fromCharCode(0x6f0 + i)] = String(i); }
/** Arabic-Indic digits and separators to ASCII, and tidy spacing. */
export const normalizeText = (text: string) => text.replace(/[٠-٩۰-۹٫٬،]/g, c => DIGITS[c] ?? c).replace(/[‎‏؜]/g, '')
  // OCR reads a quantity "x" as Cyrillic х/Х or as ×; standing alone it is the multiplication sign.
  .replace(/(?<![\p{L}])[хХ×](?![\p{L}])/gu, 'x').replace(/\s+/g, ' ').trim();

const words = (list: string[]) => new RegExp(`(?<![\\p{L}\\p{N}])(?:${list.join('|')})(?![\\p{L}])`, 'iu');
const ARABIC = /\p{Script=Arabic}/u;
const LETTERS = /\p{L}{2,}/u;

const TOTAL = words(['total', 'grand total', 'net total', 'balance due', 'amount due', 'to pay', 'الإجمالي', 'الاجمالي', 'إجمالي', 'اجمالي', 'المجموع', 'المطلوب', 'صافي']);
const SUBTOTAL = words(['sub ?-?total', 'subtotal', 'المجموع الفرعي', 'الإجمالي الفرعي', 'قبل الضريبة']);
const TAX = words(['tax', 'vat', 'gst', 'hst', 'ضريبة', 'الضريبة', 'القيمة المضافة']);
const PAYMENT = words(['visa', 'master ?card', 'mastercard', 'amex', 'mada', 'cash', 'card', 'credit', 'debit', 'tender(?:ed)?', 'change', 'apple pay', 'paid', 'approved', 'auth(?:orization)?', 'terminal', 'نقد[اًي]?', 'نقدي', 'كاش', 'شبكة', 'مدى', 'بطاقة', 'الباقي', 'المتبقي', 'مدفوع', 'فيزا']);
const FOOTER = words(['thank', 'thanks', 'welcome', 'return', 'refund', 'exchange', 'policy', 'points', 'loyalty', 'member', 'you saved', 'saving[s]? today', 'items? sold', 'no\\.? of items', 'number of items', 'شكر[اً]?', 'نشكر', 'زيارتكم', 'استرجاع', 'استبدال', 'نقاط', 'عدد الأصناف', 'عدد القطع', 'وفرت']);
const META = words(['tel', 'phone', 'fax', 'mobile', 'www', 'http', 'email', 'cashier', 'operator', 'clerk', 'server', 'register', 'till', 'pos', 'store ?#', 'branch', 'invoice', 'receipt', 'bill', 'order', 'table', 'trans(?:action)?', 'ref', 'vat ?(?:no|number|reg)', 'tax ?id', 'tin', 'cr ?no', 'date', 'time', 'هاتف', 'تليفون', 'جوال', 'فاكس', 'الكاشير', 'كاشير', 'فرع', 'فاتورة', 'إيصال', 'ايصال', 'رقم', 'الرقم الضريبي', 'سجل تجاري', 'التاريخ', 'الوقت']);
const ADDRESS = words(['street', 'st\\.', 'road', 'rd\\.', 'avenue', 'ave\\.', 'blvd', 'district', 'floor', 'building', 'mall', 'شارع', 'طريق', 'حي', 'ميدان', 'برج', 'مول', 'الدور']);
const DISCOUNT = words(['discount', 'disc', 'promo', 'promotion', 'coupon', 'saving', 'savings', 'offer', 'off', 'markdown', 'reduced', 'خصم', 'تخفيض', 'عرض', 'كوبون']);
/** Charges that are not food even though they sit among the items. */
const FEE = words(['deposit', 'bottle deposit', 'bag', 'bags', 'carrier', 'delivery', 'service', 'tip', 'fee', 'charge', 'رسوم', 'توصيل', 'خدمة', 'كيس', 'أكياس', 'اكياس', 'تأمين']);
/** Household goods that supermarkets sell next to food. */
const NON_FOOD = words(['detergent', 'soap', 'shampoo', 'conditioner', 'tissue', 'tissues', 'toilet', 'paper towel', 'kitchen roll', 'napkin', 'napkins', 'foil', 'cling', 'wrap film', 'battery', 'batteries', 'bleach', 'diaper', 'diapers', 'nappies', 'wipes', 'toothpaste', 'toothbrush', 'deodorant', 'razor', 'lotion', 'cream (?:face|hand|body)', 'sponge', 'cleaner', 'dish ?wash', 'softener', 'charcoal', 'lighter', 'candle', 'cigarette', 'cigarettes', 'tobacco', 'magazine', 'newspaper', 'gift card', 'top ?up', 'recharge', 'pet food', 'cat food', 'dog food', 'cat litter', 'منظف', 'صابون', 'شامبو', 'مناديل', 'محارم', 'حفاض', 'حفاضات', 'معجون أسنان', 'معجون اسنان', 'فرشاة', 'مزيل', 'بطارية', 'بطاريات', 'كلور', 'مبيض', 'ورق', 'فحم', 'ولاعة', 'سجائر', 'معطر', 'ليفة', 'إسفنج', 'شحن']);
const DEPARTMENTS = ['produce', 'fruit', 'fruits', 'vegetables', 'veg', 'dairy', 'meat', 'meats', 'poultry', 'seafood', 'fish', 'bakery', 'bread', 'deli', 'frozen', 'grocery', 'groceries', 'beverages', 'drinks', 'snacks', 'household', 'health', 'beauty', 'خضروات', 'خضار', 'فواكه', 'فاكهة', 'ألبان', 'البان', 'لحوم', 'دواجن', 'أسماك', 'مخبوزات', 'مجمدات', 'بقالة', 'مشروبات', 'منظفات'];
const DEPARTMENT_ROW = new RegExp(`^(?:${DEPARTMENTS.join('|')})$`, 'iu');
const NON_FOOD_DEPARTMENTS = /household|health|beauty|منظفات/iu;

/** A money amount: 2–3 decimals, optional thousands separators, minus before or after. */
const MONEY = String.raw`-?\d{1,3}(?:[,.\s]\d{3})*[.,]\d{2,3}-?|-?\d{1,6}[.,]\d{2,3}-?`;
const CURRENCY = String.raw`(?:[$£€]|usd|eur|gbp|egp|sar|aed|kwd|qar|le|l\.e\.?|ج\.?\s?م\.?|جنيه|ر\.?\s?س\.?|ريال|د\.?\s?إ\.?|درهم)`;
/** Tax-class letters after a price ("2.99 F"), but not a unit ("1.020 KG" is a weight). */
const FLAG = String.raw`(?!(?:kg|gm?|lb|l|ml|oz|ct|pk|pc)\s*$)[A-Z*#]{1,2}`;
const TRAILING_PRICE = new RegExp(String.raw`(?:^|\s)${CURRENCY}?\s?(${MONEY})\s?${CURRENCY}?(?:\s?${FLAG})?\s*$`, 'iu');
const LEADING_PRICE = new RegExp(String.raw`^\s*${CURRENCY}?\s?(${MONEY})\s?${CURRENCY}?\s+`, 'iu');
const ONLY_MONEY = new RegExp(String.raw`^\s*${CURRENCY}?\s?(${MONEY})\s?${CURRENCY}?(?:\s?${FLAG})?\s*$`, 'iu');

/** "1,234.50", "12,50", "3.500", "2.00-" → number. A trailing or leading minus makes it negative. */
export function parseMoney(raw: string): number {
  const negative = /^-|-$/.test(raw.trim());
  let text = raw.replace(/-/g, '').replace(/\s/g, '');
  const lastSep = Math.max(text.lastIndexOf('.'), text.lastIndexOf(','));
  const decimals = lastSep >= 0 ? text.slice(lastSep + 1) : '';
  text = lastSep >= 0 ? `${text.slice(0, lastSep).replace(/[.,]/g, '')}.${decimals}` : text;
  const value = Number(text);
  return negative ? -value : value;
}

// ---------------------------------------------------------------------------------------------
// Rows from positioned lines

/**
 * Rebuilds printed rows from Vision's boxes. Vision often returns the name and the price of one row as
 * separate lines, sometimes far apart in its output; joining boxes that share a baseline restores the row.
 * The receipt may be photographed at a slight angle, so positions are straightened first.
 */
export function rowsFromLines(lines: readonly OcrLine[], imageWidth = 1, imageHeight = 1): string[] {
  const usable = lines.filter(line => line.text.trim() && line.height > 0);
  if (!usable.length) return [];
  const aspect = imageHeight / imageWidth;
  // Angles from the module are in normalised units; convert to the real angle, then take the median.
  const angles = usable.filter(line => line.width > 0.15 && typeof line.angle === 'number')
    .map(line => Math.atan(Math.tan(line.angle!) * aspect)).sort((a, b) => a - b);
  const tilt = angles.length ? angles[Math.floor(angles.length / 2)] : 0;
  const slope = Math.tan(tilt) / aspect; // rise in normalised y per unit of normalised x
  const boxes = usable.map(line => ({
    text: normalizeText(line.text), x: line.x, width: line.width, height: line.height,
    // Straighten: a box further right on a tilted photo sits higher, by `slope` per unit of x.
    y: line.y + line.height / 2 + slope * (line.x + line.width / 2),
  })).sort((a, b) => a.y - b.y);
  const heights = boxes.map(box => box.height).sort((a, b) => a - b);
  const lineHeight = heights[Math.floor(heights.length / 2)];
  const rows: { y: number; boxes: typeof boxes }[] = [];
  for (const box of boxes) {
    const row = rows.find(candidate => Math.abs(candidate.y - box.y) < lineHeight * 0.55
      && !candidate.boxes.some(other => box.x < other.x + other.width - 0.01 && other.x < box.x + box.width - 0.01));
    if (row) { row.boxes.push(box); row.y = row.boxes.reduce((sum, b) => sum + b.y, 0) / row.boxes.length; }
    else rows.push({ y: box.y, boxes: [box] });
  }
  return rows.sort((a, b) => a.y - b.y).map(row => row.boxes.sort((a, b) => a.x - b.x).map(box => box.text).join(' '));
}

// ---------------------------------------------------------------------------------------------
// Item lines

const UNIT_WORDS: [RegExp, ReceiptUnit, number][] = [
  [/^(?:kg|kgs|kilo|kilos|كجم|كغ|كيلو|ك\.?ج)$/iu, 'KILOGRAM', 1],
  [/^(?:g|gm|gms|gr|grm|gram|grams|جم|جرام|غ|غرام|جرم)$/iu, 'GRAM', 1],
  [/^(?:ml|mls|مل|ملل|مليلتر)$/iu, 'MILLILITER', 1],
  [/^(?:l|lt|ltr|ltrs|litre|liter|litres|liters|لتر|ل)$/iu, 'LITER', 1],
  [/^(?:cl)$/iu, 'MILLILITER', 10],
  [/^(?:oz)$/iu, 'GRAM', 28.35],
  [/^(?:lb|lbs)$/iu, 'GRAM', 453.6],
  [/^(?:pcs|pc|pce|pieces|piece|ct|count|pk|pack|pkt|حبة|حبات|قطعة|قطع|عدد)$/iu, 'PIECE', 1],
];
function unitOf(word: string): [ReceiptUnit, number] | null {
  for (const [pattern, unit, factor] of UNIT_WORDS) if (pattern.test(word)) return [unit, factor];
  return null;
}
const UNIT_SRC = String.raw`kg|kgs|kilos?|g|gm|gms|gr|grm|grams?|ml|mls|l|lt|ltrs?|litres?|liters?|cl|oz|lb|lbs|pcs|pce|pc|pieces?|ct|pk|pack|pkt|كجم|كغ|كيلو|ك\.?ج|جم|جرام|غرام|جرم|غ|مل|ملل|لتر|ل|حبة|حبات|قطعة|قطع`;
const SIZE = new RegExp(String.raw`(?<![\p{L}\d.])(\d+(?:[.,]\d+)?)\s?(${UNIT_SRC})(?![\p{L}])`, 'iu');
const MULTIPACK = new RegExp(String.raw`(?<![\p{L}\d.])(\d{1,3})\s?[x×*]\s?(\d+(?:[.,]\d+)?)\s?(${UNIT_SRC})(?![\p{L}])`, 'iu');
const WEIGHED = new RegExp(String.raw`(\d+(?:[.,]\d+)?)\s?(kg|kgs|g|gm|lb|lbs|كجم|كغ|كيلو|جم|غ)\s?(?:[@x×*]|net|نت)\s?(?:${CURRENCY}\s?)?(${MONEY})(?:\s?\/\s?(?:kg|lb|كجم|كغ|كيلو))?`, 'iu');
const QTY_AT = new RegExp(String.raw`(?<![\d.,])(\d{1,3})\s?(?:[x×*]|@|ea\.?|each)\s?(?:@\s?)?(?:${CURRENCY}\s?)?(${MONEY})(?:\s?(?:ea|each|للحبة))?`, 'iu');
const QTY_WORD = /(?:qty|quantity|الكمية|كمية|عدد)\s?[:.]?\s?(\d{1,3})(?!\d)/iu;
const LEADING_QTY = /^(\d{1,2})\s?[x×*]?\s+(?=\p{L})/u;
const TRAILING_QTY = /\s[x×*]\s?(\d{1,2})$/u;
const CODE = /(?<![\p{L}])(?:#?\d{4,}|[A-Z]?\d{5,}[A-Z]?)(?![\p{L}])/gu;

/** Abbreviations that shop tills print, expanded so the catalogue search can match them. */
const ABBREVIATIONS: Record<string, string> = {
  chkn: 'chicken', chk: 'chicken', chick: 'chicken', brst: 'breast', bnls: 'boneless', sknls: 'skinless', thgh: 'thigh', drmstk: 'drumstick',
  grnd: 'ground', gr: 'ground', bf: 'beef', mnc: 'mince', lmb: 'lamb', stk: 'steak',
  tom: 'tomato', toms: 'tomato', tmt: 'tomato', pot: 'potato', pots: 'potato', ptto: 'potato', onn: 'onion', onio: 'onion', crt: 'carrot', crrt: 'carrot', cucmbr: 'cucumber', cuc: 'cucumber', lett: 'lettuce', ltce: 'lettuce', brcl: 'broccoli', cauli: 'cauliflower', mush: 'mushroom', mshrm: 'mushroom', pep: 'pepper', ppr: 'pepper', grn: 'green', grlc: 'garlic', zuc: 'zucchini', aubrg: 'eggplant', aubergine: 'eggplant', courgette: 'zucchini', capsicum: 'bell pepper',
  ban: 'banana', bnna: 'banana', bana: 'banana', appl: 'apple', aple: 'apple', orng: 'orange', strwb: 'strawberry', strwbry: 'strawberry', grp: 'grape', grps: 'grape', lmn: 'lemon', wmln: 'watermelon', avo: 'avocado', avoc: 'avocado',
  mlk: 'milk', whl: 'whole', ff: 'fat free', lf: 'low fat', sk: 'skim', ygrt: 'yogurt', yog: 'yogurt', yoghurt: 'yogurt', yogh: 'yogurt', chs: 'cheese', chz: 'cheese', ched: 'cheddar', chdr: 'cheddar', mozz: 'mozzarella', moz: 'mozzarella', parm: 'parmesan', btr: 'butter', bttr: 'butter', crm: 'cream', hvy: 'heavy', sr: 'sour', eg: 'egg', egs: 'egg', lrg: 'large', lg: 'large', med: 'medium',
  brd: 'bread', wht: 'white', ww: 'whole wheat', whwht: 'whole wheat', bgt: 'baguette', tort: 'tortilla',
  ric: 'rice', bsmti: 'basmati', psta: 'pasta', spag: 'spaghetti', spagh: 'spaghetti', mac: 'macaroni', ndl: 'noodle', ndls: 'noodle', flr: 'flour', sgr: 'sugar', slt: 'salt', oil: 'oil', olv: 'olive', veg: 'vegetable', sunfl: 'sunflower', cnola: 'canola',
  jce: 'juice', jc: 'juice', ornj: 'orange', wtr: 'water', min: 'mineral', sprk: 'sparkling', cof: 'coffee', cofe: 'coffee', choc: 'chocolate', choco: 'chocolate', bisc: 'biscuit', ckie: 'cookie', ckies: 'cookies', pnt: 'peanut', btr2: 'butter', alm: 'almond', almd: 'almond', wlnt: 'walnut', hny: 'honey', jm: 'jam', ktchp: 'ketchup', mayo: 'mayonnaise', mstd: 'mustard', vin: 'vinegar', sce: 'sauce', sauc: 'sauce', pste: 'paste', tna: 'tuna', sard: 'sardine', slmn: 'salmon', shrmp: 'shrimp', prwn: 'prawn', frz: 'frozen', frzn: 'frozen', cnd: 'canned', tin: 'canned',
};
/** Words that describe the pack or the shop, not the food. */
const NOISE = /(?<![\p{L}])(?:org|organic|fresh|frsh|premium|prem|select|choice|value|family|economy|eco|classic|original|orig|natural|nat|pack|pk|pkt|bag|btl|bottle|can|jar|box|tray|loose|each|ea|kg|lb|ltd|plu|sku|item|promo|offer|new|طازج|طازة|عبوة|علبة|كيس|زجاجة|سائب|عرض|جديد)(?![\p{L}])/giu;

/** A receipt name, cleaned for the catalogue: lower case, no codes or sizes, abbreviations expanded. */
export function cleanItemName(raw: string): string {
  let text = normalizeText(raw)
    .replace(MULTIPACK, ' ').replace(SIZE, ' ').replace(CODE, ' ')
    .replace(/(?<![\p{L}])\d+(?:[.,]\d+)?%/gu, ' ').replace(/[^\p{L}\p{N}\s'&-]/gu, ' ').replace(/(?<![\p{L}])\d+(?![\p{L}])/gu, ' ');
  // Single capital letters are till flags (tax class, "F" for food stamps), not part of the name.
  text = text.replace(/(?<![\p{L}])[A-Z](?![\p{L}])/gu, ' ').toLocaleLowerCase('en').replace(NOISE, ' ');
  return text.split(/\s+/).filter(Boolean).map(word => ABBREVIATIONS[word.replace(/[.'-]/g, '')] ?? word).join(' ').replace(/\s+/g, ' ').trim();
}

function sizeFromName(name: string): ReceiptAmount | null {
  const multi = MULTIPACK.exec(name);
  if (multi) {
    const unit = unitOf(multi[3]);
    if (unit) return round({ amount: Number(multi[1]) * Number(multi[2].replace(',', '.')) * unit[1], unit: unit[0] });
  }
  const single = SIZE.exec(name);
  if (single) {
    const unit = unitOf(single[2]);
    // A bare "L" or "G" is only a unit when it follows a number, which the pattern requires.
    if (unit) return round({ amount: Number(single[1].replace(',', '.')) * unit[1], unit: unit[0] });
  }
  return null;
}
const round = (value: ReceiptAmount): ReceiptAmount => ({ ...value, amount: Math.round(value.amount * 1000) / 1000 });

interface ItemFields { name: string; count: number; size: ReceiptAmount | null; weighed: boolean; unitPrice: number | null; total: number | null }

/** Pulls quantity, weight and prices out of one item line. Returns null when no name is left. */
export function readItemLine(line: string): ItemFields | null {
  let text = normalizeText(line);
  let total: number | null = null; let unitPrice: number | null = null; let count = 1; let weighed = false; let size: ReceiptAmount | null = null;

  const weighedMatch = WEIGHED.exec(text);
  if (weighedMatch) {
    const unit = unitOf(weighedMatch[2]);
    if (unit) { size = round({ amount: Number(weighedMatch[1].replace(',', '.')) * unit[1], unit: unit[0] }); weighed = true; unitPrice = parseMoney(weighedMatch[3]); }
    text = text.replace(weighedMatch[0], ' ');
  }
  // Prices sit at the end of the row, or at the start when an Arabic row was read left to right.
  const trailing = TRAILING_PRICE.exec(text);
  if (trailing) { total = parseMoney(trailing[1]); text = text.slice(0, trailing.index); }
  else if (ARABIC.test(text)) {
    const leading = LEADING_PRICE.exec(text);
    if (leading) { total = parseMoney(leading[1]); text = text.slice(leading[0].length); }
  }
  if (!weighed) {
    const qtyAt = QTY_AT.exec(text);
    if (qtyAt) { count = Number(qtyAt[1]); unitPrice = parseMoney(qtyAt[2]); text = text.replace(qtyAt[0], ' '); }
    // A second price left on the row is the unit price ("MILK 2 1.50 3.00").
    const second = TRAILING_PRICE.exec(text);
    if (second && total !== null) {
      unitPrice ??= parseMoney(second[1]); text = text.slice(0, second.index);
      const qty = /(?:^|\s)(\d{1,2})\s*$/.exec(text);
      if (qty) { count = Number(qty[1]); text = text.slice(0, qty.index); }
    }
    const qtyWord = QTY_WORD.exec(text);
    if (qtyWord) { count = Number(qtyWord[1]); text = text.replace(qtyWord[0], ' '); }
    const leadingQty = LEADING_QTY.exec(text);
    if (leadingQty && count === 1) { count = Number(leadingQty[1]); text = text.slice(leadingQty[0].length); }
    const trailingQty = TRAILING_QTY.exec(text);
    if (trailingQty && count === 1) { count = Number(trailingQty[1]); text = text.slice(0, trailingQty.index); }
    size = sizeFromName(text);
  }
  if (unitPrice !== null && total !== null && !weighed && count === 1 && unitPrice > 0) {
    const implied = Math.round(total / unitPrice);
    if (implied > 1 && Math.abs(implied * unitPrice - total) < 0.011) count = implied;
  }
  if (count < 1 || count > 99) count = 1;
  const name = cleanItemName(text);
  if (!LETTERS.test(name)) return null;
  return { name, count, size, weighed, unitPrice, total };
}

// ---------------------------------------------------------------------------------------------
// Whole receipt

type Kind = 'total' | 'subtotal' | 'tax' | 'payment' | 'footer' | 'meta' | 'discount' | 'department' | 'quantity' | 'money' | 'priced' | 'text';

const PHONE = /(?:\+?\d[\d\s-]{7,}\d)/;
const DATE_PATTERNS: [RegExp, (m: RegExpExecArray) => [number, number, number][]][] = [
  [/(?<!\d)(20\d{2})[-/.](\d{1,2})[-/.](\d{1,2})(?!\d)/, m => [[Number(m[1]), Number(m[2]), Number(m[3])]]],
  [/(?<!\d)(\d{1,2})[-/.](\d{1,2})[-/.](20\d{2}|\d{2})(?!\d)/, m => {
    const a = Number(m[1]), b = Number(m[2]); const year = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
    // Day first (Egypt, the Gulf, most of the world) or month first (US); both are tried.
    return [[year, b, a], [year, a, b]];
  }],
  [/(?<!\d)(\d{1,2})\s?(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s?,?\s?(20\d{2})/i, m => [[Number(m[3]), monthIndex(m[2]), Number(m[1])]]],
];
const monthIndex = (name: string) => ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'].indexOf(name.slice(0, 3).toLowerCase()) + 1;

/**
 * The printed purchase date: a real date no later than tomorrow and no older than a year. When a date
 * reads both ways (11/06/26), the reading closest to today wins, since receipts are scanned soon after.
 */
export function findDate(rows: readonly string[], today = new Date()): string | null {
  const now = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  for (const row of rows) for (const [pattern, read] of DATE_PATTERNS) {
    const match = pattern.exec(row); if (!match) continue;
    const valid = read(match).map(([y, m, d]) => ({ m, d, date: new Date(Date.UTC(y, m - 1, d)) }))
      .filter(({ m, d, date }) => m >= 1 && m <= 12 && date.getUTCDate() === d)
      .map(({ date }) => ({ date, age: now - date.getTime() }))
      .filter(({ age }) => age >= -86_400_000 && age <= 366 * 86_400_000)
      .sort((a, b) => Math.abs(a.age) - Math.abs(b.age));
    if (valid.length) return valid[0].date.toISOString().slice(0, 10);
  }
  return null;
}

export function kindOf(row: string): Kind {
  const priced = TRAILING_PRICE.test(row) || (ARABIC.test(row) && LEADING_PRICE.test(row));
  const letters = LETTERS.test(row.replace(new RegExp(CURRENCY, 'giu'), ''));
  if (SUBTOTAL.test(row)) return 'subtotal';
  if (TOTAL.test(row) && (priced || !letters || row.length < 30)) return 'total';
  if (/(?:vat|tax)\s?(?:reg|no|number|id|#)|الرقم الضريبي/iu.test(row)) return 'meta';
  if (TAX.test(row) && !/(?:incl|included|شامل)/iu.test(row)) return 'tax';
  if (PAYMENT.test(row)) return 'payment';
  if (FOOTER.test(row)) return 'footer';
  if (DISCOUNT.test(row) || /(?:^|\s)-\d+[.,]\d{2}\s*$|\d[.,]\d{2}-\s*$/.test(row)) return 'discount';
  if (DEPARTMENT_ROW.test(row.replace(/[^\p{L}\s]/gu, '').trim())) return 'department';
  if (!letters || /^\W*(?:[x×*@]|qty|kg|g|lb|ea|each|كجم|كغ|جم)\b/iu.test(row) || /^\s*\d/.test(row) && (QTY_AT.test(row) || WEIGHED.test(row)) && !LETTERS.test(cleanItemName(row))) {
    if (QTY_AT.test(row) || WEIGHED.test(row)) return 'quantity';
    if (ONLY_MONEY.test(row)) return 'money';
    return 'meta';
  }
  if (META.test(row) || ADDRESS.test(row) || PHONE.test(row) && !priced || /@|\.com|\.net|www\./i.test(row)) return 'meta';
  return priced ? 'priced' : 'text';
}

const money2 = (value: number) => Math.round(value * 100) / 100;

/** Reads a whole receipt. `rows` are printed rows top to bottom (see `rowsFromLines`). */
export function parseReceipt(input: readonly string[], today = new Date()): ReceiptParse {
  const rows = input.map(normalizeText).filter(row => row.length > 0);
  const kinds = rows.map(kindOf);
  let firstItem = kinds.findIndex(kind => kind === 'priced' || kind === 'quantity' || kind === 'money');
  // A name printed above its quantity or price row belongs to the items, not the header.
  if (firstItem > 0 && kinds[firstItem] !== 'priced' && kinds[firstItem - 1] === 'text') firstItem--;
  // So does a department heading right above the first item.
  while (firstItem > 0 && kinds[firstItem - 1] === 'department') firstItem--;
  // The item block ends at the first subtotal or total printed after the first item.
  let end = kinds.findIndex((kind, index) => index > firstItem && (kind === 'subtotal' || kind === 'total'));
  if (end < 0) end = rows.length;
  const items: ReceiptItem[] = []; const ignored: IgnoredLine[] = [];
  let store: string | null = null; let department: string | null = null; let pending: string | null = null;
  let subtotal: number | null = null; let total: number | null = null;
  // Priced lines that are not items (a bag, a deposit) still count toward the printed total.
  let charges = 0;

  const priceOf = (row: string) => { const m = TRAILING_PRICE.exec(row) ?? (ARABIC.test(row) ? LEADING_PRICE.exec(row) : null); return m ? parseMoney(m[1]) : null; };
  const push = (raw: string, fields: ItemFields) => {
    items.push({ raw, ...fields, discount: 0, department });
  };
  const ignore = (text: string, reason: IgnoredReason) => { ignored.push({ text, reason }); };

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]; const kind = kinds[i];
    if (firstItem < 0 || i < firstItem) {
      if (!store && kind === 'text' && /\p{L}{3,}/u.test(row) && !FOOTER.test(row)) store = row.slice(0, 60);
      ignore(row, 'header'); continue;
    }
    if (i >= end) {
      const price = priceOf(row);
      if (kind === 'subtotal' && price !== null && subtotal === null) subtotal = price;
      else if (kind === 'total' && price !== null && total === null) total = price;
      else if (kind === 'total' && price === null && total === null && kinds[i + 1] === 'money') total = priceOf(rows[i + 1]);
      ignore(row, kind === 'tax' ? 'tax' : kind === 'payment' ? 'payment' : kind === 'total' || kind === 'subtotal' ? 'total' : 'footer');
      continue;
    }
    switch (kind) {
      case 'priced': {
        const fields = readItemLine(pending ? `${pending} ${row}` : row);
        const raw = pending ? `${pending} / ${row}` : row; pending = null;
        const price = priceOf(row);
        if (fields) push(raw, fields);
        else if (price !== null && (FEE.test(row) || NON_FOOD.test(row))) { charges += price; ignore(row, FEE.test(row) ? 'fee' : 'non-food'); }
        else ignore(row, 'no-price');
        break;
      }
      case 'money': {
        if (pending) { const fields = readItemLine(`${pending} ${row}`); if (fields) push(`${pending} / ${row}`, fields); pending = null; }
        else ignore(row, 'meta');
        break;
      }
      case 'quantity': {
        const detail = readQuantity(row);
        const previous = items[items.length - 1];
        if (pending) {
          // Name on one row, "2 x 1.50  3.00" under it.
          const fields = readItemLine(pending);
          if (fields) { push(`${pending} / ${row}`, { ...fields, ...detail, total: detail.total ?? fields.total }); }
          pending = null;
        } else if (previous && !previous.weighed && previous.count === 1) {
          Object.assign(previous, { ...detail, total: previous.total ?? detail.total, raw: `${previous.raw} / ${row}` });
        } else ignore(row, 'meta');
        break;
      }
      case 'discount': {
        const previous = items[items.length - 1]; const price = priceOf(row);
        if (previous && price !== null) { previous.discount = money2(previous.discount + Math.abs(price)); previous.raw += ` / ${row}`; }
        else ignore(row, 'meta');
        break;
      }
      case 'department': department = row.replace(/[^\p{L}\s]/gu, '').trim().toLowerCase(); ignore(row, 'meta'); break;
      case 'text': {
        // A name whose price is on the next row, or a long name the till wrapped onto two rows.
        const next = kinds[i + 1];
        if ((next === 'money' || next === 'quantity' || next === 'priced') && i + 1 < end) pending = pending ? `${pending} ${row}` : row;
        else ignore(row, 'no-price');
        break;
      }
      default: ignore(row, kind === 'tax' ? 'tax' : kind === 'payment' ? 'payment' : kind === 'footer' ? 'footer' : 'meta');
    }
  }

  // Charges and household goods are kept out of the food list, with the reason shown.
  const food: ReceiptItem[] = [];
  for (const item of items) {
    if (NON_FOOD.test(item.raw) || (item.department && NON_FOOD_DEPARTMENTS.test(item.department))) ignore(item.raw, 'non-food');
    else if (FEE.test(item.name) && item.name.split(' ').length <= 3 && !/\p{L}{3,}\s(?:bag)/u.test(item.name)) ignore(item.raw, 'fee');
    else food.push(item);
  }
  const itemsSum = money2(items.reduce((sum, item) => sum + (item.total ?? 0) - item.discount, charges));
  const printed = subtotal ?? total;
  const status = printed === null || !items.length ? 'unknown' : Math.abs(itemsSum - printed) <= 0.05 ? 'match' : 'mismatch';
  return { store, date: findDate(rows, today), items: food, ignored, subtotal, total, check: { status, itemsSum, printed } };
}

function readQuantity(row: string): Partial<ItemFields> {
  const text = normalizeText(row);
  const weighed = WEIGHED.exec(text);
  const total = (() => { const m = TRAILING_PRICE.exec(text.replace(weighed?.[0] ?? '\u0000', ' ')); return m && weighed?.[3] !== m[1] ? parseMoney(m[1]) : null; })();
  if (weighed) {
    const unit = unitOf(weighed[2]);
    if (unit) return { size: round({ amount: Number(weighed[1].replace(',', '.')) * unit[1], unit: unit[0] }), weighed: true, count: 1, unitPrice: parseMoney(weighed[3]), total };
  }
  const qty = QTY_AT.exec(text);
  if (qty) {
    const rest = text.replace(qty[0], ' '); const m = TRAILING_PRICE.exec(rest);
    return { count: Number(qty[1]), unitPrice: parseMoney(qty[2]), total: m ? parseMoney(m[1]) : null };
  }
  return {};
}

/**
 * How much of the food this line adds to the kitchen, or null when the receipt doesn't say
 * (a pack with no printed size of a food sold by weight). The review screen then asks.
 */
export function receiptAmount(item: Pick<ReceiptItem, 'count' | 'size' | 'weighed'>, food: { defaultUnit: string; gramsPerPiece?: string | number | null }): ReceiptAmount | null {
  if (item.size) {
    if (item.weighed || item.size.unit !== 'PIECE') return round({ amount: item.size.amount * (item.weighed ? 1 : item.count), unit: item.size.unit });
    return { amount: item.size.amount * item.count, unit: 'PIECE' };
  }
  if (food.defaultUnit === 'PIECE' || (food.gramsPerPiece !== null && food.gramsPerPiece !== undefined && Number(food.gramsPerPiece) > 0)) return { amount: item.count, unit: 'PIECE' };
  return null;
}
