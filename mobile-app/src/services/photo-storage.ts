import { Directory, File, Paths } from 'expo-file-system';
import { isPhotoRef } from '../domain/inventory';
import type { PhotoStorage } from './photo-storage.types';

const directory = () => new Directory(Paths.document, 'remy-food-photos');
const file = (ref: string) => {
  if (!isPhotoRef(ref)) throw new Error('Invalid photo reference');
  return new File(directory(), ref);
};
export const photoStorage: PhotoStorage = {
  async save(uri) {
    const source = new File(uri);
    const sourceSize = source.size;
    if (!source.exists || !Number.isFinite(sourceSize) || sourceSize <= 0) throw new Error('Photo unreadable');
    if (sourceSize > 20 * 1024 * 1024) throw new Error('Photo too large');
    const extension = uri.split('?')[0].split('.').pop()?.toLowerCase();
    if (!extension || !['jpg', 'jpeg', 'png', 'webp', 'heic', 'avif'].includes(extension)) throw new Error('Unsupported photo');
    directory().create({ intermediates: true, idempotent: true });
    const ref = `photo_${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}.${extension}`;
    const target = file(ref);
    if (target.exists) throw new Error('Photo reference collision');
    // SDK 57 copy is asynchronous. Verify only after the native operation completes.
    await source.copy(target);
    if (!target.exists || target.size !== sourceSize) throw new Error('Photo copy failed');
    return ref;
  },
  async resolve(ref) { const image = file(ref); return image.exists && image.size > 0 ? image.uri : null; },
  release() {},
  async remove(ref) { const image = file(ref); if (image.exists) image.delete(); },
};
