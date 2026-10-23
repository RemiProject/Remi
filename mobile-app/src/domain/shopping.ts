export const shoppingCategories = ['produce', 'dairy', 'protein', 'bakery', 'pantry', 'frozen', 'other'] as const;
export type ShoppingCategory = (typeof shoppingCategories)[number];
export interface ShoppingInput { name: string; quantity?: number; unit?: string; category?: ShoppingCategory }
export interface ShoppingItem extends ShoppingInput { id: string; purchased: boolean; createdAt: string; updatedAt: string }
export interface ShoppingDraft { name: string; quantity: string; unit: string; category: string }
export const emptyShoppingDraft: ShoppingDraft = { name: '', quantity: '', unit: '', category: '' };
export function validateShopping(draft: ShoppingDraft) {
  const errors: Partial<Record<keyof ShoppingDraft, 'nameError' | 'quantityError' | 'unitError' | 'categoryError'>> = {};
  const name = draft.name.trim(), unit = draft.unit.trim(), quantity = draft.quantity.trim();
  if (!name || name.length > 100) errors.name = 'nameError';
  if (unit.length > 24) errors.unit = 'unitError';
  if (quantity && (!/^(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(quantity) || !Number.isFinite(Number(quantity)) || Number(quantity) <= 0)) errors.quantity = 'quantityError';
  if (draft.category && !shoppingCategories.includes(draft.category as ShoppingCategory)) errors.category = 'categoryError';
  const value: ShoppingInput = { name, ...(unit ? { unit } : {}), ...(quantity ? { quantity: Number(quantity) } : {}), ...(draft.category ? { category: draft.category as ShoppingCategory } : {}) };
  return { errors, value: Object.keys(errors).length ? undefined : value };
}
export function shoppingDraft(item: ShoppingInput): ShoppingDraft { return { name: item.name, quantity: item.quantity === undefined ? '' : String(item.quantity), unit: item.unit ?? '', category: item.category ?? '' }; }
export function validShoppingItem(value: unknown): value is ShoppingItem {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const item = value as Record<string, unknown>;
  if (Object.keys(item).some((key) => !['id', 'name', 'quantity', 'unit', 'category', 'purchased', 'createdAt', 'updatedAt'].includes(key))) return false;
  if (typeof item.id !== 'string' || !/^[A-Za-z0-9_-]{1,120}$/.test(item.id) || typeof item.name !== 'string' || !item.name || item.name !== item.name.trim() || item.name.length > 100 || typeof item.purchased !== 'boolean') return false;
  if (item.quantity !== undefined && (typeof item.quantity !== 'number' || !Number.isFinite(item.quantity) || item.quantity <= 0)) return false;
  if (item.unit !== undefined && (typeof item.unit !== 'string' || !item.unit || item.unit !== item.unit.trim() || item.unit.length > 24)) return false;
  if (item.category !== undefined && !shoppingCategories.includes(item.category as ShoppingCategory)) return false;
  const timestamp = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(v) && Number.isFinite(Date.parse(v)) && new Date(v).toISOString() === v;
  return timestamp(item.createdAt) && timestamp(item.updatedAt) && item.updatedAt >= item.createdAt;
}
export function shoppingView(items: readonly ShoppingItem[], query: string, filter: 'all' | 'toBuy' | 'purchased') {
  const term = query.trim().toLocaleLowerCase();
  return items.filter((item) => item.name.toLocaleLowerCase().includes(term) && (filter === 'all' || item.purchased === (filter === 'purchased')));
}
