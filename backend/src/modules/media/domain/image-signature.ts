/** Detects the real image type from its first bytes. The client-declared mime type is never trusted. */
export const IMAGE_SIGNATURE_BYTES = 12;

export function detectImageMime(bytes: Uint8Array): string | null {
  const ascii = (from: number, to: number) => String.fromCharCode(...bytes.slice(from, to));
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if (bytes[0] === 0x89 && ascii(1, 4) === 'PNG') return 'image/png';
  if (ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP') return 'image/webp';
  if (ascii(4, 8) === 'ftyp' && ['heic', 'heix', 'heif', 'mif1', 'msf1'].includes(ascii(8, 12))) return 'image/heic';
  return null;
}

/** Keys are namespaced per household, so a confirm can never claim another household's object. */
export const imageKeyPrefix = (householdId: string): string => `households/${householdId}/images/`;
