import { StorageLocation } from '@/modules/inventory/storage-location.js';

export type MatchConfidence = 'HIGH' | 'MEDIUM' | 'NONE';

/**
 * How sure a catalogue match is. `wordScore` is how well the food's name appears as whole words in the
 * receipt line (pg_trgm strict_word_similarity); `wholeScore` compares the two strings as a whole.
 * A short food name found inside a long line ("cream" in "full cream milk") has a high word score but a
 * low whole score, so it is only a suggestion the person confirms.
 */
export function matchConfidence(wordScore: number, wholeScore: number): MatchConfidence {
  if (wordScore >= 0.8 && wholeScore >= 0.4) return 'HIGH';
  if (wordScore >= 0.6) return 'MEDIUM';
  return 'NONE';
}

const FROZEN = /(?<![\p{L}])(?:frozen|ice cream|ice|مجمد|مجمدة|فريزر|آيس كريم|ايس كريم)(?![\p{L}])/iu;
const DRY_VEGETABLES = /(?<![\p{L}])(?:onions?|garlic|potato(?:es)?|sweet potato(?:es)?|shallots?|dried|canned|بصل|ثوم|بطاطس|بطاطا|مجفف|معلب)(?![\p{L}])/iu;
const FRIDGE_FRUIT = /(?<![\p{L}])(?:berr(?:y|ies)|strawberr(?:y|ies)|grapes?|cherr(?:y|ies)|figs?|kiwi|cut|فراولة|عنب|كرز|تين|توت)(?![\p{L}])/iu;
const FRIDGE_OTHER = /(?<![\p{L}])(?:fresh|juice|tahini|hummus|labneh|mayonnaise|عصير|طحينة|حمص بطحينة|لبنة|مايونيز)(?![\p{L}])/iu;

/** Where a newly bought food usually goes, from its catalogue category and name. The person can change it. */
export function suggestedStorage(categoryCode: string, name: string): StorageLocation {
  if (FROZEN.test(name)) return StorageLocation.FREEZER;
  switch (categoryCode) {
    case 'DAIRY': case 'MEAT': case 'POULTRY': case 'FISH': case 'EGGS': case 'SOY': return StorageLocation.FRIDGE;
    case 'VEGETABLES': return DRY_VEGETABLES.test(name) ? StorageLocation.PANTRY : StorageLocation.FRIDGE;
    case 'FRUITS': return FRIDGE_FRUIT.test(name) ? StorageLocation.FRIDGE : StorageLocation.COUNTER;
    case 'BEVERAGES': case 'CONDIMENTS': return FRIDGE_OTHER.test(name) ? StorageLocation.FRIDGE : StorageLocation.PANTRY;
    default: return StorageLocation.PANTRY;
  }
}
