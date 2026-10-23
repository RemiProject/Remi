import { expirationStatus, filterInventory, type CategoryId, type StorageId, type InventoryItem } from '../domain/inventory';
export interface KitchenFilters { category: CategoryId | 'all'; storage: StorageId | 'all'; sort: 'name' | 'expiry'; priority: boolean }
export const defaultKitchenFilters: KitchenFilters = { category: 'all', storage: 'all', sort: 'name', priority: false };
export const activeKitchenFilterCount = (filters: KitchenFilters) => Number(filters.category !== 'all') + Number(filters.storage !== 'all') + Number(filters.priority);
export function kitchenEmptyAction(items: readonly InventoryItem[], query: string, filters: KitchenFilters, today: string, language: 'en' | 'ar'): 'search' | 'filters' | null {
  const hasFilters = activeKitchenFilterCount(filters) > 0;
  if (hasFilters && kitchenView(items, query, 'all', 'all', 'name', false, today, language).length > 0) return 'filters';
  if (query.trim()) return 'search';
  return hasFilters ? 'filters' : null;
}
export function kitchenView(items: readonly InventoryItem[], query: string, category: CategoryId | 'all', storage: StorageId | 'all', sort: 'name' | 'expiry', priority: boolean, today: string, language: 'en' | 'ar') {
  return filterInventory(items, query, category, storage)
    .filter((item) => !priority || (item.expirationDate !== undefined && expirationStatus(item, today).days! <= 3))
    .sort((a, b) => {
      if (sort === 'expiry') {
        if (!a.expirationDate && b.expirationDate) return 1;
        if (a.expirationDate && !b.expirationDate) return -1;
        const order = (a.expirationDate ?? '').localeCompare(b.expirationDate ?? '');
        if (order) return order;
      }
      return a.name.localeCompare(b.name, language) || a.id.localeCompare(b.id);
    });
}
