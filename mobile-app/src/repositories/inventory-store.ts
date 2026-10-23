import { isInventoryItem, type InventoryInput, type InventoryItem } from '../domain/inventory';
import { validateItems, type InventoryRepository } from './inventory-repository';
import type { PhotoStorage } from '../services/photo-storage.types';

export type InventoryError = { operation: 'read' | 'write'; message: string };
export interface InventorySnapshot {
  items: readonly InventoryItem[];
  status: 'idle' | 'loading' | 'ready' | 'error';
  pendingWrites: number;
  error: InventoryError | null;
}
const initialSnapshot: InventorySnapshot = { items: [], status: 'idle', pendingWrites: 0, error: null };
let idSequence = 0;
const generateId = () => `food_${Date.now().toString(36)}_${(++idSequence).toString(36)}_${Math.random().toString(36).slice(2, 12)}`;

export class InventoryStore {
  private snapshot = initialSnapshot;
  private listeners = new Set<() => void>();
  private readPromise: Promise<void> | null = null;
  private writeQueue: Promise<unknown> = Promise.resolve();
  constructor(private repository: InventoryRepository, private photos?: PhotoStorage) {}
  getSnapshot = () => this.snapshot;
  getServerSnapshot = () => initialSnapshot;
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  private publish(changes: Partial<InventorySnapshot>) {
    this.snapshot = { ...this.snapshot, ...changes };
    this.listeners.forEach((listener) => listener());
  }
  hydrate = (): Promise<void> => {
    if (this.readPromise) return this.readPromise;
    if (this.snapshot.status === 'ready') return Promise.resolve();
    this.publish({ status: 'loading', error: null });
    this.readPromise = this.repository.read().then((items) => {
      if (!validateItems(items)) throw new Error('Invalid inventory');
      this.publish({ items, status: 'ready', error: null });
    }).catch(() => {
      this.publish({ status: 'error', error: { operation: 'read', message: 'Saved inventory could not be read. Nothing has been replaced. Check storage access or restore valid saved data, then retry.' } });
    }).finally(() => { this.readPromise = null; });
    return this.readPromise;
  };

  private mutate<T>(operation: (items: readonly InventoryItem[]) => { items: InventoryItem[]; result: T }): Promise<T> {
    if (this.snapshot.status !== 'ready') return Promise.reject(new Error('Inventory must finish loading successfully before changes can be saved.'));
    this.publish({ pendingWrites: this.snapshot.pendingWrites + 1 });
    const task = this.writeQueue.then(async () => {
      try {
        const next = operation(this.snapshot.items);
        const previousPhotos = new Set(this.snapshot.items.map((item) => item.photoRef).filter((ref): ref is string => !!ref));
        if (this.photos) for (const ref of new Set(next.items.map((item) => item.photoRef))) {
          if (ref && !previousPhotos.has(ref)) {
            const uri = await this.photos.resolve(ref);
            if (!uri) throw new Error('Photo unavailable');
            this.photos.release(uri);
          }
        }
        await this.repository.write(next.items);
        this.publish({ items: next.items, error: null });
        // Remain inside the mutation queue: no later write can race with this check.
        if (this.photos) for (const ref of previousPhotos) {
          if (!next.items.some((item) => item.photoRef === ref)) {
            try { await this.photos.remove(ref); } catch { /* Safe orphan; never fail a committed inventory write. */ }
          }
        }
        return next.result;
      } catch (error) {
        const message = error instanceof InventoryOperationError ? error.message : 'Could not save inventory. Your current data has not changed. Check device storage and retry.';
        this.publish({ error: { operation: 'write', message } });
        throw new Error(message);
      } finally {
        this.publish({ pendingWrites: this.snapshot.pendingWrites - 1 });
      }
    });
    this.writeQueue = task.catch(() => undefined);
    return task;
  }
  create = (input: InventoryInput) => this.mutate((items) => {
    let id = generateId();
    while (items.some((item) => item.id === id)) id = generateId();
    const timestamp = new Date().toISOString();
    const item: InventoryItem = { ...input, id, createdAt: timestamp, updatedAt: timestamp };
    if (!isInventoryItem(item)) throw new InventoryOperationError('The food details are invalid. Review the form before saving.');
    return { items: [...items, item], result: item };
  });
  update = (id: string, input: InventoryInput) => this.mutate((items) => {
    const existing = items.find((item) => item.id === id);
    if (!existing) throw new InventoryOperationError('This item no longer exists. Return to Kitchen.');
    const item: InventoryItem = { ...input, id: existing.id, createdAt: existing.createdAt, updatedAt: new Date(Math.max(Date.now(), Date.parse(existing.updatedAt))).toISOString() };
    if (!isInventoryItem(item)) throw new InventoryOperationError('The food details are invalid. Review the form before saving.');
    return { items: items.map((entry) => entry.id === id ? item : entry), result: item };
  });
  delete = (id: string) => this.mutate((items) => {
    if (!items.some((item) => item.id === id)) throw new InventoryOperationError('This item no longer exists. Return to Kitchen.');
    return { items: items.filter((item) => item.id !== id), result: undefined };
  });
}
class InventoryOperationError extends Error {}
