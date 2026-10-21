import type { Prisma } from '@/generated/client.js';

/** The Prisma client used inside a transaction. Every write-path repository method takes it first. */
export type Tx = Prisma.TransactionClient;

export interface TxScope {
  userId?: string;
  householdId?: string;
}
