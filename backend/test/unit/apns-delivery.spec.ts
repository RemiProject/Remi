import { EventEmitter } from 'node:events';
import { createVerify, generateKeyPairSync } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import type { AppConfigService } from '@/platform/config/app-config.service.js';

const sent: Array<{ host: string; headers: Record<string, string>; body: string }> = [];
let reply = { status: 200, body: '' };
vi.mock('node:http2', () => ({
  connect: (host: string) => {
    const session = Object.assign(new EventEmitter(), { close: () => undefined, request: (headers: Record<string, string>) => {
      const request = Object.assign(new EventEmitter(), {
        setTimeout: () => request, close: () => undefined, setEncoding: () => request,
        end: (body: string) => { sent.push({ host, headers, body }); queueMicrotask(() => { request.emit('response', { ':status': reply.status }); if (reply.body) request.emit('data', reply.body); request.emit('end'); }); },
      });
      return request;
    } });
    return session;
  },
}));
const { PushDeliveryChannel, UnregisteredPushTokenError, NotificationProviderUnavailableError, isApnsToken } = await import('@/modules/notifications/application/delivery-channel.js');

const token = 'a'.repeat(64);
const delivery = { id: 'd', notificationId: 'n-1', userId: 'u', deviceId: 'dev', channel: 'PUSH' as const, pushToken: token, email: 'x@example.test', language: 'en',
  notificationType: 'EXPIRY_SOON', foodId: null, inventoryItemId: null, householdId: 'h-1', attempts: 1 };
const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'P-256', privateKeyEncoding: { type: 'pkcs8', format: 'pem' }, publicKeyEncoding: { type: 'spki', format: 'pem' } });
const config = (env: Record<string, unknown>) => ({ env: { APNS_TOPIC: 'com.remi.cookbook.independent', APNS_SANDBOX: true, ...env } }) as unknown as AppConfigService;

describe('APNs delivery', () => {
  it('tells APNs tokens from FCM tokens', () => {
    expect(isApnsToken(token)).toBe(true);
    expect(isApnsToken('fcm:APA91b' + 'x'.repeat(140))).toBe(false);
  });

  it('sends an alert to the sandbox with a verifiable ES256 provider token, and reuses it', async () => {
    const channel = new PushDeliveryChannel(config({ APNS_KEY_ID: 'KEY123', APNS_TEAM_ID: 'TEAM123', APNS_PRIVATE_KEY: privateKey }));
    await channel.send(delivery); await channel.send(delivery);
    expect(sent).toHaveLength(2);
    const [first, second] = sent;
    expect(first.host).toBe('https://api.sandbox.push.apple.com');
    expect(first.headers[':path']).toBe(`/3/device/${token}`);
    expect(first.headers['apns-topic']).toBe('com.remi.cookbook.independent');
    expect(second.headers.authorization).toBe(first.headers.authorization);
    const [header, claims, signature] = first.headers.authorization.replace('bearer ', '').split('.');
    expect(JSON.parse(Buffer.from(header, 'base64url').toString())).toEqual({ alg: 'ES256', kid: 'KEY123' });
    expect(JSON.parse(Buffer.from(claims, 'base64url').toString()).iss).toBe('TEAM123');
    expect(createVerify('SHA256').update(`${header}.${claims}`).verify({ key: publicKey, dsaEncoding: 'ieee-p1363' }, Buffer.from(signature, 'base64url'))).toBe(true);
    expect(JSON.parse(first.body)).toMatchObject({ aps: { alert: { title: 'Expiry reminder' } }, notificationId: 'n-1', householdId: 'h-1' });
  });

  it('maps an unregistered token and a missing key to the worker errors', async () => {
    reply = { status: 410, body: '{"reason":"Unregistered"}' };
    await expect(new PushDeliveryChannel(config({ APNS_KEY_ID: 'K', APNS_TEAM_ID: 'T', APNS_PRIVATE_KEY: privateKey })).send(delivery)).rejects.toBeInstanceOf(UnregisteredPushTokenError);
    await expect(new PushDeliveryChannel(config({})).send(delivery)).rejects.toBeInstanceOf(NotificationProviderUnavailableError);
  });
});
