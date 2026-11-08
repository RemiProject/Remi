/** Average shelf life of a fresh food per storage place (FoodShelfLife, from USDA FoodKeeper). */
export interface ShelfLife {
  roomMinDays: number | null; roomMaxDays: number | null; ripensAtRoomTemp: boolean;
  fridgeMinDays: number | null; fridgeMaxDays: number | null;
  freezerMinDays: number | null; freezerMaxDays: number | null; freezeNotRecommended: boolean;
}
export interface DayRange { min: number; max: number; average: number }

/** The FoodKeeper range for a storage place, with its midpoint; null when FoodKeeper gives no figure. */
export function shelfLifeDays(shelf: ShelfLife | null | undefined, storage: string): DayRange | null {
  if (!shelf) return null;
  const [min, max] = storage === 'FRIDGE' ? [shelf.fridgeMinDays, shelf.fridgeMaxDays]
    : storage === 'FREEZER' ? [shelf.freezerMinDays, shelf.freezerMaxDays]
    : storage === 'PANTRY' || storage === 'COUNTER' ? [shelf.roomMinDays, shelf.roomMaxDays] : [null, null];
  if (min === null || max === null) return null;
  return { min, max, average: Math.round((min + max) / 2) };
}

/**
 * Probable expiry: the purchase day plus the average shelf life for where the food is kept, at noon UTC so the
 * calendar day is the same in every time zone Remi serves. Null when there is no figure for that storage place.
 */
export function estimateExpiry(shelf: ShelfLife | null | undefined, storage: string, purchaseDay: string): Date | null {
  const days = shelfLifeDays(shelf, storage);
  if (!days || !/^\d{4}-\d{2}-\d{2}$/.test(purchaseDay)) return null;
  const [y, m, d] = purchaseDay.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days.average, 12));
}

/**
 * Where a fresh food keeps best, by USDA's figures: the fridge when FoodKeeper has a fridge range, unless room
 * temperature keeps it at least as long (onions, potatoes) or it must ripen first (bananas, tomatoes, avocados).
 * Null when there is no shelf-life data, so the caller falls back to its category rule.
 */
export function bestStorage(shelf: ShelfLife | null | undefined): 'FRIDGE' | 'PANTRY' | null {
  if (!shelf) return null;
  // Room temperature is "Pantry" in the app, which also covers the counter.
  if (shelf.ripensAtRoomTemp) return 'PANTRY';
  const room = shelfLifeDays(shelf, 'PANTRY'), fridge = shelfLifeDays(shelf, 'FRIDGE');
  if (room && (!fridge || room.average >= fridge.average)) return 'PANTRY';
  return fridge ? 'FRIDGE' : null;
}
