import { Injectable } from '@nestjs/common';
import { createSign } from 'node:crypto';
import { AppConfigService } from '@/platform/config/app-config.service.js';
import { MailService } from '@/platform/mail/mail.service.js';

export interface NotificationDeliveryInput {
  id: string; notificationId: string; userId: string; deviceId: string | null; channel: 'PUSH' | 'EMAIL';
  pushToken: string | null; email: string; language: string; notificationType: string;
  foodId: string | null; inventoryItemId: string | null; householdId: string; attempts: number;
}

export interface DeliveryChannel {
  readonly channel: 'PUSH' | 'EMAIL';
  send(delivery: NotificationDeliveryInput): Promise<void>;
}

export class NotificationProviderUnavailableError extends Error {
  constructor(readonly code: string) { super(code); }
}
export class UnregisteredPushTokenError extends Error {}

const copy: Record<string, { en: string; ar: string }> = {
  EXPIRY_SOON: { en: 'An item is nearing its expiry date.', ar: 'يوجد صنف يقترب موعد انتهاء صلاحيته.' },
  LOW_STOCK: { en: 'An item in your kitchen is running low.', ar: 'أحد أصناف مطبخك أوشك على النفاد.' },
  RECOMMENDATION_READY: { en: 'A new kitchen recommendation is ready.', ar: 'هناك توصية جديدة لمطبخك.' },
  SAFETY_REVIEW: { en: 'A kitchen item needs a safety review.', ar: 'يوجد صنف يحتاج إلى مراجعة السلامة.' },
  PURCHASE_RECEIVED: { en: 'A purchase was added to your kitchen.', ar: 'تمت إضافة مشتريات إلى مطبخك.' },
  MEMBER_CHANGED: { en: 'Your household membership changed.', ar: 'حدث تغيير في أعضاء المنزل.' },
};

const pushCopy: Record<string, { en: string; ar: string }> = {
  EXPIRY_SOON: { en: 'Expiry reminder', ar: 'تذكير بانتهاء الصلاحية' },
  LOW_STOCK: { en: 'Low stock reminder', ar: 'تذكير بنقص المخزون' },
  RECOMMENDATION_READY: { en: 'A recommendation is ready', ar: 'توصية جديدة جاهزة' },
  SAFETY_REVIEW: { en: 'Safety review needed', ar: 'مراجعة السلامة مطلوبة' },
  PURCHASE_RECEIVED: { en: 'Purchase received', ar: 'تم استلام مشتريات' },
  MEMBER_CHANGED: { en: 'Household update', ar: 'تحديث في المنزل' },
};

@Injectable()
export class EmailDeliveryChannel implements DeliveryChannel {
  readonly channel = 'EMAIL' as const;
  constructor(private readonly mail: MailService) {}
  async send(delivery: NotificationDeliveryInput): Promise<void> {
    if (!this.mail.isConfigured) throw new NotificationProviderUnavailableError('smtp_not_configured');
    const language = delivery.language === 'ar' ? 'ar' : 'en';
    const message = copy[delivery.notificationType] ?? copy.RECOMMENDATION_READY;
    await this.mail.send({ to: delivery.email, template: 'notification', lang: language, vars: { message: message[language] } });
  }
}

@Injectable()
export class PushDeliveryChannel implements DeliveryChannel {
  readonly channel = 'PUSH' as const;
  private accessToken?: { value: string; expiresAt: number };

  constructor(private readonly config: AppConfigService) {}

  async send(delivery: NotificationDeliveryInput): Promise<void> {
    const { FCM_PROJECT_ID: projectId, FCM_CLIENT_EMAIL: clientEmail, FCM_PRIVATE_KEY: privateKey, FCM_TOKEN_URI: tokenUri } = this.config.env;
    if (!delivery.pushToken) throw new UnregisteredPushTokenError();
    if (!projectId || !clientEmail || !privateKey) throw new NotificationProviderUnavailableError('push_provider_not_configured');

    const token = await this.getAccessToken(clientEmail, privateKey, tokenUri);
    const language = delivery.language === 'ar' ? 'ar' : 'en';
    const message = pushCopy[delivery.notificationType] ?? pushCopy.RECOMMENDATION_READY;
    const response = await fetch(`https://fcm.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/messages:send`, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json; charset=utf-8' },
      body: JSON.stringify({ message: {
        token: delivery.pushToken,
        notification: { title: message[language], body: language === 'ar' ? 'افتح التطبيق لعرض التفاصيل.' : 'Open the app to view details.' },
        data: { notificationId: delivery.notificationId, householdId: delivery.householdId },
      } }),
      signal: AbortSignal.timeout(10_000),
    });
    if (response.ok) return;
    const body = await response.text();
    if (response.status === 404 && body.includes('UNREGISTERED')) throw new UnregisteredPushTokenError();
    throw new NotificationProviderUnavailableError(response.status === 429 || response.status >= 500 ? 'fcm_temporarily_unavailable' : 'fcm_rejected_request');
  }

  private async getAccessToken(clientEmail: string, privateKey: string, tokenUri: string): Promise<string> {
    if (this.accessToken && this.accessToken.expiresAt > Date.now() + 60_000) return this.accessToken.value;
    const now = Math.floor(Date.now() / 1000);
    const header = encodeBase64Url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
    const claims = encodeBase64Url(JSON.stringify({ iss: clientEmail, scope: 'https://www.googleapis.com/auth/firebase.messaging', aud: tokenUri, iat: now, exp: now + 3600 }));
    const unsigned = `${header}.${claims}`;
    const signer = createSign('RSA-SHA256');
    signer.update(unsigned);
    const assertion = `${unsigned}.${signer.sign(privateKey.replace(/\\n/g, '\n')).toString('base64url')}`;
    const response = await fetch(tokenUri, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) throw new NotificationProviderUnavailableError('fcm_auth_failed');
    const result = await response.json() as { access_token?: string; expires_in?: number };
    if (!result.access_token) throw new NotificationProviderUnavailableError('fcm_auth_failed');
    this.accessToken = { value: result.access_token, expiresAt: Date.now() + (result.expires_in ?? 3600) * 1000 };
    return result.access_token;
  }
}

function encodeBase64Url(value: string): string { return Buffer.from(value).toString('base64url'); }
