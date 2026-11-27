import { parseEmailCode } from '../domain/email-verification';
import { BackendError, type createBackendClient } from './backend-core';

type Client = Pick<ReturnType<typeof createBackendClient>, 'graphql'>;

// Match identity.inputs.ts and AuthResolver in the backend. Both are public: no session is sent.
export const emailVerificationOperations = {
  requestCode: 'mutation RequestEmailVerificationCode($input: RequestEmailVerificationCodeInput!) { requestEmailVerificationCode(input: $input) }',
  verifyCode: 'mutation VerifyEmailCode($input: VerifyEmailCodeInput!) { verifyEmailCode(input: $input) }',
} as const;

export type RequestCodeFailure = 'rateLimited' | 'network' | 'error';
export type VerifyCodeFailure = RequestCodeFailure | 'invalidCode';
export type RequestCodeResult = { ok: true } | { ok: false; reason: RequestCodeFailure };
export type VerifyCodeResult = { ok: true } | { ok: false; reason: VerifyCodeFailure };

/** Shared with services/password-reset.ts. */
export function failure(error: unknown): RequestCodeFailure {
  if (!(error instanceof BackendError)) return 'error';
  if (error.codes.includes('TOO_MANY_REQUESTS') || error.status === 429) return 'rateLimited';
  // Unreachable server (no HTTP status or a 5xx), as in auth-service.
  return !error.codes.length && (error.status === undefined || error.status >= 500) ? 'network' : 'error';
}

export function createEmailVerificationService(client: Client) {
  return {
    /** `ok` means the server accepted the request, not that mail was sent: it answers the same for unknown, verified and rate-limited accounts. */
    async requestEmailVerificationCode(email: string): Promise<RequestCodeResult> {
      try {
        const result = await client.graphql<{ requestEmailVerificationCode: boolean }>(emailVerificationOperations.requestCode,
          { input: { email: email.trim() } });
        return result.requestEmailVerificationCode === true ? { ok: true } : { ok: false, reason: 'error' };
      } catch (error) { return { ok: false, reason: failure(error) }; }
    },
    /** A malformed code is rejected here, without a request. */
    async verifyEmailCode(email: string, code: string): Promise<VerifyCodeResult> {
      const digits = parseEmailCode(code);
      if (digits === null) return { ok: false, reason: 'invalidCode' };
      try {
        const result = await client.graphql<{ verifyEmailCode: boolean }>(emailVerificationOperations.verifyCode,
          { input: { email: email.trim(), code: digits } });
        return result.verifyEmailCode === true ? { ok: true } : { ok: false, reason: 'error' };
      } catch (error) {
        if (error instanceof BackendError && error.codes.includes('INVALID_EMAIL_VERIFICATION_CODE')) return { ok: false, reason: 'invalidCode' };
        return { ok: false, reason: failure(error) };
      }
    },
  };
}
