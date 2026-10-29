export const categoryOptions = [
  { id: 'produce', label: 'Produce' }, { id: 'dairy', label: 'Dairy' },
  { id: 'protein', label: 'Protein' }, { id: 'grains', label: 'Grains' }, { id: 'other', label: 'Other' },
] as const;
export const unitOptions = [
  { id: 'g', label: 'g' }, { id: 'kg', label: 'kg' }, { id: 'ml', label: 'ml' },
  { id: 'l', label: 'L' }, { id: 'pieces', label: 'pieces' }, { id: 'cups', label: 'cups' },
  { id: 'packs', label: 'packs' },
] as const;
export const storageOptions = [
  { id: 'refrigerator', label: 'Refrigerator' }, { id: 'freezer', label: 'Freezer' },
  { id: 'pantry', label: 'Pantry' },
] as const;
export type CategoryId = (typeof categoryOptions)[number]['id'];
export type UnitId = (typeof unitOptions)[number]['id'];
export type StorageId = (typeof storageOptions)[number]['id'];
export interface InventoryInput {
  photoRef?: string;
  name: string;
  categoryId: CategoryId;
  quantity: number;
  unitId: UnitId;
  storageId: StorageId;
  purchaseDate?: string;
  expirationDate?: string;
  notes?: string;
}
export interface InventoryItem extends InventoryInput {
  id: string;
  createdAt: string;
  updatedAt: string;
}
export interface FoodDraft {
  name: string; categoryId: string; quantity: string; unitId: string; storageId: string;
  purchaseDate: string; expirationDate: string; notes: string;
}
export type FieldErrors = Partial<Record<keyof FoodDraft, string>>;
export const emptyDraft: FoodDraft = {
  name: '', categoryId: '', quantity: '', unitId: '', storageId: '',
  purchaseDate: '', expirationDate: '', notes: '',
};
export const MAX_NAME_LENGTH = 100;
export const MAX_NOTES_LENGTH = 1000;
// Relative application-owned identifiers only; never picker URIs or arbitrary paths.
export function isPhotoRef(value: unknown): value is string {
  return typeof value === 'string' && /^photo_[A-Za-z0-9_-]{1,100}\.(jpg|jpeg|png|webp|heic|avif)$/.test(value);
}

export function isCalendarDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  if (year < 1 || month < 1 || month > 12 || day < 1) return false;
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  return day <= [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1];
}

