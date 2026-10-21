import { vi } from 'vitest';

/** Transaction runner fake: runs the callback with a dummy tx. */
export const fakeTx = () => ({ db: {} as any, run: vi.fn(async (fn: (tx: any) => any) => fn({})) });
export const fakeConfig = (over: Record<string, unknown> = {}) =>
  ({ env: { EMAIL_VERIFY_TTL_HOURS: 24, PASSWORD_RESET_TTL_MIN: 30, INVITATION_TTL_DAYS: 7, EMAIL_VERIFICATION_REQUIRED: false, WEB_BASE_URL: 'http://web', ...over } }) as any;
