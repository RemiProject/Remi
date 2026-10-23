import { validShoppingItem, type ShoppingItem, type ShoppingInput } from '../domain/shopping';
import type { KeyValueStorage } from './inventory-repository';
export const SHOPPING_KEY = 'remy.shopping-list';
const initial = { items: [] as readonly ShoppingItem[], status: 'loading' as 'loading' | 'ready' | 'error', pending: false, writeError: false };
let sequence = 0;
export class ShoppingStore {
  private snapshot = initial;
  private listeners = new Set<() => void>();
  private reading: Promise<void> | null = null;
  private queue: Promise<unknown> = Promise.resolve();
  constructor(private storage: KeyValueStorage) {}
  getSnapshot = () => this.snapshot;
  getServerSnapshot = () => initial;
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  private publish(changes: Partial<typeof initial>) { this.snapshot = { ...this.snapshot, ...changes }; this.listeners.forEach((listener) => listener()); }
  hydrate = () => {
    if (this.reading) return this.reading;
    if (this.snapshot.status === 'ready') return Promise.resolve();
    this.publish({ status: 'loading' });
    this.reading = this.storage.getItem(SHOPPING_KEY).then((raw) => {
      const data = raw === null ? { version: 1, items: [] } : JSON.parse(raw);
      if (!data || typeof data !== 'object' || Array.isArray(data) || data.version !== 1 || Object.keys(data).length !== 2 || !Array.isArray(data.items) || !data.items.every(validShoppingItem) || new Set(data.items.map((item: ShoppingItem) => item.id)).size !== data.items.length) throw new Error('Invalid shopping list');
      this.publish({ items: data.items, status: 'ready', writeError: false });
    }).catch(() => { this.publish({ status: 'error' }); }).finally(() => { this.reading = null; });
    return this.reading;
  };
  private mutate(operation: (items: readonly ShoppingItem[]) => ShoppingItem[]) {
    if (this.snapshot.status !== 'ready') return Promise.reject(new Error('Shopping list not ready'));
    const task = this.queue.then(async () => {
      this.publish({ pending: true, writeError: false });
      try {
        const next = operation(this.snapshot.items);
        if (!next.every(validShoppingItem)) throw new Error('Invalid shopping item');
        await this.storage.setItem(SHOPPING_KEY, JSON.stringify({ version: 1, items: next }));
        this.publish({ items: next });
      } catch (error) { this.publish({ writeError: true }); throw error; }
      finally { this.publish({ pending: false }); }
    });
    this.queue = task.catch(() => undefined); return task;
  }
  save = (input: ShoppingInput, id?: string) => this.mutate((items) => {
    const previous = id ? items.find((item) => item.id === id) : undefined;
    if (id && !previous) throw new Error('Item not found');
    const timestamp = new Date(Math.max(Date.now(), previous ? Date.parse(previous.updatedAt) : 0)).toISOString();
    let nextId: string;
    do { nextId = `shopping_${Date.now().toString(36)}_${(++sequence).toString(36)}`; } while (items.some((item) => item.id === nextId));
    const item: ShoppingItem = { ...input, id: previous?.id ?? nextId, purchased: previous?.purchased ?? false, createdAt: previous?.createdAt ?? timestamp, updatedAt: timestamp };
    return previous ? items.map((entry) => entry.id === id ? item : entry) : [...items, item];
  });
  toggle = (id: string) => this.mutate((items) => {
    if (!items.some((item) => item.id === id)) throw new Error('Item not found');
    return items.map((item) => item.id === id ? { ...item, purchased: !item.purchased, updatedAt: new Date(Math.max(Date.now(), Date.parse(item.updatedAt))).toISOString() } : item);
  });
  remove = (id: string) => this.mutate((items) => { if (!items.some((item) => item.id === id)) throw new Error('Item not found'); return items.filter((item) => item.id !== id); });
  clearPurchased = () => this.mutate((items) => items.filter((item) => !item.purchased));
}
