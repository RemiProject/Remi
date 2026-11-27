import { describe, expect, it } from 'vitest';
import { bestStorage, estimateExpiry, shelfLifeDays, type ShelfLife } from '@/modules/inventory/domain/shelf-life.js';

const shelf = (o: Partial<ShelfLife>): ShelfLife => ({ roomMinDays: null, roomMaxDays: null, ripensAtRoomTemp: false, fridgeMinDays: null, fridgeMaxDays: null, freezerMinDays: null, freezerMaxDays: null, freezeNotRecommended: false, ...o });
// Figures from USDA FoodKeeper v128 (data/foodkeeper-produce.psv).
const apple = shelf({ roomMinDays: 21, roomMaxDays: 21, fridgeMinDays: 28, fridgeMaxDays: 42, freezerMinDays: 240, freezerMaxDays: 240 });
const tomato = shelf({ ripensAtRoomTemp: true, freezerMinDays: 60, freezerMaxDays: 60 });
const onion = shelf({ roomMinDays: 30, roomMaxDays: 30, fridgeMinDays: 60, fridgeMaxDays: 60, freezerMinDays: 300, freezerMaxDays: 360 });
const potato = shelf({ roomMinDays: 30, roomMaxDays: 60, fridgeMinDays: 7, fridgeMaxDays: 14 });
const lettuce = shelf({ fridgeMinDays: 7, fridgeMaxDays: 14, freezeNotRecommended: true });

describe('shelf life', () => {
  it('uses the midpoint of the range for the storage place', () => {
    expect(shelfLifeDays(apple, 'FRIDGE')).toEqual({ min: 28, max: 42, average: 35 });
    expect(shelfLifeDays(apple, 'COUNTER')).toEqual({ min: 21, max: 21, average: 21 });
    expect(shelfLifeDays(lettuce, 'FREEZER')).toBeNull();
    expect(shelfLifeDays(null, 'FRIDGE')).toBeNull();
  });
  it('dates the expiry from the purchase day, at noon UTC', () => {
    expect(estimateExpiry(apple, 'FRIDGE', '2026-11-07')?.toISOString()).toBe('2026-12-12T12:00:00.000Z');
    expect(estimateExpiry(lettuce, 'FRIDGE', '2026-12-28')?.toISOString()).toBe('2027-01-08T12:00:00.000Z'); // 10.5 days rounds to 11, across the year end
    expect(estimateExpiry(tomato, 'COUNTER', '2026-11-07')).toBeNull(); // "when ripe": no number to invent
    expect(estimateExpiry(apple, 'OTHER', '2026-11-07')).toBeNull();
  });
  it('suggests where each food keeps best', () => {
    expect(bestStorage(apple)).toBe('FRIDGE');
    expect(bestStorage(tomato)).toBe('PANTRY'); // room temperature until ripe
    expect(bestStorage(potato)).toBe('PANTRY');
    expect(bestStorage(onion)).toBe('FRIDGE');
    expect(bestStorage(lettuce)).toBe('FRIDGE');
    expect(bestStorage(null)).toBeNull();
  });
});
