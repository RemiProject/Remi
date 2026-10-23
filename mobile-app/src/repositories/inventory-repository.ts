import { isInventoryItem, type InventoryItem } from '../domain/inventory';

export interface InventoryRepository {
  read(): Promise<InventoryItem[]>;
  write(items: readonly InventoryItem[]): Promise<void>;
}
export interface KeyValueStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
}
export const INVENTORY_KEY = 'remy.inventory';
export const INVENTORY_SCHEMA_VERSION = 2;

export function validateItems(value: unknown): value is InventoryItem[] {
  return Array.isArray(value) && value.every(isInventoryItem) && new Set(value.map((item) => item.id)).size === value.length;
}

// The injected storage boundary also permits deterministic read/write-failure tests.
export class StoredInventoryRepository implements InventoryRepository {
  constructor(private storage: KeyValueStorage) {}
  async read() {
    const raw = await this.storage.getItem(INVENTORY_KEY);
    if (raw === null) return [];
    const envelope: unknown = JSON.parse(raw);
    if (typeof envelope !== 'object' || envelope === null || Array.isArray(envelope)) throw new Error('Invalid inventory envelope');
    const record = envelope as Record<string, unknown>;
    if ((record.version !== 1 && record.version !== INVENTORY_SCHEMA_VERSION) || Object.keys(record).some((key) => key !== 'version' && key !== 'items') || !validateItems(record.items)
      || (record.version === 1 && record.items.some((item) => Object.hasOwn(item, 'photoRef'))))
      throw new Error('Unsupported or invalid saved inventory');
    return record.items;
  }
  async write(items: readonly InventoryItem[]) {
    if (!validateItems(items)) throw new Error('Invalid inventory cannot be saved');
    await this.storage.setItem(INVENTORY_KEY, JSON.stringify({ version: INVENTORY_SCHEMA_VERSION, items }));
  }
}
