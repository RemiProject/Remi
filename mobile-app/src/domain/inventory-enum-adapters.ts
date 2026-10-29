import { BackendStorageLocation, BackendUnit } from './backend-inventory';
import type { StorageId, UnitId } from './inventory';

export type EnumAdapterResult<T> =
  | { supported: true; value: T }
  | { supported: false; input: string; reason: 'UNSUPPORTED_UNIT' | 'UNSUPPORTED_STORAGE' };

export function toBackendUnit(input: UnitId): EnumAdapterResult<BackendUnit> {
  switch (input) {
    case 'g': return { supported: true, value: BackendUnit.GRAM };
    case 'kg': return { supported: true, value: BackendUnit.KILOGRAM };
    case 'ml': return { supported: true, value: BackendUnit.MILLILITER };
    case 'l': return { supported: true, value: BackendUnit.LITER };
    case 'pieces': return { supported: true, value: BackendUnit.PIECE };
    case 'cups': return { supported: true, value: BackendUnit.CUP };
    default: return { supported: false, input, reason: 'UNSUPPORTED_UNIT' };
  }
}

export function toMobileUnit(input: BackendUnit): EnumAdapterResult<UnitId> {
  switch (input) {
    case BackendUnit.GRAM: return { supported: true, value: 'g' };
    case BackendUnit.KILOGRAM: return { supported: true, value: 'kg' };
    case BackendUnit.MILLILITER: return { supported: true, value: 'ml' };
    case BackendUnit.LITER: return { supported: true, value: 'l' };
    case BackendUnit.PIECE: return { supported: true, value: 'pieces' };
    case BackendUnit.CUP: return { supported: true, value: 'cups' };
    default: return { supported: false, input, reason: 'UNSUPPORTED_UNIT' };
  }
}

export function toBackendStorage(input: StorageId): EnumAdapterResult<BackendStorageLocation> {
  switch (input) {
    case 'refrigerator': return { supported: true, value: BackendStorageLocation.FRIDGE };
    case 'freezer': return { supported: true, value: BackendStorageLocation.FREEZER };
    case 'pantry': return { supported: true, value: BackendStorageLocation.PANTRY };
    default: return { supported: false, input, reason: 'UNSUPPORTED_STORAGE' };
  }
}

export function toMobileStorage(input: BackendStorageLocation): EnumAdapterResult<StorageId> {
  switch (input) {
    case BackendStorageLocation.FRIDGE: return { supported: true, value: 'refrigerator' };
    case BackendStorageLocation.FREEZER: return { supported: true, value: 'freezer' };
    case BackendStorageLocation.PANTRY: return { supported: true, value: 'pantry' };
    default: return { supported: false, input, reason: 'UNSUPPORTED_STORAGE' };
  }
}
