import { SetMetadata } from '@nestjs/common';

export const OUTBOX_HANDLER_TOPIC = 'outbox:handler:topic';

export interface OutboxMessage<P = any> {
  id: bigint;
  topic: string;
  householdId: string | null;
  dedupeKey: string;
  payload: P;
  attempts: number;
}

/** Handlers MUST be idempotent: a row can be executed more than once. They run OUTSIDE any DB transaction. */
export interface OutboxHandlerPort<P = any> {
  handle(message: OutboxMessage<P>): Promise<void>;
}

/** Marks a provider as the handler for an outbox topic. Discovered automatically at boot. */
export const OutboxHandler = (topic: string): ClassDecorator => SetMetadata(OUTBOX_HANDLER_TOPIC, topic);
