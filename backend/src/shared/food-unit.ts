export enum Unit {
  GRAM = 'GRAM',
  KILOGRAM = 'KILOGRAM',
  MILLILITER = 'MILLILITER',
  LITER = 'LITER',
  CUP = 'CUP',
  TABLESPOON = 'TABLESPOON',
  TEASPOON = 'TEASPOON',
  PIECE = 'PIECE',
}

/** Versioned kitchen measures. A US customary cup is intentionally not used. */
export const UNIT_CONSTANTS_VERSION = 1;
export const MILLILITERS_PER_UNIT: Readonly<Partial<Record<Unit, number>>> = Object.freeze({
  [Unit.MILLILITER]: 1,
  [Unit.LITER]: 1000,
  [Unit.CUP]: 240,
  [Unit.TABLESPOON]: 15,
  [Unit.TEASPOON]: 5,
});
