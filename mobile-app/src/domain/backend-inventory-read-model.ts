import type { BackendInventoryItem, BackendInventoryItemDetail, BackendStorageLocation, BackendUnit, Decimal } from './backend-inventory';
import type { StorageId, UnitId } from './inventory';
import { formatDecimal, parseDecimal } from './inventory-decimal';
import { toMobileStorage, toMobileUnit } from './inventory-enum-adapters';

// Separate from the local editable model: do not invent category, purchase dates,
// notes or photos that the backend does not supply.
export interface InventoryReadItem {
  id: string;
  foodId: string;
  name: string;
  quantity: Decimal;
  unitId: UnitId | null;
  storageId: StorageId | null;
  backendUnit: BackendUnit;
  backendStorageLocation: BackendStorageLocation;
  readOnly: boolean;
  expirationDate: string | null;
  version: number;
}

export interface InventoryReadDetail extends InventoryReadItem {
  // inventoryItem returns a transaction page, not the complete transaction history.
  transactions: BackendInventoryItemDetail['transactions'];
}

/** The returned calendar day expires at the end of that day in household time. */
export function inventoryExpiryDay(timestamp: string | null, timezone: string): string | null {
  if (timestamp === null) return null;
  if (typeof timestamp !== 'string' || !/T.*(?:Z|[+-]\d{2}:\d{2})$/.test(timestamp)) {
    throw new Error('Invalid backend inventory expiry timestamp.');
  }
  const date = new Date(timestamp);
  if (!Number.isFinite(date.getTime())) throw new Error('Invalid backend inventory expiry timestamp.');
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone, calendar: 'gregory', numberingSystem: 'latn',
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find(p => p.type === type)!.value;
  return `${part('year').padStart(4, '0')}-${part('month')}-${part('day')}`;
}

export function mapInventoryReadItem(item: BackendInventoryItem, timezone: string): InventoryReadItem {
  const unit = toMobileUnit(item.unit);
  const storage = toMobileStorage(item.storageLocation);
  return {
    id: item.id, foodId: item.foodId, name: item.foodName,
    quantity: formatDecimal(parseDecimal(item.quantity)),
    unitId: unit.supported ? unit.value : null,
    storageId: storage.supported ? storage.value : null,
    backendUnit: item.unit, backendStorageLocation: item.storageLocation,
    readOnly: !unit.supported || !storage.supported,
    expirationDate: inventoryExpiryDay(item.estimatedExpiryAt, timezone),
    version: item.version,
  };
}
