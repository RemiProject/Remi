import type { InventoryReadItem } from '../domain/backend-inventory-read-model';
import { backendKitchenMessages } from '../i18n/backend-kitchen';
import { homeUnitLabels } from '../i18n/home';
import { inventoryMessages } from '../i18n/inventory';

export function backendFoodName(item: InventoryReadItem, language: 'en' | 'ar'): string {
  return language === 'ar' ? item.arabicName?.trim() || item.name : item.name.charAt(0).toLocaleUpperCase('en') + item.name.slice(1);
}
export function backendUnitLabel(item: InventoryReadItem, language: 'en' | 'ar'): string {
  if (item.unitId) return homeUnitLabels[language][item.unitId];
  const labels: Partial<Record<string, string>> = backendKitchenMessages[language];
  return labels[item.backendUnit] ?? item.backendUnit;
}
export function backendStorageLabel(item: InventoryReadItem, language: 'en' | 'ar'): string {
  if (item.storageId) return inventoryMessages[language][item.storageId];
  const labels: Partial<Record<string, string>> = backendKitchenMessages[language];
  return labels[item.backendStorageLocation] ?? item.backendStorageLocation;
}
export function backendQuantityLabel(item: InventoryReadItem, language: 'en' | 'ar'): string {
  return `${inventoryNumberLabel(displayInventoryQuantity(item.quantity), language)} ${backendUnitLabel(item, language)}`;
}
/** Isolate only the number; the surrounding Arabic sentence keeps its RTL base. */
export function inventoryNumberLabel(value: string, language: 'en' | 'ar'): string {
  return language === 'ar' ? `\u2066${value}\u2069` : value;
}
export function backendRowSubtitle(item: InventoryReadItem, language: 'en' | 'ar'): string {
  const storage = backendStorageLabel(item, language);
  return `${backendQuantityLabel(item, language)} · ${storage}`;
}

export function displayInventoryQuantity(value: string): string {
  return value.includes('.') ? value.replace(/0+$/, '').replace(/\.$/, '') : value;
}
export function backendExpiryDays(item: InventoryReadItem, today: string): number | null {
  if (!item.expirationDate || !today) return null;
  return (Date.parse(`${item.expirationDate}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86400000;
}
export function backendKitchenView(items: readonly InventoryReadItem[], query: string, storage: string, sort: 'name' | 'expiry', priority: boolean, today: string, language: 'en' | 'ar') {
  const term = query.trim().toLocaleLowerCase(language);
  return items.filter(item => [item.name, backendFoodName(item, language)].some(name => name.toLocaleLowerCase(language).includes(term))
    && (storage === 'all' || (item.storageId ?? item.backendStorageLocation) === storage)
    && (!priority || (backendExpiryDays(item, today) !== null && backendExpiryDays(item, today)! <= 3)))
    .sort((a, b) => (sort === 'expiry' ? (a.expirationDate ?? '9999').localeCompare(b.expirationDate ?? '9999') : 0)
      || backendFoodName(a, language).localeCompare(backendFoodName(b, language), language) || a.id.localeCompare(b.id));
}
