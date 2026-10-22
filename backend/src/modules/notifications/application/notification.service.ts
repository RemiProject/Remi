import { Injectable } from '@nestjs/common';
import { TransactionRunner } from '@/platform/db/transaction-runner.js';
import { DomainError } from '@/shared/domain-error.js';
import { newId } from '@/shared/ids.js';
import type { NotificationKind } from './notification.factory.js';

export type NotificationPlatform = 'IOS' | 'ANDROID' | 'WEB';
export type NotificationChannelName = 'PUSH' | 'EMAIL';

@Injectable()
export class NotificationService {
  constructor(private readonly transactions: TransactionRunner) {}

  async unreadCount(userId: string): Promise<number> {
    return this.transactions.run(async (tx) => {
      const rows = await tx.$queryRaw<Array<{ count: bigint }>>`
        SELECT count(*)::bigint AS count FROM "Notification" WHERE "userId" = ${userId}::uuid AND "readAt" IS NULL`;
      return Number(rows[0]?.count ?? 0n);
    }, { userId });
  }

  async devices(userId: string) {
    return this.transactions.run((tx) => tx.$queryRaw<Array<{ id: string; platform: NotificationPlatform; appVersion: string | null; lastSeenAt: Date; revokedAt: Date | null }>>`
      SELECT id, platform::text AS platform, "appVersion", "lastSeenAt", "revokedAt" FROM "UserDevice"
      WHERE "userId" = ${userId}::uuid ORDER BY "createdAt" DESC, id`, { userId });
  }

  async preferences(userId: string) {
    return this.transactions.run(async (tx) => {
      const configured = await tx.$queryRaw<Array<{ type: NotificationKind; channel: NotificationChannelName; isEnabled: boolean; quietHoursStart: string | null; quietHoursEnd: string | null; updatedAt: Date }>>`
        SELECT type::text AS type, channel::text AS channel, "isEnabled", "quietHoursStart"::text AS "quietHoursStart", "quietHoursEnd"::text AS "quietHoursEnd", "updatedAt"
        FROM "NotificationPreference" WHERE "userId" = ${userId}::uuid`;
      const byKey = new Map(configured.map((item) => [`${item.type}:${item.channel}`, item]));
      const types: NotificationKind[] = ['EXPIRY_SOON', 'LOW_STOCK', 'RECOMMENDATION_READY', 'SAFETY_REVIEW', 'PURCHASE_RECEIVED', 'MEMBER_CHANGED'];
      const channels: NotificationChannelName[] = ['PUSH', 'EMAIL'];
      return types.flatMap((type) => channels.map((channel) => byKey.get(`${type}:${channel}`) ?? {
        type, channel, isEnabled: channel === 'PUSH', quietHoursStart: null, quietHoursEnd: null, updatedAt: null,
      }));
    }, { userId });
  }

  async visible(userId: string, first: number, after?: string) {
    if (!Number.isInteger(first) || first < 1 || first > 50) throw new DomainError('INVALID_PAGE_SIZE', 'first must be between 1 and 50.');
    const cursor = after ? decodeCursor(after) : null;
    return this.transactions.run(async (tx) => {
      const rows = await tx.$queryRaw<Array<NotificationRow>>`
        SELECT id, "householdId", type::text AS type, "foodId", "inventoryItemId", "createdAt", "readAt"
        FROM "Notification" WHERE "userId" = ${userId}::uuid
          AND (${cursor?.createdAt ?? null}::timestamptz IS NULL OR ("createdAt", id) < (${cursor?.createdAt ?? null}::timestamptz, ${cursor?.id ?? null}::uuid))
        ORDER BY "createdAt" DESC, id DESC LIMIT ${first + 1}`;
      const hasNextPage = rows.length > first;
      const nodes = rows.slice(0, first);
      return { nodes, pageInfo: { hasNextPage, endCursor: nodes.length ? encodeCursor(nodes[nodes.length - 1]) : null } };
    }, { userId });
  }

  async markRead(userId: string, id: string): Promise<NotificationRow> {
    return this.transactions.run(async (tx) => {
      const rows = await tx.$queryRaw<NotificationRow[]>`
        UPDATE "Notification" SET "readAt" = COALESCE("readAt", now()) WHERE id = ${id}::uuid AND "userId" = ${userId}::uuid
        RETURNING id, "householdId", type::text AS type, "foodId", "inventoryItemId", "createdAt", "readAt"`;
      if (!rows.length) throw new DomainError('NOTIFICATION_NOT_FOUND', 'Notification not found.', 404);
      return rows[0];
    }, { userId });
  }

