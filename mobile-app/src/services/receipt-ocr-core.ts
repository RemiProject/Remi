import type { PhotoStorage } from './photo-storage.types';

export type ReceiptResult = { status: 'success' | 'empty' | 'unavailable' | 'error'; text: string };
export interface ReceiptEngine { isSupported: boolean; extractTextFromImage(uri: string): Promise<string[]> }
export function receiptImageUri(uri: string, platform: string) {
  return platform === 'android' && uri.startsWith('file://') ? decodeURIComponent(uri.slice(7)) : uri;
}
export async function recognizeReceipt(ref: string, storage: PhotoStorage, engine: ReceiptEngine | null, platform: string): Promise<ReceiptResult> {
  if (!engine?.isSupported || platform === 'web') return { status: 'unavailable', text: '' };
  let uri: string | null = null;
  try {
    uri = await storage.resolve(ref);
    if (!uri) return { status: 'error', text: '' };
    const lines = await engine.extractTextFromImage(receiptImageUri(uri, platform));
    const text = lines.filter((line) => typeof line === 'string').join('\n').trim();
    return { status: text ? 'success' : 'empty', text };
  } catch { return { status: 'error', text: '' }; }
  finally { if (uri) storage.release(uri); }
}
