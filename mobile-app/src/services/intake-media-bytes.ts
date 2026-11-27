import { File } from 'expo-file-system';
export async function intakeImageBytes(uri: string) {
  const file = new File(uri);
  if (!file.exists || file.size <= 0) throw new Error('This image could not be read.');
  const bytes = await file.bytes();
  const extension = uri.split('?')[0].split('.').pop()?.toLowerCase();
  const mimeType = extension === 'png' ? 'image/png' : extension === 'webp' ? 'image/webp' : extension === 'heic' ? 'image/heic' : extension === 'jpg' || extension === 'jpeg' ? 'image/jpeg' : null;
  if (!mimeType) throw new Error('Choose a JPEG, PNG, WebP or HEIC photo.');
  return { body: Uint8Array.from(bytes).buffer, mimeType, sizeBytes: bytes.byteLength };
}
