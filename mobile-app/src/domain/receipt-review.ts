import { receiptAmount, type ReceiptItem, type ReceiptParse, type ReceiptUnit } from './receipt-parser';

export type Storage = 'FRIDGE' | 'FREEZER' | 'PANTRY' | 'COUNTER';
export interface ReceiptFoodOption {
  foodId: string; name: string; arabicName: string | null; categoryCode: string; categoryName: string;
  defaultUnit: string; gramsPerPiece: string | null; storageLocation: Storage; score: number;
  /** Average days it keeps in each place (USDA FoodKeeper); null for foods without shelf-life data. */
  keeps?: { counter: number | null; fridge: number | null; freezer: number | null; ripensAtRoomTemp: boolean } | null;
}
export interface ReceiptLineMatch {
  query: string; confidence: 'HIGH' | 'MEDIUM' | 'NONE'; food: ReceiptFoodOption | null;
  alternatives: ReceiptFoodOption[]; inKitchen: { quantity: string; unit: string }[];
}

/** One receipt item as the person reviews it before anything is added. */
export interface ReviewLine {
  key: string;
  item: ReceiptItem;
  match: ReceiptLineMatch;
  food: ReceiptFoodOption | null;
  include: boolean;
  /** Typed amount; empty when the receipt doesn't say how much (the person enters it). */
  amount: string;
  unit: ReceiptUnit;
  storage: Storage;
  /** The match was a guess; shown with a "check" marker until the person touches it. */
  check: boolean;
}

export const RECEIPT_UNITS: ReceiptUnit[] = ['GRAM', 'KILOGRAM', 'MILLILITER', 'LITER', 'PIECE'];
const defaultUnitOf = (food: ReceiptFoodOption): ReceiptUnit => RECEIPT_UNITS.includes(food.defaultUnit as ReceiptUnit) ? food.defaultUnit as ReceiptUnit : 'GRAM';
const formatAmount = (value: number) => String(Math.round(value * 1000) / 1000);

/** Sets a line's food, with the amount the receipt implies for that food and where it is usually kept. */
export function withFood(line: ReviewLine, food: ReceiptFoodOption | null): ReviewLine {
  if (!food) return { ...line, food: null, include: false, check: false };
  const amount = receiptAmount(line.item, food);
  return { ...line, food, include: true, check: false, amount: amount ? formatAmount(amount.amount) : '', unit: amount?.unit ?? defaultUnitOf(food), storage: food.storageLocation };
}

/** Review lines from a parsed receipt and the server's matches (one per item, same order). */
export function buildReview(parse: ReceiptParse, matches: readonly ReceiptLineMatch[]): ReviewLine[] {
  return parse.items.map((item, index) => {
    const match = matches[index] ?? { query: item.name, confidence: 'NONE', food: null, alternatives: [], inKitchen: [] };
    const base: ReviewLine = { key: `${index}`, item, match, food: null, include: false, amount: '', unit: 'PIECE', storage: 'PANTRY', check: false };
    if (!match.food || match.confidence === 'NONE') return base;
    // An unsure match is suggested but not ticked: adding a wrong food is worse than adding none.
    return { ...withFood(base, match.food), include: match.confidence === 'HIGH', check: match.confidence === 'MEDIUM' };
  });
}

/** Lines grouped by the matched food's category, in the order they first appear; unmatched lines last. */
export function groupByCategory(lines: readonly ReviewLine[]) {
  const groups = new Map<string, { code: string; name: string; lines: ReviewLine[] }>();
  for (const line of lines) {
    if (!line.food) continue;
    const group = groups.get(line.food.categoryCode) ?? { code: line.food.categoryCode, name: line.food.categoryName, lines: [] };
    group.lines.push(line); groups.set(group.code, group);
  }
  return { groups: [...groups.values()], unmatched: lines.filter(line => !line.food) };
}

/**
 * The probable expiry day for a line, as the server will store it: purchase day plus the average days for the
 * chosen storage. "ripens" when it should sit on the counter until ripe; null when there is no figure.
 */
export function probableExpiry(line: Pick<ReviewLine, 'food' | 'storage'>, purchaseDay: string): { day: string; days: number } | 'ripens' | null {
  const keeps = line.food?.keeps;
  if (!keeps) return null;
  const days = line.storage === 'FRIDGE' ? keeps.fridge : line.storage === 'FREEZER' ? keeps.freezer : keeps.counter;
  if (days === null || days === undefined) return keeps.ripensAtRoomTemp && (line.storage === 'COUNTER' || line.storage === 'PANTRY') ? 'ripens' : null;
  const [y, m, d] = purchaseDay.split('-').map(Number);
  return { day: new Date(Date.UTC(y, m - 1, d + days, 12)).toISOString().slice(0, 10), days };
}

export const amountValid = (amount: string) => /^\d+(?:\.\d{1,3})?$/.test(amount.trim()) && Number(amount) > 0;

/** Ticked lines ready to send, and the keys of ticked lines still missing an amount (sent later). */
export function submission(lines: readonly ReviewLine[]) {
  const chosen = lines.filter(line => line.include && line.food);
  const ready = chosen.filter(line => amountValid(line.amount));
  return {
    items: ready.map(line => ({ foodId: line.food!.foodId, amount: String(Number(line.amount.trim())), unit: line.unit, storageLocation: line.storage })),
    keys: ready.map(line => line.key),
    missing: chosen.filter(line => !amountValid(line.amount)).map(line => line.key),
  };
}
