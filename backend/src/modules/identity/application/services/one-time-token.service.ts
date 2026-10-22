import { Injectable } from '@nestjs/common';
import { newId } from '@/shared/ids.js';
import { AppConfigService } from '@/platform/config/app-config.service.js';
import type { NewToken, TokenPurpose } from '@/modules/identity/domain/entities/identity.records.js';
import { generateRawToken, hashToken } from '@/modules/identity/domain/services/token-hash.js';

export interface IssuedToken { raw: string; row: NewToken }

@Injectable()
export class OneTimeTokenService {
  constructor(private readonly config: AppConfigService) {}

  private ttlMs(purpose: TokenPurpose): number {
    const e = this.config.env;
    switch (purpose) {
      case 'EMAIL_VERIFY': return e.EMAIL_VERIFY_TTL_HOURS * 3_600_000;
      case 'PASSWORD_RESET': return e.PASSWORD_RESET_TTL_MIN * 60_000;
      case 'HOUSEHOLD_INVITATION': return e.INVITATION_TTL_DAYS * 86_400_000;
    }
  }

  /** Generates raw + hash + expiry. Nothing is persisted here: the caller inserts `row` inside its own TX. */
  issue(purpose: TokenPurpose, userId: string | null, now: Date = new Date()): IssuedToken {
    const raw = generateRawToken();
    return { raw, row: { id: newId(), userId, purpose, tokenHash: hashToken(raw), expiresAt: new Date(now.getTime() + this.ttlMs(purpose)) } };
  }
}