export function validateDraft(draft: FoodDraft): { errors: FieldErrors; value?: InventoryInput } {
  const errors: FieldErrors = {};
  const name = draft.name.trim();
  const notes = draft.notes.trim();
  if (!name || name.length > MAX_NAME_LENGTH) errors.name = `Enter a food name (1–${MAX_NAME_LENGTH} characters).`;
  // Decimal/scientific notation only; never accept hex, Infinity, or partial values.
  const quantityText = draft.quantity.trim();
  const quantity = Number(quantityText);
  if (!/^(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(quantityText) || !Number.isFinite(quantity) || quantity <= 0)
    errors.quantity = 'Enter a positive quantity, such as 1 or 0.5. Use a dot for decimals.';
  if (!categoryOptions.some((option) => option.id === draft.categoryId)) errors.categoryId = 'Choose a category.';
  if (!unitOptions.some((option) => option.id === draft.unitId)) errors.unitId = 'Choose a unit.';
  if (!storageOptions.some((option) => option.id === draft.storageId)) errors.storageId = 'Choose a storage location.';
  for (const field of ['purchaseDate', 'expirationDate'] as const) {
    if (draft[field] !== '' && !isCalendarDate(draft[field])) errors[field] = 'Enter a real calendar date as YYYY-MM-DD, or leave blank.';
  }
  // Historical and future dates are valid. Only the relationship between entered dates is restricted.
  if (isCalendarDate(draft.purchaseDate) && isCalendarDate(draft.expirationDate) && draft.expirationDate < draft.purchaseDate)
    errors.expirationDate = 'Expiration must be on or after the purchase date.';
  if (draft.notes.length > MAX_NOTES_LENGTH) errors.notes = `Keep notes within ${MAX_NOTES_LENGTH} characters.`;
  if (Object.keys(errors).length) return { errors };
  return { errors, value: {
    name, quantity, categoryId: draft.categoryId as CategoryId, unitId: draft.unitId as UnitId,
    storageId: draft.storageId as StorageId,
    ...(draft.purchaseDate ? { purchaseDate: draft.purchaseDate } : {}),
    ...(draft.expirationDate ? { expirationDate: draft.expirationDate } : {}),
    ...(notes ? { notes } : {}),
  } };
}

export function itemToDraft(item: InventoryInput): FoodDraft {
  return { name: item.name, quantity: String(item.quantity), categoryId: item.categoryId,
    unitId: item.unitId, storageId: item.storageId, purchaseDate: item.purchaseDate ?? '',
    expirationDate: item.expirationDate ?? '', notes: item.notes ?? '' };
}

export function isInventoryItem(value: unknown): value is InventoryItem {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const item = value as Record<string, unknown>;
  const allowed = ['id', 'name', 'categoryId', 'quantity', 'unitId', 'storageId', 'purchaseDate', 'expirationDate', 'notes', 'createdAt', 'updatedAt', 'photoRef'];
  if (item.photoRef !== undefined && !isPhotoRef(item.photoRef)) return false;
  if (Object.keys(item).some((key) => !allowed.includes(key))) return false;
  if (typeof item.id !== 'string' || !/^[A-Za-z0-9_-]{1,120}$/.test(item.id)) return false;
  if (typeof item.name !== 'string' || item.name !== item.name.trim() || !item.name || item.name.length > MAX_NAME_LENGTH) return false;
  if (typeof item.quantity !== 'number' || !Number.isFinite(item.quantity) || item.quantity <= 0) return false;
  if (!categoryOptions.some((option) => option.id === item.categoryId) || !unitOptions.some((option) => option.id === item.unitId) || !storageOptions.some((option) => option.id === item.storageId)) return false;
  if (item.notes !== undefined && (typeof item.notes !== 'string' || item.notes.length > MAX_NOTES_LENGTH)) return false;
  if (item.purchaseDate !== undefined && !isCalendarDate(item.purchaseDate)) return false;
  if (item.expirationDate !== undefined && !isCalendarDate(item.expirationDate)) return false;
  if (typeof item.purchaseDate === 'string' && typeof item.expirationDate === 'string' && item.expirationDate < item.purchaseDate) return false;
  const timestampValid = (timestamp: unknown) => typeof timestamp === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(timestamp) && Number.isFinite(Date.parse(timestamp)) && new Date(timestamp).toISOString() === timestamp;
  return timestampValid(item.createdAt) && timestampValid(item.updatedAt) && (item.updatedAt as string) >= (item.createdAt as string);
}

export const storageLabel = (id: StorageId) => storageOptions.find((option) => option.id === id)!.label;
export const categoryLabel = (id: CategoryId) => categoryOptions.find((option) => option.id === id)!.label;
export const unitLabel = (id: UnitId) => unitOptions.find((option) => option.id === id)!.label;

export function filterInventory(items: readonly InventoryItem[], query: string, category: CategoryId | 'all', storage: StorageId | 'all') {
  const text = query.trim().toLocaleLowerCase();
  return items.filter((item) => item.name.toLocaleLowerCase().includes(text) && (category === 'all' || item.categoryId === category) && (storage === 'all' || item.storageId === storage));
}
export function localDateKey(now = new Date()) {
  return `${String(now.getFullYear()).padStart(4, '0')}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}
function dateOrdinal(date: string) {
  // Midnight UTC used solely to compare date-only values, avoiding daylight-saving offsets.
  return Date.parse(`${date}T00:00:00.000Z`) / 86400000;
}
export function expirationStatus(item: { expirationDate?: string | null }, today = localDateKey()) {
  if (!item.expirationDate) return { kind: 'unknown' as const, label: 'No expiration date', days: null };
  const days = dateOrdinal(item.expirationDate) - dateOrdinal(today);
  if (days < 0) return { kind: 'expired' as const, label: 'Past entered expiration date', days };
  if (days === 0) return { kind: 'due' as const, label: 'Expiration date is today', days };
  return { kind: 'upcoming' as const, label: `Expires in ${days} ${days === 1 ? 'day' : 'days'}`, days };
}
export function useFirstItems<T extends { expirationDate?: string | null; name: string }>(items: readonly T[], today = localDateKey()) {
  return items.filter((item) => item.expirationDate && expirationStatus(item, today).days! <= 3)
    .sort((a, b) => a.expirationDate!.localeCompare(b.expirationDate!) || a.name.localeCompare(b.name)).slice(0, 3);
}
