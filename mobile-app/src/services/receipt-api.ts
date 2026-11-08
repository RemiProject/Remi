import { kitchenRequest } from './kitchen-api';
import type { ReceiptLineMatch, Storage } from '@/domain/receipt-review';
import type { ReceiptUnit } from '@/domain/receipt-parser';

const option = 'foodId name arabicName categoryCode categoryName defaultUnit gramsPerPiece storageLocation score';
const matchQuery = `query MatchReceiptItems($names: [String!]!) { matchReceiptItems(names: $names) { query confidence food { ${option} } alternatives { ${option} } inKitchen { quantity unit } } }`;
const receiveMutation = 'mutation ReceiveReceipt($input: ReceiveReceiptInput!) { receiveReceipt(input: $input) { added replayed items { foodId inventoryItemId quantity unit } } }';

/** Catalogue matches for cleaned receipt item names, in the same order. */
export async function matchReceiptItems(names: string[]): Promise<ReceiptLineMatch[]> {
  if (!names.length) return [];
  return (await kitchenRequest<{ matchReceiptItems: ReceiptLineMatch[] }>(matchQuery, { names })).matchReceiptItems;
}

export interface ReceiveReceiptInput {
  idempotencyKey: string; purchaseDate?: string;
  items: { foodId: string; amount: string; unit: ReceiptUnit; storageLocation: Storage }[];
}
/** Adds all confirmed lines in one transaction; repeating the same key adds nothing twice. */
export async function receiveReceipt(input: ReceiveReceiptInput) {
  return (await kitchenRequest<{ receiveReceipt: { added: number; replayed: boolean; items: { foodId: string; inventoryItemId: string; quantity: string; unit: string }[] } }>(receiveMutation, { input })).receiveReceipt;
}
