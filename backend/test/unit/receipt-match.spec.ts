import { describe, expect, it } from 'vitest';
import { matchConfidence, suggestedStorage } from '@/modules/receipts/domain/receipt-match.js';

describe('matchConfidence', () => {
  it('is high only when the food name covers the line', () => {
    expect(matchConfidence(1, 1)).toBe('HIGH'); // "tomatoes" → tomato
    expect(matchConfidence(1, 0.65)).toBe('HIGH'); // "chicken breast boneless" → chicken breast
  });
  it('asks for a check when a short name sits inside a long line', () => {
    expect(matchConfidence(1, 0.25)).toBe('MEDIUM'); // "cream" inside "juhayna full cream milk"
    expect(matchConfidence(0.63, 0.42)).toBe('MEDIUM');
  });
  it('gives up on brand names the catalogue does not know', () => {
    expect(matchConfidence(0.3, 0.17)).toBe('NONE'); // "nescafe classic"
  });
});

describe('suggestedStorage', () => {
  it('follows the category, with exceptions by name', () => {
    expect(suggestedStorage('DAIRY', 'whole milk')).toBe('FRIDGE');
    expect(suggestedStorage('POULTRY', 'chicken breast')).toBe('FRIDGE');
    expect(suggestedStorage('VEGETABLES', 'tomato')).toBe('FRIDGE');
    expect(suggestedStorage('VEGETABLES', 'onion')).toBe('PANTRY');
    expect(suggestedStorage('VEGETABLES', 'frozen spinach')).toBe('FREEZER');
    expect(suggestedStorage('FRUITS', 'banana')).toBe('PANTRY');
    expect(suggestedStorage('FRUITS', 'strawberry')).toBe('FRIDGE');
    expect(suggestedStorage('GRAINS', 'basmati rice')).toBe('PANTRY');
    expect(suggestedStorage('SWEETS', 'chocolate ice cream')).toBe('FREEZER');
    expect(suggestedStorage('CONDIMENTS', 'tahini')).toBe('FRIDGE');
  });
});
