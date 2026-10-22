import { Injectable } from '@nestjs/common';
import { AppConfigService } from '@/platform/config/app-config.service.js';

@Injectable()
export class LinkBuilder {
  constructor(private readonly config: AppConfigService) {}

  private url(path: string, token: string): string {
    return `${this.config.env.WEB_BASE_URL.replace(/\/$/, '')}/${path}?token=${encodeURIComponent(token)}`;
  }
  verifyEmail(token: string) { return this.url('verify-email', token); }
  resetPassword(token: string) { return this.url('reset-password', token); }
  acceptInvitation(token: string) { return this.url('accept-invitation', token); }
}
