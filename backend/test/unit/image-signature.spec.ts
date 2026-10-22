import { describe, expect, it } from 'vitest';
import { detectImageMime, imageKeyPrefix } from '@/modules/media/domain/image-signature.js';

const bytes = (...parts: Array<number[] | string>) =>
  new Uint8Array(parts.flatMap((part) => (typeof part === 'string' ? [...part].map((c) => c.charCodeAt(0)) : part)));

describe('detectImageMime', () => {
  it('recognizes jpeg, png, webp and heic signatures', () => {
    expect(detectImageMime(bytes([0xff, 0xd8, 0xff, 0xe0]))).toBe('image/jpeg');
    expect(detectImageMime(bytes([0x89], 'PNG', [0x0d, 0x0a]))).toBe('image/png');
    expect(detectImageMime(bytes('RIFF', [0, 0, 0, 0], 'WEBP'))).toBe('image/webp');
    expect(detectImageMime(bytes([0, 0, 0, 0x18], 'ftyp', 'heic'))).toBe('image/heic');
  });

  it('rejects files that only claim to be images', () => {
    expect(detectImageMime(bytes('%PDF-1.7'))).toBeNull();
    expect(detectImageMime(bytes('<svg xmlns'))).toBeNull();
    expect(detectImageMime(new Uint8Array())).toBeNull();
  });

  it('scopes storage keys to the household', () => {
    expect(imageKeyPrefix('h1')).toBe('households/h1/images/');
    expect('households/h2/images/x'.startsWith(imageKeyPrefix('h1'))).toBe(false);
  });
});
