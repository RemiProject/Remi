import { Injectable } from '@nestjs/common';
import type { Tx } from '@/platform/db/tx-context.js';

export interface OutboxEventInput {
  topic: string;
  dedupeKey: string;
  householdId?: string | null;
  payload: Record<string, unknown>;
}

@Injectable()
export class OutboxPublisher {
  /** Must be called with the SAME tx as the business write. Publishing twice with the same open key is a no-op. */
  async publish(tx: Tx, event: OutboxEventInput): Promise<void> {
    await tx.$executeRaw`
      INSERT INTO "OutboxEvent" ("topic", "dedupeKey", "householdId", "payload")
      VALUES (${event.topic}, ${event.dedupeKey}, ${event.householdId ?? null}::uuid, ${JSON.stringify(event.payload)}::jsonb)
      ON CONFLICT ("topic", "dedupeKey") WHERE "processedAt" IS NULL AND "deadLetteredAt" IS NULL DO NOTHING`;
  }
}
