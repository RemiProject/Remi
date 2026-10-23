import { isPhotoRef } from '../domain/inventory';
import type { PhotoStorage } from './photo-storage.types';

function database(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('remy-food-photos', 1);
    request.onupgradeneeded = () => { request.result.createObjectStore('photos'); };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error('Photo storage blocked'));
  });
}
async function transaction<T>(mode: IDBTransactionMode, operation: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await database();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('photos', mode);
    const request = operation(tx.objectStore('photos'));
    tx.oncomplete = () => { db.close(); resolve(request.result); };
    tx.onabort = tx.onerror = () => { db.close(); reject(tx.error ?? request.error); };
  });
}
export const photoStorage: PhotoStorage = {
  async save(uri) {
    const response = await fetch(uri);
    if (!response.ok) throw new Error('Photo unavailable');
    const blob = await response.blob();
    if (!blob.type.startsWith('image/') || !blob.size) throw new Error('Photo unreadable');
    if (blob.size > 20 * 1024 * 1024) throw new Error('Photo too large');
    const ref = `photo_${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}.jpg`;
    await transaction('readwrite', (store) => store.add(blob, ref));
    return ref;
  },
  async resolve(ref) {
    if (!isPhotoRef(ref)) return null;
    const blob = await transaction<Blob | undefined>('readonly', (store) => store.get(ref));
    return blob instanceof Blob && blob.size ? URL.createObjectURL(blob) : null;
  },
  release(uri) { if (uri.startsWith('blob:')) URL.revokeObjectURL(uri); },
  async remove(ref) {
    if (!isPhotoRef(ref)) throw new Error('Invalid photo reference');
    await transaction('readwrite', (store) => store.delete(ref));
  },
};
