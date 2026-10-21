import { DomainError } from '@/shared/domain-error.js';

export type PurchaseOrderStatusValue = 'DRAFT' | 'PLACED' | 'CONFIRMED' | 'DELIVERED' | 'CANCELLED';

const transitions: Record<PurchaseOrderStatusValue, readonly PurchaseOrderStatusValue[]> = {
  DRAFT: ['PLACED', 'CANCELLED'],
  PLACED: ['CONFIRMED', 'CANCELLED'],
  CONFIRMED: ['DELIVERED', 'CANCELLED'],
  DELIVERED: [],
  CANCELLED: [],
};

export class PurchaseOrderStateMachine {
  static assertTransition(from: PurchaseOrderStatusValue, to: PurchaseOrderStatusValue): void {
    if (from !== to && !transitions[from].includes(to)) {
      throw new DomainError('INVALID_PURCHASE_ORDER_TRANSITION', `Cannot transition a purchase order from ${from} to ${to}.`, 409);
    }
  }
}
