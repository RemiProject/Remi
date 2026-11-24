import type { PhotoStorage } from './photo-storage.types';
import { rowsFromLines, type OcrLine } from '../domain/receipt-parser';

/** `rows` are the receipt's printed rows top to bottom; `text` is the same joined for editing. */
export type ReceiptResult = { status: 'success' | 'empty' | 'unavailable' | 'error'; text: string; rows: string[] };
export interface ReceiptEngine { isSupported: boolean; extractTextFromImage(uri: string): Promise<string[]> }
/** Remi's own Vision module: lines with positions, so name and price on one printed row are joined. */
export interface ReceiptVisionEngine { isSupported: boolean; recognize(uri: string): Promise<{ lines: OcrLine[]; width: number; height: number }> }
export function receiptImageUri(uri: string, platform: string) {
  return platform === 'android' && uri.startsWith('file://') ? decodeURIComponent(uri.slice(7)) : uri;
}
const none = (status: ReceiptResult['status']): ReceiptResult => ({ status, text: '', rows: [] });
export async function recognizeReceipt(ref: string, storage: PhotoStorage, engine: ReceiptEngine | null, platform: string, vision: ReceiptVisionEngine | null = null): Promise<ReceiptResult> {
  if ((!engine?.isSupported && !vision?.isSupported) || platform === 'web') return none('unavailable');
  let uri: string | null = null;
  try {
    uri = await storage.resolve(ref);
    if (!uri) return none('error');
    let rows: string[];
    if (vision?.isSupported) {
      const result = await vision.recognize(receiptImageUri(uri, platform));
      rows = rowsFromLines(result.lines.filter(line => typeof line?.text === 'string'), result.width || 1, result.height || 1);
    } else {
      rows = (await engine!.extractTextFromImage(receiptImageUri(uri, platform))).filter((line) => typeof line === 'string');
    }
    rows = rows.map(row => row.trim()).filter(Boolean);
    const text = rows.join('\n');
    return { status: text ? 'success' : 'empty', text, rows };
  } catch { return none('error'); }
  finally { if (uri) storage.release(uri); }
}
