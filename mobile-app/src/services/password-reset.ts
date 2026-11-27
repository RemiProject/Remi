import { parseResetCode } from '../domain/password-reset';
import { authOperations, type createAuthService } from './auth-service';
import { BackendError, type createBackendClient } from './backend-core';
import { failure, type RequestCodeFailure } from './email-verification';

type Client = Pick<ReturnType<typeof createBackendClient>, 'graphql'>;
type Auth = Pick<ReturnType<typeof createAuthService>, 'resetPassword'>;

// Match identity.inputs.ts, identity.types.ts and AuthResolver in the backend. All three are public: no session is sent.
export const passwordResetOperations = {
  request: authOperations.requestReset,
  verifyCode: 'mutation VerifyPasswordResetCode($input: VerifyPasswordResetCodeInput!) { verifyPasswordResetCode(input: $input) { resetToken expiresAt } }',
  reset: authOperations.reset,
} as const;

export type ResetRequestResult = { ok: true } | { ok: false; reason: RequestCodeFailure };
export type ResetCodeResult = { ok: true; resetToken: string; expiresAt: number } | { ok: false; reason: RequestCodeFailure | 'invalidCode' };
export type ResetPasswordFailure = RequestCodeFailure | 'expired' | 'weakPassword';
export type ResetPasswordResult = { ok: true } | { ok: false; reason: ResetPasswordFailure };

/** For resetPassword. A weak password is refused by the API's input check (BAD_REQUEST) or by the handler (WEAK_PASSWORD). */
export function resetFailure(error: unknown): ResetPasswordFailure {
  if (error instanceof BackendError) {
    if (error.codes.includes('INVALID_OR_EXPIRED_TOKEN')) return 'expired';
    if (error.codes.includes('WEAK_PASSWORD') || error.codes.includes('BAD_REQUEST')) return 'weakPassword';
  }
  return failure(error);
}

/**
 * `auth` is the auth service: its resetPassword also clears any session saved on this device once the server confirms,
 * because the server revokes every session of the account.
 */
export function createPasswordResetService(client: Client, auth: Auth) {
  return {
    /** `ok` means the server accepted the request, not that mail was sent: it answers the same for every email. */
    async requestPasswordReset(email: string): Promise<ResetRequestResult> {
      try {
        const result = await client.graphql<{ requestPasswordReset: boolean }>(passwordResetOperations.request, { input: { email: email.trim() } });
        return result.requestPasswordReset === true ? { ok: true } : { ok: false, reason: 'error' };
      } catch (error) { return { ok: false, reason: failure(error) }; }
    },
    /** A malformed code is refused here, without a request. `expiresAt` is in milliseconds. */
    async verifyPasswordResetCode(email: string, code: string): Promise<ResetCodeResult> {
      const digits = parseResetCode(code);
      if (digits === null) return { ok: false, reason: 'invalidCode' };
      try {
        const result = await client.graphql<{ verifyPasswordResetCode: { resetToken: string; expiresAt: string } }>(passwordResetOperations.verifyCode,
          { input: { email: email.trim(), code: digits } });
        const token = result.verifyPasswordResetCode?.resetToken;
        const expiresAt = Date.parse(result.verifyPasswordResetCode?.expiresAt ?? '');
        return typeof token === 'string' && token && Number.isFinite(expiresAt) ? { ok: true, resetToken: token, expiresAt } : { ok: false, reason: 'error' };
      } catch (error) {
        if (error instanceof BackendError && error.codes.includes('INVALID_PASSWORD_RESET_CODE')) return { ok: false, reason: 'invalidCode' };
        return { ok: false, reason: failure(error) };
      }
    },
    async resetPassword(token: string, newPassword: string): Promise<ResetPasswordResult> {
      try {
        await auth.resetPassword(token, newPassword);
        return { ok: true };
      } catch (error) { return { ok: false, reason: resetFailure(error) }; }
    },
  };
}
