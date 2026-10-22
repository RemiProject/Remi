import { generateKeyPairSync } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AppConfigService } from '@/platform/config/app-config.service.js';
import { NotificationFactory } from '@/modules/notifications/application/notification.factory.js';
import {
  NotificationProviderUnavailableError,
  PushDeliveryChannel,
  UnregisteredPushTokenError,
  type NotificationDeliveryInput,
} from '@/modules/notifications/application/delivery-channel.js';

const originalFetch = globalThis.fetch;
const delivery: NotificationDeliveryInput = {
  id: '10000000-0000-4000-8000-000000000001', notificationId: '10000000-0000-4000-8000-000000000002',
  userId: '10000000-0000-4000-8000-000000000003', deviceId: '10000000-0000-4000-8000-000000000004',
  channel: 'PUSH', pushToken: 'device-token-long-enough', email: 'user@example.test', language: 'ar',
  notificationType: 'EXPIRY_SOON', foodId: null, inventoryItemId: null,
  householdId: '10000000-0000-4000-8000-000000000005', attempts: 1,
};

afterEach(() => { globalThis.fetch = originalFetch; vi.restoreAllMocks(); });

function makeConfig(privateKey = 'test-private-key') {
  return { env: { FCM_PROJECT_ID: 'kitchen-test', FCM_CLIENT_EMAIL: 'service@example.test', FCM_PRIVATE_KEY: privateKey, FCM_TOKEN_URI: 'https://oauth2.googleapis.com/token' } } as unknown as AppConfigService;
}

describe('notification delivery', () => {
  it('sends FCM HTTP v1 push using a cached service-account access token and IDs only', async () => {
    const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048, privateKeyEncoding: { type: 'pkcs8', format: 'pem' }, publicKeyEncoding: { type: 'spki', format: 'pem' } });
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    globalThis.fetch = vi.fn(async (input, init) => {
      const url = String(input); calls.push({ url, init });
      if (url === 'https://oauth2.googleapis.com/token') return new Response(JSON.stringify({ access_token: 'short-lived-token', expires_in: 3600 }), { status: 200 });
      return new Response(JSON.stringify({ name: 'projects/kitchen-test/messages/123' }), { status: 200 });
    });
    const channel = new PushDeliveryChannel(makeConfig(privateKey));

    await channel.send(delivery);
    await channel.send(delivery);

    expect(calls.filter((call) => call.url.endsWith('/token'))).toHaveLength(1);
    expect(calls[1].url).toBe('https://fcm.googleapis.com/v1/projects/kitchen-test/messages:send');
    expect((calls[1].init?.headers as Record<string, string>).authorization).toBe('Bearer short-lived-token');
    const body = JSON.parse(String(calls[1].init?.body)) as { message: { token: string; notification: { title: string }; data: Record<string, string> } };
    expect(body.message.token).toBe(delivery.pushToken);
    expect(body.message.notification.title).toBe('تذكير بانتهاء الصلاحية');
    expect(body.message.data).toEqual({ notificationId: delivery.notificationId, householdId: delivery.householdId });
    expect(JSON.stringify(body)).not.toContain('allergy');
  });

  it('treats FCM unregistered tokens as revocable and provider outages as retryable', async () => {
    const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048, privateKeyEncoding: { type: 'pkcs8', format: 'pem' }, publicKeyEncoding: { type: 'spki', format: 'pem' } });
    globalThis.fetch = vi.fn(async (input) => String(input).endsWith('/token')
      ? new Response(JSON.stringify({ access_token: 'token', expires_in: 3600 }), { status: 200 })
      : new Response(JSON.stringify({ error: { details: [{ errorCode: 'UNREGISTERED' }] } }), { status: 404 }));
    await expect(new PushDeliveryChannel(makeConfig(privateKey)).send(delivery)).rejects.toBeInstanceOf(UnregisteredPushTokenError);

    globalThis.fetch = vi.fn(async (input) => String(input).endsWith('/token')
      ? new Response(JSON.stringify({ access_token: 'token', expires_in: 3600 }), { status: 200 })
      : new Response('', { status: 503 }));
    await expect(new PushDeliveryChannel(makeConfig(privateKey)).send(delivery)).rejects.toBeInstanceOf(NotificationProviderUnavailableError);
  });

  it('does not persist a duplicate notification or enqueue deliveries when push is disabled', async () => {
    const calls: string[] = [];
    const tx = {
      $queryRaw: async (strings: TemplateStringsArray) => {
        const query = strings.join('?'); calls.push(query);
        if (query.includes('INSERT INTO "Notification"')) return [{ id: delivery.notificationId }];
        if (query.includes('FROM "NotificationPreference"')) return [{ channel: 'PUSH', isEnabled: false }];
        throw new Error('unexpected query');
      },
      $executeRaw: async () => { throw new Error('delivery must not be enqueued'); },
    };
    const factory = new NotificationFactory();
    const input = { householdId: delivery.householdId, userId: delivery.userId, type: 'EXPIRY_SOON' as const, dedupeKey: 'expiry:item:deadline', foodId: delivery.foodId };

    const notificationId = await factory.create(tx as never, input);
    expect(notificationId).toMatch(/^[0-9a-f-]{36}$/i);
    expect(calls).toHaveLength(2);

    const duplicateTx = { ...tx, $queryRaw: async () => { calls.push('duplicate-insert'); return []; } };
    await expect(factory.create(duplicateTx as never, input)).resolves.toBeNull();
    expect(calls).toHaveLength(3);
  });
});
