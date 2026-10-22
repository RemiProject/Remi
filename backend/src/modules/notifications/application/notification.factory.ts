import { Injectable } from '@nestjs/common';
import type { Tx } from '@/platform/db/tx-context.js';
import { newId } from '@/shared/ids.js';

export type NotificationKind = 'EXPIRY_SOON' | 'LOW_STOCK' | 'RECOMMENDATION_READY' | 'SAFETY_REVIEW' | 'PURCHASE_RECEIVED' | 'MEMBER_CHANGED';

export interface CreateNotificationInput {
  householdId: string;
  userId: string;
  type: NotificationKind;
  dedupeKey: string;
  foodId?: string | null;
  inventoryItemId?: string | null;
  scheduledFor?: Date;
}

@Injectable()
export class NotificationFactory {
  async create(tx: Tx, input: CreateNotificationInput): Promise<string | null> {
    const id = newId();
    const created = await tx.$queryRaw<Array<{ id: string }>>`
      INSERT INTO "Notification" (id, "householdId", "userId", type, "foodId", "inventoryItemId", "dedupeKey", "scheduledFor")
      VALUES (${id}::uuid, ${input.householdId}::uuid, ${input.userId}::uuid, ${input.type}::"NotificationType",
        ${input.foodId ?? null}::uuid, ${input.inventoryItemId ?? null}::uuid, ${input.dedupeKey}, ${input.scheduledFor ?? new Date()}::timestamptz)
      ON CONFLICT ("userId", "dedupeKey") DO NOTHING RETURNING id`;
    if (!created.length) return null;

    const prefs = await tx.$queryRaw<Array<{ channel: 'PUSH' | 'EMAIL'; isEnabled: boolean }>>`
      SELECT channel::text AS channel, "isEnabled" FROM "NotificationPreference"
      WHERE "userId" = ${input.userId}::uuid AND type = ${input.type}::"NotificationType"`;
    const emailEnabled = prefs.find((p) => p.channel === 'EMAIL')?.isEnabled ?? false;
    const pushEnabled = prefs.find((p) => p.channel === 'PUSH')?.isEnabled ?? true;

    if (pushEnabled) {
      const devices = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT id FROM "UserDevice" WHERE "userId" = ${input.userId}::uuid AND "revokedAt" IS NULL`;
      for (const device of devices) {
        await tx.$executeRaw`INSERT INTO "NotificationDelivery" (id, "notificationId", "userId", "deviceId", channel, "nextAttemptAt")
          VALUES (${newId()}::uuid, ${id}::uuid, ${input.userId}::uuid, ${device.id}::uuid, 'PUSH', ${input.scheduledFor ?? new Date()}::timestamptz) ON CONFLICT DO NOTHING`;
      }
    }
    if (emailEnabled) {
      await tx.$executeRaw`INSERT INTO "NotificationDelivery" (id, "notificationId", "userId", channel, "nextAttemptAt")
        VALUES (${newId()}::uuid, ${id}::uuid, ${input.userId}::uuid, 'EMAIL', ${input.scheduledFor ?? new Date()}::timestamptz) ON CONFLICT DO NOTHING`;
    }
    return id;
  }
}
