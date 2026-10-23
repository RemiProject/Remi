import type { ReceiptResult } from './receipt-ocr-core';
export async function scanReceipt(_ref: string): Promise<ReceiptResult> {
  return { status: 'unavailable', text: '' };
}