  async registerDevice(userId: string, platform: NotificationPlatform, pushToken: string, appVersion?: string) {
    const token = pushToken.trim();
    if (token.length < 16 || token.length > 4096) throw new DomainError('INVALID_PUSH_TOKEN', 'Push token must be between 16 and 4096 characters.');
    const rows = await this.transactions.run(async (tx) => tx.$queryRaw<Array<{ id: string; platform: NotificationPlatform; appVersion: string | null; lastSeenAt: Date; revokedAt: Date | null }>>`
      INSERT INTO "UserDevice" (id, "userId", platform, "pushToken", "appVersion", "lastSeenAt", "revokedAt")
      VALUES (${newId()}::uuid, ${userId}::uuid, ${platform}::"UserDevicePlatform", ${token}, ${appVersion ?? null}, now(), NULL)
      ON CONFLICT ("pushToken") DO UPDATE SET platform = EXCLUDED.platform, "appVersion" = EXCLUDED."appVersion", "lastSeenAt" = now(), "revokedAt" = NULL
      WHERE "UserDevice"."userId" = EXCLUDED."userId"
      RETURNING id, platform::text AS platform, "appVersion", "lastSeenAt", "revokedAt"`, { userId });
    if (!rows.length) throw new DomainError('PUSH_TOKEN_IN_USE', 'This device token is already registered to another account.', 409);
    return rows[0];
  }

  async revokeDevice(userId: string, id: string): Promise<boolean> {
    const updated = await this.transactions.run(async (tx) => {
      const rows = await tx.$queryRaw<Array<{ id: string }>>`
        UPDATE "UserDevice" SET "revokedAt" = COALESCE("revokedAt", now()) WHERE id = ${id}::uuid AND "userId" = ${userId}::uuid RETURNING id`;
      if (rows.length) await tx.$executeRaw`UPDATE "NotificationDelivery" SET status = 'FAILED', "failureCode" = 'device_revoked', "claimedAt" = NULL WHERE "deviceId" = ${id}::uuid AND "userId" = ${userId}::uuid AND status = 'PENDING'`;
      return rows.length > 0;
    }, { userId });
    if (!updated) throw new DomainError('DEVICE_NOT_FOUND', 'Device not found.', 404);
    return true;
  }

  async updatePreference(userId: string, type: NotificationKind, channel: NotificationChannelName, isEnabled: boolean, quietHoursStart?: string, quietHoursEnd?: string) {
    const start = validateTime(quietHoursStart);
    const end = validateTime(quietHoursEnd);
    if ((start == null) !== (end == null) || (start && end && start === end)) throw new DomainError('INVALID_QUIET_HOURS', 'Provide both quiet-hour times, and make them different.');
    const rows = await this.transactions.run((tx) => tx.$queryRaw<Array<{ type: NotificationKind; channel: NotificationChannelName; isEnabled: boolean; quietHoursStart: string | null; quietHoursEnd: string | null; updatedAt: Date }>>`
      INSERT INTO "NotificationPreference" ("userId", type, channel, "isEnabled", "quietHoursStart", "quietHoursEnd", "updatedAt")
      VALUES (${userId}::uuid, ${type}::"NotificationType", ${channel}::"NotificationChannel", ${isEnabled}, ${start}::time, ${end}::time, now())
      ON CONFLICT ("userId", type, channel) DO UPDATE SET "isEnabled" = EXCLUDED."isEnabled", "quietHoursStart" = EXCLUDED."quietHoursStart", "quietHoursEnd" = EXCLUDED."quietHoursEnd", "updatedAt" = now()
      RETURNING type::text AS type, channel::text AS channel, "isEnabled", "quietHoursStart"::text AS "quietHoursStart", "quietHoursEnd"::text AS "quietHoursEnd", "updatedAt"`, { userId });
    return rows[0];
  }
}

export interface NotificationRow {
  id: string; householdId: string; type: NotificationKind; foodId: string | null;
  inventoryItemId: string | null; createdAt: Date; readAt: Date | null;
}

function encodeCursor(row: Pick<NotificationRow, 'id' | 'createdAt'>): string {
  return Buffer.from(JSON.stringify({ id: row.id, createdAt: row.createdAt.toISOString() })).toString('base64url');
}
function decodeCursor(value: string): { id: string; createdAt: string } {
  try {
    const decoded = Buffer.from(value, 'base64url').toString();
    const cursor = JSON.parse(decoded) as { id?: string; createdAt?: string };
    if (Buffer.from(decoded).toString('base64url') !== value || !cursor.id || !/^[0-9a-f-]{36}$/i.test(cursor.id) || !cursor.createdAt || Number.isNaN(Date.parse(cursor.createdAt))) throw new Error();
    return { id: cursor.id, createdAt: cursor.createdAt };
  } catch { throw new DomainError('INVALID_CURSOR', 'The notification cursor is invalid.'); }
}
function validateTime(value?: string): string | null {
  if (value == null || value === '') return null;
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) throw new DomainError('INVALID_QUIET_HOURS', 'Quiet-hour times must use HH:mm.');
  return `${value}:00`;
}
